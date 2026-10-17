import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import {
  AssistantLlmClient,
  LlmJsonRequest,
  LlmJsonResponse,
} from "./llm.types";
import {
  envNumber,
  isRetryableStatus,
  retryDelayMs,
  shorten,
  sleep,
} from "./llm.retry";

export type {
  LlmInlineImage as GeminiInlineImage,
  LlmJsonRequest as GeminiJsonRequest,
  LlmJsonResponse as GeminiJsonResponse,
  LlmUsage as GeminiUsage,
} from "./llm.types";

/**
 * Client gọi Gemini bằng REST thuần qua `HttpService` (không thêm SDK).
 *
 * Dùng `POST {apiBase}/v1beta/models/{model}:generateContent` với structured
 * output (`generationConfig.responseMimeType = "application/json"` +
 * `responseSchema`) theo tài liệu Gemini API.
 *
 * Toàn bộ chi tiết giao thức Gemini nằm gọn trong file này — nếu Google
 * chuyển sang Interactions API thì chỉ cần sửa ở đây.
 */
@Injectable()
export class GeminiClient implements AssistantLlmClient {
  private readonly logger = new Logger(GeminiClient.name);

  constructor(private readonly httpService: HttpService) {}

  /** Tên provider để hiển thị ở `GET /assistant/health`. */
  readonly provider = "gemini";

  /** Tên biến môi trường chứa key — hiển thị ở `/assistant/health`. */
  readonly apiKeyEnv = "GEMINI_API_KEY";

  get apiKey(): string {
    return (process.env.GEMINI_API_KEY ?? "").trim();
  }

  get hasApiKey(): boolean {
    return this.apiKey.length > 0;
  }

  get model(): string {
    return (process.env.GEMINI_MODEL ?? "").trim() || "gemini-3.8-flash";
  }

  /** Gemini dùng **cùng** model cho cả chữ và ảnh (không tách như GLM). */
  get visionModel(): string {
    return this.model;
  }

  get apiBase(): string {
    const raw =
      (process.env.GEMINI_API_BASE ?? "").trim() ||
      "https://generativelanguage.googleapis.com";
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
    return envNumber("GEMINI_TIMEOUT_MS", 120000, 1000);
  }

  /** Số lần thử tối đa cho **mỗi** model (tính cả lần đầu). Mặc định 3, tối đa 6. */
  get maxAttempts(): number {
    return envNumber("GEMINI_MAX_ATTEMPTS", 3, 1, 6);
  }

  /** Thời gian chờ cơ sở giữa 2 lần thử (ms) — tăng theo cấp số nhân. Mặc định 1500. */
  get retryBaseMs(): number {
    return envNumber("GEMINI_RETRY_BASE_MS", 1500, 0, 30000);
  }

  /**
   * Model dự phòng, thử lần lượt khi model chính quá tải (503/429) hoặc không
   * còn tồn tại (404). Cấu hình: `GEMINI_FALLBACK_MODELS=a,b,c`.
   *
   * Mặc định 2 model flash GA cùng họ: Google thường xuyên trả 503 "high demand"
   * cho model mới trong khi các model khác vẫn chạy bình thường — tự chuyển model
   * giúp admin không phải bấm lại nút Phân tích.
   *
   * Đo thật với key của dự án (tháng 10/2026): `3.8-flash`/`3.7-flash`/`flash-latest`
   * trả **503**, còn `2.5-flash`/`2.5-pro` trả **404** ("no longer available to new
   * users") — nên dự phòng phải là model GA hiện hành, không phải 2.5.
   */
  get fallbackModels(): string[] {
    const raw = (process.env.GEMINI_FALLBACK_MODELS ?? "").trim();
    const configured = raw
      ? raw
          .split(",")
          .map((m) => m.trim())
          .filter((m) => m.length > 0)
      : ["gemini-3.6-flash", "gemini-3.5-flash"];
    return configured.filter((m) => m !== this.model);
  }

  /** Thứ tự model sẽ thử: model chính trước, rồi tới các model dự phòng. */
  get modelChain(): string[] {
    return [this.model, ...this.fallbackModels];
  }

