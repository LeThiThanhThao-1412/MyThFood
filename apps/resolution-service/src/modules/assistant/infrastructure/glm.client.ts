import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import {
  AssistantLlmClient,
  LlmInlineImage,
  LlmJsonRequest,
  LlmJsonResponse,
  LlmUsage,
} from "./llm.types";
import {
  envNumber,
  isRetryableStatus,
  retryDelayMs,
  shorten,
  sleep,
} from "./llm.retry";

/**
 * Mã lỗi nghiệp vụ của GLM (Zhipu) nằm trong `error.code` của body.
 *
 * - `1113` tài khoản không có gói/quota cho model này (model trả phí)
 * - `1211` model không tồn tại (bị gỡ hoặc sai tên)
 * - `1210` nội dung gửi lên sai kiểu (vd model chữ nhận `image_url`)
 */
const GLM_NO_BALANCE = "1113";
const GLM_MODEL_MISSING = "1211";
const GLM_BAD_CONTENT_TYPE = "1210";

/**
 * Mã lỗi "model đang quá tải" của GLM — **tạm thời**, khác hẳn 1113 (không có
 * gói/quota). Đo thật 10/2026: model vision free trả liên tục
 *
 * - `1305` `该模型当前访问量过大，请您稍后再试` (model free đông người dùng)
 * - `1302` `您的账户已达到速率限制` (bấm "Phân tích" quá nhanh)
 *
 * Backoff mũ vài giây KHÔNG đủ cho hai mã này ⇒ phải chờ dài (`GLM_OVERLOAD_RETRY_MS`)
 * rồi thử lại, trước khi bỏ ảnh.
 */
const GLM_OVERLOAD_CODES = ["1302", "1305"];

/**
 * Model vision dự phòng mặc định khi model chính quá tải.
 *
 * `glm-4.6v-flash` là bản **free** ⇒ hay 1305; `glm-4.6v-flashx` là bản trả phí
 * rẻ cùng thế hệ (nhanh, ít nghẽn). Nếu tài khoản không có gói cho flashx, GLM
 * trả 1113 và client tự chuyển tiếp model kế tiếp trong chuỗi.
 */
const DEFAULT_VISION_FALLBACKS = ["glm-4.6v-flashx", "glm-4.5v"];

/** Bytes thật của ảnh từ chuỗi base64 (base64 ≈ 4/3 bytes gốc). */
function estimateBase64Bytes(base64: string): number {
  const clean = (base64 ?? "").length;
  const padding = base64?.endsWith("==") ? 2 : base64?.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((clean * 3) / 4) - padding);
}

/** Dung lượng dễ đọc cho log ("3.4MB", "820KB"). */
function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/**
 * Client gọi GLM của Zhipu/Z.ai qua API tương thích OpenAI:
 * `POST {apiBase}/chat/completions` + header `Authorization: Bearer <key>`.
 *
 * Vì sao đổi từ Gemini sang GLM (đo thật 10/2026):
 * - Gemini: `gemini-3.8-flash`/`3.7-flash`/`flash-latest` liên tục trả **503
 *   "high demand"**, `gemini-pro-latest` **429** hết quota, `2.5-flash`/**404**
 *   (Google khoá với tài khoản mới) ⇒ demo rất dễ gãy.
 * - GLM: key hiện có dùng được model **free**: `glm-4.5-flash` (chữ) và
 *   `glm-4.6v-flash` (chữ + ảnh); cả hai đều trả **200** kèm JSON hợp lệ khi bật
 *   `response_format: json_object`.
 *
 * Ảnh bằng chứng: GLM tách model chữ và model vision (model chữ trả `1210` nếu
 * nhận ảnh) ⇒ client tự chọn model theo dữ liệu vào; nếu model vision hỏng thì
 * vẫn cố phân tích bằng model chữ và ghi chú lại cho admin.
 */
@Injectable()
export class GlmClient implements AssistantLlmClient {
  private readonly logger = new Logger(GlmClient.name);

  constructor(private readonly httpService: HttpService) {}

  readonly provider = "glm";

  /** Tên biến môi trường chứa key — hiển thị ở `/assistant/health`. */
  readonly apiKeyEnv = "GLM_API_KEY";

  get apiKey(): string {
    return (process.env.GLM_API_KEY ?? "").trim();
  }

  get hasApiKey(): boolean {
    return this.apiKey.length > 0;
  }