  /** Ném lỗi rõ ràng nếu assistant chưa được cấu hình. */
  assertReady(): void {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        "AI assistant đang tắt. Đặt AI_ASSISTANT_ENABLED=true để bật.",
      );
    }
    if (!this.hasApiKey) {
      throw new ServiceUnavailableException(
        "Thiếu GEMINI_API_KEY trong biến môi trường.",
      );
    }
  }

  /**
   * Gọi Gemini và trả về JSON đã parse (đã kiểm tra là object/JSON hợp lệ).
   * KHÔNG validate theo schema ở đây — việc đó do AssistantService làm.
   */
  async generateJson<T>(req: LlmJsonRequest): Promise<LlmJsonResponse<T>> {
    this.assertReady();

    const parts: Array<Record<string, unknown>> = [{ text: req.prompt }];
    (req.images ?? []).forEach((image, index) => {
      // Nhãn TRƯỚC mỗi ảnh để model biết ảnh đó của bên nào.
      parts.push({
        text: `ẢNH ${index + 1}${image.label ? ` — ${image.label}` : ""}`,
      });
      parts.push({
        inlineData: { mimeType: image.mimeType, data: image.base64 },
      });
    });

    const body = {
      systemInstruction: { parts: [{ text: req.systemInstruction }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: req.temperature ?? 0.2,
        maxOutputTokens: req.maxOutputTokens ?? 4096,
        responseMimeType: "application/json",
        responseSchema: req.schema,
      },
    };

    const chain = this.modelChain;
    let lastError: any = null;

    for (let index = 0; index < chain.length; index += 1) {
      const model: string = chain[index] ?? this.model;
      const endpoint = `${this.apiBase}/v1beta/models/${encodeURIComponent(
        model,
      )}:generateContent`;
      const isLastModel = index === chain.length - 1;

      let response: any;
      try {
        response = await this.postWithRetry(model, endpoint, body);
      } catch (err: any) {
        lastError = err;

        // Key sai / bị thu hồi ⇒ lỗi cấu hình, đổi model cũng vô ích.
        if (this.isKeyProblem(err)) {
          throw this.toHttpException(err, chain.slice(0, index + 1));
        }

        // 404 = model đã bị gỡ; 429/5xx/lỗi mạng = tạm thời ⇒ thử model kế tiếp.
        const status = err?.response?.status;
        const nextModelUsable =
          isRetryableStatus(status) || Number(status) === 404;

        if (isLastModel || !nextModelUsable) {
          throw this.toHttpException(err, chain.slice(0, index + 1));
        }

        this.logger.warn(
          `Model "${model}" không dùng được (${status ?? "lỗi mạng"}) — ` +
            `chuyển sang model dự phòng "${chain[index + 1]}".`,
        );
        continue;
      }

      // Lỗi *nội dung* (model trả JSON hỏng / bị chặn) thì KHÔNG đổi model:
      // đổi model không chắc sửa được mà lại tốn thêm token.
      const payload = response?.data ?? {};
      const rawText = this.extractText(payload);

      return {
        data: this.parseJson<T>(rawText),
        rawText,
        model,
        endpoint,
        imagesUsed: req.images?.length ?? 0,
        usage: {
          promptTokens: payload?.usageMetadata?.promptTokenCount ?? null,
          outputTokens: payload?.usageMetadata?.candidatesTokenCount ?? null,
          totalTokens: payload?.usageMetadata?.totalTokenCount ?? null,
        },
      };
    }

    throw this.toHttpException(lastError, chain);
  }

  /** Ghép text từ các part của candidate đầu tiên. */
  private extractText(payload: any): string {
    const candidate = payload?.candidates?.[0];
    const parts: any[] = candidate?.content?.parts ?? [];
    const text = parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();

    if (!text) {
      const finishReason = candidate?.finishReason;
      const blockReason = payload?.promptFeedback?.blockReason;
      throw new BadGatewayException(
        `Gemini không trả về nội dung (finishReason=${finishReason ?? "n/a"}, blockReason=${blockReason ?? "n/a"})`,
      );
    }

    if (candidate?.finishReason && candidate.finishReason !== "STOP") {
      this.logger.warn(
        `Gemini finishReason=${candidate.finishReason} — JSON có thể không đầy đủ`,
      );
    }

    return text;
  }

  /**
   * Parse JSON từ output của model.
   *
   * Có trường hợp model vẫn thêm ```json ... ``` hoặc vài câu dẫn dù đã bật
   * responseMimeType — khi đó cắt lấy object đầu tiên.
   */
  private parseJson<T>(rawText: string): T {
    try {
      return JSON.parse(rawText) as T;
    } catch {
      const start = rawText.indexOf("{");
      const end = rawText.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          const sliced = JSON.parse(rawText.slice(start, end + 1)) as T;
          this.logger.warn("Gemini trả JSON kèm văn bản thừa — đã tự cắt.");
          return sliced;
        } catch {
          /* rơi xuống dưới */
        }
      }
      throw new BadGatewayException(
        "Gemini trả về nội dung không phải JSON hợp lệ.",
      );
    }
  }

  /**
   * Gọi 1 model, tự thử lại khi gặp lỗi **tạm thời**.
   *
   * Google trả 503 "This model is currently experiencing high demand" khá thường
   * xuyên (nhất là model mới). Đây là lỗi tự khỏi, nên client tự thử lại thay vì
   * bắt admin bấm lại nút Phân tích.
   *
   * Không thử lại khi: key sai, payload sai (400), không có quyền (401/403).
   */
  private async postWithRetry(
    model: string,
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<any> {
    const attempts = this.maxAttempts;
    let lastError: any = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await firstValueFrom(
          this.httpService.post(endpoint, body, {
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": this.apiKey,
            },
            timeout: this.timeoutMs,
          }),
        );
      } catch (err: any) {
        lastError = err;

        if (
          this.isKeyProblem(err) ||
          !isRetryableStatus(err?.response?.status)
        ) {
          throw err;
        }
        if (attempt === attempts) break;

        const waitMs = retryDelayMs(
          this.retryBaseMs,
          attempt,
          err?.response?.headers,
        );
        this.logger.warn(
          `Gemini "${model}" lỗi tạm thời (${err?.response?.status ?? "mạng"}) — ` +
            `thử lại ${attempt + 1}/${attempts} sau ${waitMs}ms.`,
        );
        await sleep(waitMs);
      }
    }

    throw lastError;
  }

  // Phân loại lỗi tạm thời nằm ở `llm.retry.ts` (dùng chung với GlmClient).

  /** Key sai / bị thu hồi ⇒ lỗi cấu hình: không thử lại, không đổi model. */
  private isKeyProblem(err: any): boolean {
    const error = err?.response?.data?.error;
    const message = String(error?.message ?? err?.message ?? "");
    const reasons: string[] = Array.isArray(error?.details)
      ? error.details
          .map((d: any) => String(d?.reason ?? ""))
          .filter((r: string) => r.length > 0)
      : [];
    return (
      reasons.some((r) => r.includes("API_KEY")) || /api key/i.test(message)
    );
  }

  /** Chuyển lỗi axios thành HTTP exception có thông báo đọc được. */
  private toHttpException(
    err: any,
    triedModels: string[] = [this.model],
  ): Error {
    const status = err?.response?.status;
    const error = err?.response?.data?.error;
    const message = shorten(error?.message ?? err?.message ?? "unknown error");
    const reasons: string[] = Array.isArray(error?.details)
      ? error.details
          .map((d: any) => String(d?.reason ?? ""))
          .filter((r: string) => r.length > 0)
      : [];
    const triedNote =
      triedModels.length > 1 ? ` | models: ${triedModels.join(" → ")}` : "";
    this.logger.error(
      `Gemini call failed (${status ?? "n/a"}${reasons.length ? `: ${reasons.join(",")}` : ""})${triedNote}: ${message}`,
    );

    // Google trả 400 + reason API_KEY_INVALID khi key sai/đã thu hồi — đây là
    // lỗi cấu hình, không phải lỗi payload.
    if (this.isKeyProblem(err)) {
      return new ServiceUnavailableException(
        `GEMINI_API_KEY không hợp lệ hoặc đã bị thu hồi: ${message}`,
      );
    }

    if (status === 400) {
      return new BadRequestException(`Gemini từ chối yêu cầu: ${message}`);
    }
    if (status === 401 || status === 403) {
      return new ServiceUnavailableException(
        `Không có quyền gọi Gemini (${status}): ${message}`,
      );
    }
    const offendingModel = triedModels[triedModels.length - 1] ?? this.model;
    if (status === 404) {
      return new ServiceUnavailableException(
        `Không tìm thấy model "${offendingModel}" trên ${this.apiBase}: ${message}`,
      );
    }
    if (status === 429) {
      return new ServiceUnavailableException(
        `Gemini vượt hạn mức (429): ${message}${this.retryHint(triedModels)}`,
      );
    }
    if (status === 503) {
      return new ServiceUnavailableException(
        `Gemini tạm thời quá tải (503): ${message}${this.retryHint(triedModels)}`,
      );
    }
    return new ServiceUnavailableException(
      `Không gọi được Gemini: ${message}${this.retryHint(triedModels)}`,
    );
  }

  /**
   * Câu gợi ý thêm cho admin khi model quá tải / vượt hạn mức.
   *
   * Việc tự thử lại đã thất bại hết ⇒ nói rõ đã thử bao nhiêu lần, bao nhiêu
   * model để admin biết không phải lỗi thao tác của mình.
   */
  private retryHint(triedModels: string[]): string {
    const attempts = this.maxAttempts;
    if (triedModels.length > 1) {
      return (
        ` Đã tự thử lại ${attempts} lần mỗi model và chuyển qua ${triedModels.length} model ` +
        `(${triedModels.join(", ")}) nhưng đều quá tải — vui lòng đợi 30–60 giây rồi bấm "Phân tích" lại.`
      );
    }
    return (
      ` Đã tự thử lại ${attempts} lần — model "${triedModels[0]}" đang quá tải, ` +
      `vui lòng đợi 30–60 giây rồi bấm "Phân tích" lại (hoặc đổi GEMINI_MODEL).`
    );
  }
}