  /** Model cho dữ liệu **chữ** (mặc định model free của GLM). */
  get model(): string {
    return (process.env.GLM_MODEL ?? "").trim() || "glm-4.5-flash";
  }

  /**
   * Model nhận **ảnh** bằng chứng.
   *
   * Đặt `GLM_VISION_MODEL=none` để tắt hẳn phần ảnh (không tốn lượt gọi nào).
   * Đo thật 10/2026: `glm-4.6v-flash` đọc ảnh + trả JSON tốt với prompt ngắn,
   * nhưng với prompt schema lớn của module thì hay trả JSON lỗi — nên client luôn
   * có đường lùi "bỏ ảnh, phân tích bằng model chữ" và ghi chú lại cho admin.
   */
  get visionModel(): string | undefined {
    const raw = (process.env.GLM_VISION_MODEL ?? "").trim();
    if (raw.toLowerCase() === "none") return undefined;
    return raw || "glm-4.6v-flash";
  }

  get apiBase(): string {
    const raw =
      (process.env.GLM_API_BASE ?? "").trim() ||
      "https://open.bigmodel.cn/api/paas/v4";
    return raw.replace(/\/+$/, "");
  }

  get enabled(): boolean {
    return (
      (process.env.AI_ASSISTANT_ENABLED ?? "false").trim().toLowerCase() ===
      "true"
    );
  }

  get maxEvidenceImages(): number {
    return envNumber("AI_ASSISTANT_MAX_IMAGES", 4, 0, 8);
  }

  private get timeoutMs(): number {
    return envNumber("GLM_TIMEOUT_MS", 120000, 1000);
  }

  /** Số lần gọi **mỗi** model (tính cả lần đầu). */
  get maxAttempts(): number {
    return envNumber("GLM_MAX_ATTEMPTS", 3, 1, 6);
  }

  /** Chờ cơ sở giữa 2 lần thử (ms) — tăng theo cấp số nhân. */
  get retryBaseMs(): number {
    return envNumber("GLM_RETRY_BASE_MS", 1500, 0, 30000);
  }

  /**
   * Chế độ suy nghĩ của GLM (`thinking`).
   *
   * `disabled` = trả lời ngay (nhanh, không tốn token cho phần suy luận);
   * `enabled` = bật suy luận dài (kỹ hơn, chậm hơn); mặc định `auto` = để model
   * quyết định (không gửi tham số).
   */
  get thinking(): "auto" | "disabled" | "enabled" {
    const raw = (process.env.GLM_THINKING ?? "").trim().toLowerCase();
    if (raw === "disabled" || raw === "enabled") return raw;
    return "auto";
  }

  /**
   * Model dự phòng khi model chính **không dùng được** (hết quota/không tồn tại).
   *
   * Mặc định **không có** (`none`): model vision free (`glm-4.6v-flash`) không làm
   * nổi schema lớn — đo thật cho ra JSON hỏng, nên không đưa nó vào chuỗi dự phòng
   * của đường chữ. Muốn bật lại: `GLM_FALLBACK_MODELS=glm-4.6v-flash`.
   */
  get fallbackModels(): string[] {
    const raw = (process.env.GLM_FALLBACK_MODELS ?? "").trim();
    if (!raw || raw.toLowerCase() === "none") return [];
    return raw
      .split(",")
      .map((m) => m.trim())
      .filter((m) => m.length > 0);
  }

  /**
   * Model **đọc ảnh** dự phòng — chỉ dùng cho lượt có ảnh.
   *
   * Vì sao tách khỏi `GLM_FALLBACK_MODELS`: model chữ KHÔNG nhận ảnh (trả 1210),
   * nên không thể nằm chung chuỗi với model vision. Mặc định
   * `glm-4.6v-flashx,glm-4.5v`; đặt `none` để tắt (chỉ dùng đúng
   * `GLM_VISION_MODEL`).
   */
  get visionFallbackModels(): string[] {
    const raw = (process.env.GLM_VISION_FALLBACK_MODELS ?? "").trim();
    if (raw.toLowerCase() === "none") return [];
    const list = raw
      ? raw.split(",").map((m) => m.trim())
      : [...DEFAULT_VISION_FALLBACKS];
    return [...new Set(list.filter((m) => m.length > 0))];
  }

  /** Chuỗi model cho lượt đọc ảnh: model cấu hình trước, rồi model dự phòng. */
  get visionModelChain(): string[] {
    const primary = this.visionModel;
    if (!primary) return [];
    return [primary, ...this.visionFallbackModels.filter((m) => m !== primary)];
  }

  /**
   * Chờ bao lâu trước khi thử lại khi model **quá tải** (1302/1305).
   *
   * Model free của GLM nghẽn theo từng đợt; chờ 8s (mặc định) hiệu quả hơn
   * nhiều so với backoff 1.5s/3s — trước đây bỏ ảnh chỉ sau ~5s.
   */
  get overloadRetryMs(): number {
    return envNumber("GLM_OVERLOAD_RETRY_MS", 8000, 0, 30000);
  }

  /** Số lần thử **thêm** khi gặp lỗi quá tải (mặc định 2 ⇒ tổng ~16s chờ). */
  get overloadAttempts(): number {
    return envNumber("GLM_OVERLOAD_ATTEMPTS", 2, 0, 4);
  }

  /** Ném lỗi rõ ràng nếu assistant chưa được cấu hình. */
  assertReady(): void {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        "Trợ lý AI đang tắt (AI_ASSISTANT_ENABLED=false).",
      );
    }
    if (!this.hasApiKey) {
      throw new ServiceUnavailableException(
        "Thiếu GLM_API_KEY — thêm key vào .env rồi restart service.",
      );
    }
  }

  async generateJson<T>(request: LlmJsonRequest): Promise<LlmJsonResponse<T>> {
    this.assertReady();

    const images = request.images ?? [];
    const visionChain = this.visionModelChain;

    // Không có ảnh ⇒ đường chữ thuần.
    if (images.length === 0) {
      return {
        ...(await this.callWithJsonRetry<T>(request, [], false)),
        imagesUsed: 0,
      };
    }

    // Tắt hẳn phần ảnh (GLM_VISION_MODEL=none) ⇒ không gọi mạng vô ích.
    if (visionChain.length === 0) {
      return this.withImageNote(
        {
          ...(await this.callWithJsonRetry<T>(
            { ...request, images: [] },
            [],
            false,
          )),
          imagesUsed: 0,
          imageFailure: {
            reason: "VISION_DISABLED",
            detail: "GLM_VISION_MODEL=none",
            modelsTried: [],
            retryable: false,
          },
        },
        images.length,
        "chưa bật model vision (GLM_VISION_MODEL=none)",
      );
    }

    // Dung lượng thật gửi lên (base64 ≈ 4/3 bytes gốc) — ghi vào log khi lỗi để
    // phân biệt "ảnh quá lớn" với "model quá tải".
    const totalBytes = images.reduce(
      (sum, image) => sum + estimateBase64Bytes(image.base64),
      0,
    );

    try {
      const response = await this.callWithJsonRetry<T>(request, images, true);
      const notes = [...(response.notes ?? [])];
      // Đọc ảnh bằng model dự phòng: nói rõ để admin biết model chính đang lỗi
      // (nếu không, lần sau bấm lại vẫn thấy ảnh được đọc mà không hiểu vì sao
      // lúc trước mất ảnh).
      if (response.model !== visionChain[0]) {
        notes.push(
          `Ảnh bằng chứng được đọc bằng model dự phòng "${response.model}" ` +
            `(model chính "${visionChain[0]}" đang quá tải/lỗi).`,
        );
      }
      return { ...response, imagesUsed: images.length, notes };
    } catch (err: any) {
      // Ảnh bằng chứng là phần *bổ trợ*: model vision hỏng (quá tải, bị gỡ,
      // trả JSON lỗi...) không nên làm mất luôn cả kết quả phân tích. Nhưng
      // KHÔNG được im lặng: log mức `error` + trả `imageFailure` để UI hướng
      // dẫn admin đúng cách (chờ rồi bấm lại / đổi model / kiểm tra cấu hình).
      if (this.isKeyProblem(err)) throw err;

      const detail = this.describeError(err);
      const overloaded = this.isOverloadError(err);
      const reason = overloaded ? "VISION_OVERLOADED" : "VISION_ERROR";
      const waitHint = overloaded
        ? ` — model đọc ảnh đang quá tải, đợi 30–60 giây rồi bấm "Phân tích lại"`
        : ` — kiểm tra GLM_VISION_MODEL/GLM_VISION_FALLBACK_MODELS`;

      this.logger.error(
        `GLM vision thất bại — bỏ ${images.length} ảnh ` +
          `(${formatBytes(totalBytes)}, models: ${visionChain.join(" → ")}, ` +
          `lỗi ${detail}): ${shorten(err?.message ?? "unknown", 200)}`,
      );

      return this.withImageNote(
        {
          ...(await this.callWithJsonRetry<T>(
            { ...request, images: [] },
            [],
            false,
          )),
          imagesUsed: 0,
          imageFailure: {
            reason,
            detail: `${detail}${
              err?.message ? ` ${shorten(err.message, 160)}` : ""
            }`,
            modelsTried: visionChain,
            retryable: overloaded,
          },
        },
        images.length,
        `model vision "${visionChain.join(" → ")}" lỗi ${detail}` +
          `${err?.message ? `: ${shorten(err.message)}` : ""}${waitHint}`,
      );
    }
  }

  /**
   * Gọi model; nếu model trả **JSON hỏng** thì thử lại **một lần** với:
   * tắt "thinking" (đỡ tốn token cho phần suy luận) + nhắc chỉ trả JSON.
   *
   * Lỗi mạng/quota/model thì KHÔNG thử kiểu này (đã có tầng retry/đổi model riêng).
   */
  private async callWithJsonRetry<T>(
    request: LlmJsonRequest,
    images: LlmInlineImage[],
    useVision: boolean,
  ): Promise<LlmJsonResponse<T>> {
    try {
      return await this.callModels<T>(request, images, useVision);
    } catch (err: any) {
      if (!this.isJsonError(err)) throw err;

      this.logger.warn(
        "Model trả JSON không hợp lệ — thử lại 1 lần với “chỉ JSON” và tắt thinking.",
      );
      return this.callModels<T>(request, images, useVision, {
        strictJson: true,
        noThinking: true,
      });
    }
  }

  /** Lỗi nội dung do JSON hỏng/model không trả nội dung — đánh dấu để chỉ retry đúng loại này. */
  private jsonError(message: string): BadGatewayException {
    const error = new BadGatewayException(message) as BadGatewayException & {
      isJsonError?: boolean;
    };
    error.isJsonError = true;
    return error;
  }

  /** Chỉ retry khi đúng là lỗi nội dung JSON (không retry lỗi 1210/timeout...). */
  private isJsonError(err: any): boolean {
    return err?.isJsonError === true;
  }

  /** Gắn ghi chú "đã bỏ ảnh" (đi thẳng vào `warnings` cho admin đọc). */
  private withImageNote<T>(
    response: LlmJsonResponse<T>,
    skippedImages: number,
    reason: string,
  ): LlmJsonResponse<T> {
    return {
      ...response,
      notes: [
        ...(response.notes ?? []),
        `Không phân tích ${skippedImages} ảnh bằng chứng (${reason}) — gợi ý dưới đây chỉ dựa trên dữ liệu chữ.`,
      ],
    };
  }

  /** Thử lần lượt các model trong chuỗi: model chính trước, rồi tới model dự phòng. */
  private async callModels<T>(
    request: LlmJsonRequest,
    images: LlmInlineImage[],
    useVision: boolean,
    options: { strictJson?: boolean; noThinking?: boolean } = {},
  ): Promise<LlmJsonResponse<T>> {
    const primary = useVision ? (this.visionModel ?? this.model) : this.model;
    // Lượt ảnh dùng chuỗi **vision** (model chữ trả 1210 nếu nhận ảnh), lượt chữ
    // dùng `GLM_FALLBACK_MODELS`.
    const chain = [
      primary,
      ...(useVision ? this.visionModelChain : this.fallbackModels).filter(
        (m) => m !== primary,
      ),
    ];
    const endpoint = `${this.apiBase}/chat/completions`;
    let lastError: any = null;

    for (let index = 0; index < chain.length; index += 1) {
      const model: string = chain[index] ?? primary;
      const isLastModel = index === chain.length - 1;

      let response: any;
      try {
        response = await this.postWithRetry(
          model,
          endpoint,
          this.buildBody(model, request, images, options),
        );
      } catch (err: any) {
        lastError = err;

        // Key sai/bị thu hồi ⇒ lỗi cấu hình: đổi model cũng vô ích.
        if (this.isKeyProblem(err)) {
          throw this.toHttpException(err, chain.slice(0, index + 1), useVision);
        }

        const nextModelUsable = this.shouldTryNextModel(err);
        if (isLastModel || !nextModelUsable) {
          throw this.toHttpException(err, chain.slice(0, index + 1), useVision);
        }

        this.logger.warn(
          `GLM "${model}" không dùng được (${this.describeError(err)}) — ` +
            `chuyển sang model dự phòng "${chain[index + 1]}".`,
        );
        continue;
      }

      // Lỗi *nội dung* (JSON hỏng, model trả rỗng) thì KHÔNG đổi model: đổi
      // model không chắc sửa được mà lại tốn thêm token.
      const payload = response?.data ?? {};
      const finishReason = payload?.choices?.[0]?.finish_reason;
      const rawText = this.extractContent(payload, model);

      return {
        data: this.parseJson<T>(rawText, model, finishReason),
        rawText,
        model,
        endpoint,
        usage: this.toUsage(payload),
      };
    }

    throw this.toHttpException(lastError, chain, useVision);
  }

  /** Dựng body theo chuẩn OpenAI chat/completions mà GLM đang dùng. */
  private buildBody(
    model: string,
    request: LlmJsonRequest,
    images: LlmInlineImage[],
    options: { strictJson?: boolean; noThinking?: boolean } = {},
  ): Record<string, unknown> {
    const userContent = images.length
      ? [
          { type: "text", text: request.prompt },
          // Nhãn TRƯỚC mỗi ảnh để model biết ảnh đó của bên nào.
          ...images.flatMap((image, index) => [
            {
              type: "text",
              text: `ẢNH ${index + 1}${image.label ? ` — ${image.label}` : ""}`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${image.mimeType};base64,${image.base64}`,
              },
            },
          ]),
        ]
      : request.prompt;

    const system = options.strictJson
      ? `${this.withSchemaHint(request)}\n\n` +
        "LẦN TRƯỚC BẠN ĐÃ TRẢ JSON KHÔNG HỢP LỆ. Lần này chỉ trả về DUY NHẤT một object JSON " +
        "hợp lệ: không markdown, không giải thích, không bỏ dở giữa chừng, không thêm chữ ngoài JSON."
      : this.withSchemaHint(request);

    const thinking = this.thinkingParam(images, options);

    return {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxOutputTokens ?? 4096,
      // JSON cứng: prompt của module đã yêu cầu "chỉ trả về JSON" nên GLM nhận.
      response_format: { type: "json_object" },
      ...(thinking ? { thinking } : {}),
    };
  }

  /**
   * Tham số `thinking` gửi lên GLM.
   *
   * - Lượt **có ảnh**: mặc định tắt thinking — model vision free hay "suy nghĩ"
   *   dài rồi bị cắt token ⇒ JSON cụt (đo thật: trả nội dung không phải JSON).
   * - Lượt **thử lại vì JSON hỏng**: luôn tắt thinking.
   * - Còn lại: theo `GLM_THINKING` (`auto` ⇒ không gửi tham số).
   */
  private thinkingParam(
    images: LlmInlineImage[],
    options: { noThinking?: boolean },
  ): { type: string } | null {
    if (options.noThinking) return { type: "disabled" };
    if (images.length > 0 && this.thinking === "auto")
      return { type: "disabled" };
    if (this.thinking === "auto") return null;
    return { type: this.thinking };
  }

  /**
   * Thêm danh sách field của JSON Schema vào system instruction.
   *
   * Gemini ép schema ở phía server (`responseSchema`), còn `json_object` của GLM
   * chỉ bảo đảm "JSON hợp lệ": thiếu danh sách field thì model hay trả thiếu hoặc
   * đổi tên field (đo thật: trả `analysis` thay vì `summary`, thiếu `keyFindings`).
   */
  private withSchemaHint(request: LlmJsonRequest): string {
    const fields = this.renderSchema(request.schema);
    if (!fields) return request.systemInstruction;

    const required = Array.isArray((request.schema as any)?.required)
      ? ((request.schema as any).required as string[])
      : [];

    return (
      `${request.systemInstruction}\n\n` +
      "BẮT BUỘC trả về MỘT object JSON đúng các field sau, giữ nguyên tên field, " +
      "không thêm field khác, không bọc trong markdown:\n" +
      `{ ${fields} }\n` +
      (required.length ? `Field bắt buộc: ${required.join(", ")}.` : "")
    );
  }

  /** Mô tả JSON Schema bằng chữ (đệ quy tối đa 2 cấp để prompt không phình). */
  private renderSchema(schema: Record<string, unknown>, depth = 0): string {
    const properties = (schema as any)?.properties as
      | Record<string, any>
      | undefined;
    if (!properties) return "";

    return Object.entries(properties)
      .map(([key, raw]) => {
        const value = raw as any;
        const type = Array.isArray(value?.enum)
          ? `enum(${value.enum.join("|")})`
          : String(value?.type ?? "any");

        let nested = "";
        if (depth < 2 && value?.type === "array" && value?.items?.properties) {
          nested = ` [{ ${this.renderSchema(value.items, depth + 1)} }]`;
        } else if (depth < 2 && value?.properties) {
          nested = ` { ${this.renderSchema(value, depth + 1)} }`;
        }
        return `"${key}": ${type}${nested}`;
      })
      .join(", ");
  }

  /** Lấy câu trả lời của model (bỏ qua `reasoning_content`). */
  private extractContent(payload: any, model: string): string {
    const choice = payload?.choices?.[0];
    const content = choice?.message?.content;
    const text = typeof content === "string" ? content.trim() : "";

    if (!text) {
      const finishReason = choice?.finish_reason ?? "n/a";
      const reasoning = String(choice?.message?.reasoning_content ?? "").trim();
      throw this.jsonError(
        `GLM "${model}" không trả về nội dung (finish_reason=${finishReason}).` +
          (reasoning
            ? " Model chỉ kịp trả phần suy luận — tăng maxOutputTokens hoặc đặt GLM_THINKING=disabled."
            : ""),
      );
    }

    if (choice?.finish_reason && choice.finish_reason !== "stop") {
      this.logger.warn(
        `GLM finish_reason=${choice.finish_reason} — JSON có thể không đầy đủ`,
      );
    }

    return text;
  }

  /**
   * Parse JSON từ output của model.
   *
   * Dù đã bật `response_format: json_object`, vẫn có trường hợp model bọc thêm
   * ```json ... ``` hoặc vài câu dẫn ⇒ cắt lấy object đầu tiên. Nếu vẫn hỏng,
   * báo lỗi kèm `finish_reason` + đoạn đầu nội dung để biết ngay nguyên nhân
   * (thường là `length` = bị cắt vì hết token).
   */
  private parseJson<T>(
    rawText: string,
    model: string,
    finishReason?: string,
  ): T {
    try {
      return JSON.parse(rawText) as T;
    } catch {
      const start = rawText.indexOf("{");
      const end = rawText.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          const sliced = JSON.parse(rawText.slice(start, end + 1)) as T;
          this.logger.warn("GLM trả JSON kèm văn bản thừa — đã tự cắt.");
          return sliced;
        } catch {
          /* rơi xuống dưới */
        }
      }
      throw this.jsonError(
        `GLM "${model}" trả về nội dung không phải JSON hợp lệ ` +
          `(finish_reason=${finishReason ?? "n/a"}, ${rawText.length} ký tự). ` +
          `Đoạn đầu: ${shorten(rawText, 140)}`,
      );
    }
  }

  private toUsage(payload: any): LlmUsage {
    return {
      promptTokens: payload?.usage?.prompt_tokens ?? null,
      outputTokens: payload?.usage?.completion_tokens ?? null,
      totalTokens: payload?.usage?.total_tokens ?? null,
    };
  }

  /**
   * Gọi 1 model, tự thử lại khi gặp lỗi **tạm thời** (429/5xx/lỗi mạng).
   *
   * Không thử lại khi: key sai, request sai (400), model không tồn tại — những
   * lỗi đó thử lại chỉ tốn thời gian của admin.
   */
  private async postWithRetry(
    model: string,
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<any> {
    let lastError: any = null;
    let attempt = 0;
    let overloadTries = 0;

    for (;;) {
      attempt += 1;
      try {
        return await firstValueFrom(
          this.httpService.post(endpoint, body, {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.apiKey}`,
            },
            timeout: this.timeoutMs,
          }),
        );
      } catch (err: any) {
        lastError = err;

        if (this.isKeyProblem(err) || !this.isRetryable(err)) throw err;

        // Quá tải model (1302/1305): backoff mũ vài giây không đủ — nghẽn của
        // model free kéo dài theo đợt. Chờ dài (`GLM_OVERLOAD_RETRY_MS`) rồi
        // thử lại trước khi bỏ ảnh/đổi model.
        if (this.isOverloadError(err)) {
          if (overloadTries >= this.overloadAttempts) break;
          overloadTries += 1;
          const waitMs = Math.max(
            this.overloadRetryMs,
            retryDelayMs(this.retryBaseMs, attempt, this.headersOf(err)),
          );
          this.logger.warn(
            `GLM "${model}" đang quá tải (${this.describeError(err)}) — ` +
              `chờ ${waitMs}ms rồi thử lại ` +
              `(quá tải ${overloadTries}/${this.overloadAttempts}).`,
          );
          await sleep(waitMs);
          continue;
        }

        if (attempt >= this.maxAttempts) break;

        const waitMs = retryDelayMs(
          this.retryBaseMs,
          attempt,
          this.headersOf(err),
        );
        this.logger.warn(
          `GLM "${model}" lỗi tạm thời (${this.describeError(err)}) — ` +
            `thử lại ${attempt + 1}/${this.maxAttempts} sau ${waitMs}ms.`,
        );
        await sleep(waitMs);
      }
    }

    throw lastError;
  }

  private isRetryable(err: any): boolean {
    // 1113/1211/1210 là lỗi thuộc về *model* — gọi lại y nguyên cũng không đổi,
    // phải chuyển model khác (xem `shouldTryNextModel`).
    if (
      [GLM_NO_BALANCE, GLM_MODEL_MISSING, GLM_BAD_CONTENT_TYPE].includes(
        this.errorCodeOf(err),
      )
    ) {
      return false;
    }
    return isRetryableStatus(err?.response?.status);
  }

  private headersOf(err: any): Record<string, unknown> | undefined {
    const headers = err?.response?.headers;
    return headers && typeof headers === "object" ? headers : undefined;
  }

  /** Key sai/bị thu hồi: HTTP 401/403 hoặc mã lỗi 1000–1004 của GLM. */
  private isKeyProblem(err: any): boolean {
    const status = Number(err?.response?.status);
    if (status === 401 || status === 403) return true;

    if (
      ["1000", "1001", "1002", "1003", "1004"].includes(this.errorCodeOf(err))
    ) {
      return true;
    }

    const message = String(
      err?.response?.data?.error?.message ?? err?.message ?? "",
    );
    return /api[\s_-]?key|token|unauthor|forbidden/i.test(message);
  }

  /** Lỗi thuộc về *model* ⇒ nên thử model kế tiếp trong chuỗi dự phòng. */
  private shouldTryNextModel(err: any): boolean {
    if (this.isRetryable(err)) return true;
    if (Number(err?.response?.status) === 404) return true;
    return [GLM_NO_BALANCE, GLM_MODEL_MISSING, GLM_BAD_CONTENT_TYPE].includes(
      this.errorCodeOf(err),
    );
  }

  private errorCodeOf(err: any): string {
    const code = err?.response?.data?.error?.code ?? err?.response?.data?.code;
    return code === undefined || code === null ? "" : String(code);
  }

  /**
   * Trạng thái/mã lỗi của GLM, đọc được cả khi lỗi đã bị bọc thành `HttpException`.
   *
   * Trước đây `describeError` chỉ đọc `err.response.status`, nên sau `toHttpException`
   * mọi lỗi 429/1305 đều hiện thành **"lỗi mạng"** trong cảnh báo của admin — gây
   * hiểu nhầm là mất mạng thay vì model quá tải.
   */
  private metaOf(err: any): { status: number | null; code: string } {
    const meta = err?.llmMeta;
    if (meta) {
      return { status: meta.status ?? null, code: meta.code ?? "" };
    }
    const status = Number(err?.response?.status);
    return {
      status: Number.isFinite(status) && status > 0 ? status : null,
      code: this.errorCodeOf(err),
    };
  }

  private describeError(err: any): string {
    const { status, code } = this.metaOf(err);
    if (status !== null) return `${status}${code ? `/${code}` : ""}`;
    const message = String(err?.code ?? err?.message ?? "");
    const transport =
      /ECONN|EAI_AGAIN|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|socket|timeout/i.test(
        message,
      );
    return `${transport ? "mạng" : "lỗi"}${code ? `/${code}` : ""}`;
  }

  /** Model quá tải/hết hạn mức tạm thời ⇒ đáng chờ rồi thử lại. */
  private isOverloadError(err: any): boolean {
    const { status, code } = this.metaOf(err);
    if (GLM_OVERLOAD_CODES.includes(code)) return true;
    return status === 429 || (status !== null && status >= 500);
  }

  /** Chuyển lỗi HTTP/GLM thành exception đọc được cho admin. */
  private toHttpException(
    err: any,
    triedModels: string[],
    useVision = false,
  ): Error {
    const status = Number(err?.response?.status);
    const error = err?.response?.data?.error;
    const code = this.errorCodeOf(err);
    const message = shorten(error?.message ?? err?.message ?? "unknown error");
    const triedNote =
      triedModels.length > 1 ? ` | models: ${triedModels.join(" → ")}` : "";

    this.logger.error(
      `GLM call failed (${status || "n/a"}${code ? `:${code}` : ""})${triedNote}: ${message}`,
    );

    const offendingModel = triedModels[triedModels.length - 1] ?? this.model;
    // Gắn metadata để tầng trên (generateJson) phân loại được "quá tải" và giữ
    // đúng mã lỗi trong cảnh báo — HttpException của Nest không giữ `response`.
    const withMeta = <T extends Error>(exception: T): T => {
      (exception as any).llmMeta = {
        status: Number.isFinite(status) && status > 0 ? status : null,
        code,
        modelsTried: triedModels,
        useVision,
      };
      return exception;
    };

    if (this.isKeyProblem(err)) {
      return withMeta(
        new ServiceUnavailableException(
          `GLM_API_KEY không hợp lệ hoặc đã bị thu hồi: ${message}`,
        ),
      );
    }
    if (code === GLM_NO_BALANCE) {
      return withMeta(
        new ServiceUnavailableException(
          `Tài khoản GLM không có gói/quota cho model "${offendingModel}" (1113): ${message} ` +
            `Model free đang dùng được: "${this.model}" (chữ) và "${this.visionModel}" (ảnh).`,
        ),
      );
    }
    if (code === GLM_MODEL_MISSING || status === 404) {
      return withMeta(
        new ServiceUnavailableException(
          `Không tìm thấy model "${offendingModel}" trên GLM (${code || 404}): ${message} — ` +
            "kiểm tra GLM_MODEL/GLM_VISION_MODEL (model có thể đã bị gỡ như glm-4v-flash).",
        ),
      );
    }
    if (code === GLM_BAD_CONTENT_TYPE) {
      return withMeta(
        new BadGatewayException(
          `Model "${offendingModel}" không nhận loại nội dung này (1210): ${message}`,
        ),
      );
    }
    if (status === 429) {
      return withMeta(
        new ServiceUnavailableException(
          `GLM vượt hạn mức (429): ${message}${this.retryHint(triedModels, useVision)}`,
        ),
      );
    }
    if (status >= 500) {
      return withMeta(
        new ServiceUnavailableException(
          `GLM tạm thời quá tải (${status}): ${message}${this.retryHint(triedModels, useVision)}`,
        ),
      );
    }
    return withMeta(
      new ServiceUnavailableException(`Không gọi được GLM: ${message}`),
    );
  }

  /**
   * Câu gợi ý thêm cho admin khi đã tự xử lý hết cách.
   *
   * Nói rõ đã thử bao nhiêu lần, bao nhiêu model để admin biết không phải lỗi
   * thao tác của mình — và **đúng biến môi trường** cần đổi (lượt ảnh thì là
   * `GLM_VISION_MODEL`, không phải `GLM_MODEL`).
   */
  private retryHint(triedModels: string[], useVision = false): string {
    const attempts = this.maxAttempts;
    const envHint = useVision
      ? "GLM_VISION_MODEL/GLM_VISION_FALLBACK_MODELS"
      : "GLM_MODEL";
    if (triedModels.length > 1) {
      return (
        ` Đã tự thử lại ${attempts} lần mỗi model và chuyển qua ${triedModels.length} model ` +
        `(${triedModels.join(", ")}) nhưng đều lỗi — vui lòng đợi 30–60 giây rồi bấm "Phân tích" lại.`
      );
    }
    return (
      ` Đã tự thử lại ${attempts} lần — model "${triedModels[0]}" đang lỗi, ` +
      `vui lòng đợi 30–60 giây rồi bấm "Phân tích" lại (hoặc đổi ${envHint}).`
    );
  }
}
