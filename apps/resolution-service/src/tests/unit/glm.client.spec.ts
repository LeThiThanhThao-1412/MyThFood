import { of, throwError } from "rxjs";
import { GlmClient } from "../../modules/assistant/infrastructure/glm.client";

const ORIGINAL_ENV = { ...process.env };

function makeClient(
  postImpl: (url: string, body: any, config: any) => unknown,
) {
  const httpService = { post: jest.fn(postImpl) } as any;
  return { client: new GlmClient(httpService), httpService };
}

function glmOk(content: string, model = "glm-4.5-flash") {
  return of({
    data: {
      choices: [{ finish_reason: "stop", index: 0, message: { content } }],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 7,
        total_tokens: 18,
      },
      model,
    },
  });
}

/** Lỗi thật GLM trả về (Zhipu): mã nằm trong `error.code`. */
function glmError(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
) {
  return {
    response: { status, headers, data: { error: { code, message } } },
  };
}

describe("GlmClient", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.AI_ASSISTANT_ENABLED = "true";
    process.env.GLM_API_KEY = "test-key";
    delete process.env.AI_PROVIDER;
    delete process.env.GLM_MODEL;
    delete process.env.GLM_VISION_MODEL;
    delete process.env.GLM_API_BASE;
    delete process.env.GLM_MAX_ATTEMPTS;
    delete process.env.GLM_RETRY_BASE_MS;
    delete process.env.GLM_FALLBACK_MODELS;
    delete process.env.GLM_THINKING;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe("cấu hình", () => {
    it("mặc định dùng GLM free: glm-4.5-flash (chữ) + glm-4.6v-flash (ảnh)", () => {
      const { client } = makeClient(() => glmOk("{}"));
      expect(client.provider).toBe("glm");
      expect(client.model).toBe("glm-4.5-flash");
      expect(client.visionModel).toBe("glm-4.6v-flash");
      expect(client.apiBase).toBe("https://open.bigmodel.cn/api/paas/v4");
      expect(client.enabled).toBe(true);
      expect(client.hasApiKey).toBe(true);
    });

    it("assertReady ném lỗi khi assistant bị tắt hoặc thiếu key", () => {
      process.env.AI_ASSISTANT_ENABLED = "false";
      const { client } = makeClient(() => glmOk("{}"));
      expect(() => client.assertReady()).toThrow(/AI_ASSISTANT_ENABLED/);

      process.env.AI_ASSISTANT_ENABLED = "true";
      process.env.GLM_API_KEY = "";
      expect(() => client.assertReady()).toThrow(/GLM_API_KEY/);
    });
  });

  describe("generateJson", () => {
    it("gọi đúng endpoint GLM, header Bearer và parse JSON của `choices[0]`", async () => {
      const { client, httpService } = makeClient(() => glmOk('{"ok":true}'));

      const result = await client.generateJson<{ ok: boolean }>({
        systemInstruction: "sys",
        prompt: "prompt",
        schema: { type: "object" },
      });

      expect(result.data.ok).toBe(true);
      expect(result.model).toBe("glm-4.5-flash");
      expect(result.usage.totalTokens).toBe(18);

      const [url, body, config] = httpService.post.mock.calls[0] as any[];
      expect(url).toBe("https://open.bigmodel.cn/api/paas/v4/chat/completions");
      expect(config.headers.Authorization).toBe("Bearer test-key");
      expect(body.messages[0]).toEqual({ role: "system", content: "sys" });
      expect(body.messages[1].content).toBe("prompt");
      // JSON cứng để không phải đoán output
      expect(body.response_format).toEqual({ type: "json_object" });
      // GLM_THINKING mặc định = auto ⇒ không gửi tham số thinking
      expect(body.thinking).toBeUndefined();
    });

    it("gửi ảnh bằng chứng dưới dạng image_url data-URI và dùng model vision", async () => {
      const { client, httpService } = makeClient(() =>
        glmOk("{}", "glm-4.6v-flash"),
      );

      const result = await client.generateJson({
        systemInstruction: "sys",
        prompt: "prompt",
        schema: { type: "object" },
        images: [
          {
            mimeType: "image/png",
            base64: "AAAA",
            label: "BÊN KHIẾU NẠI — ảnh 1: a.jpg",
          },
        ],
      });

      expect(result.model).toBe("glm-4.6v-flash");
      const [, body] = httpService.post.mock.calls[0] as any[];
      expect(body.model).toBe("glm-4.6v-flash");
      // Nhãn bên đứng ngay trước ảnh tương ứng
      expect(body.messages[1].content[1]).toEqual({
        type: "text",
        text: "ẢNH 1 — BÊN KHIẾU NẠI — ảnh 1: a.jpg",
      });
      expect(body.messages[1].content[2]).toEqual({
        type: "image_url",
        image_url: { url: "data:image/png;base64,AAAA" },
      });
      // Lượt có ảnh: tắt thinking để model vision không "suy nghĩ" hết token
      expect(body.thinking).toEqual({ type: "disabled" });
    });

    it("tự cắt JSON khi model thêm văn bản thừa", async () => {
      const { client } = makeClient(() =>
        glmOk('Đây là kết quả:\n```json\n{"ok":true}\n```'),
      );

      const result = await client.generateJson<{ ok: boolean }>({
        systemInstruction: "sys",
        prompt: "prompt",
        schema: { type: "object" },
      });

      expect(result.data.ok).toBe(true);
    });

    it("JSON hỏng ⇒ tự thử lại 1 lần với “chỉ JSON” + tắt thinking", async () => {
      let calls = 0;
      const { client, httpService } = makeClient(() => {
        calls += 1;
        return calls === 1
          ? glmOk("Xin chào, tôi đã phân tích xong vụ việc này...")
          : glmOk('{"ok":true}');
      });

      const result = await client.generateJson<{ ok: boolean }>({
        systemInstruction: "sys",
        prompt: "prompt",
        schema: { type: "object" },
      });

      expect(result.data.ok).toBe(true);
      expect(httpService.post).toHaveBeenCalledTimes(2);

      const secondBody = httpService.post.mock.calls[1][1] as any;
      expect(secondBody.thinking).toEqual({ type: "disabled" });
      expect(secondBody.messages[0].content).toMatch(/JSON KHÔNG HỢP LỆ/);
    });

    it("báo lỗi JSON kèm finish_reason + đoạn đầu để dễ chẩn đoán", async () => {
      const { client } = makeClient(() =>
        of({
          data: {
            choices: [
              {
                finish_reason: "length",
                message: { content: '{"summary":"đang viết dở' },
              },
            ],
          },
        }),
      );

      const error: any = await client
        .generateJson({
          systemInstruction: "sys",
          prompt: "prompt",
          schema: { type: "object" },
        })
        .catch((e) => e);

      expect(error.message).toMatch(/không phải JSON hợp lệ/);
      expect(error.message).toMatch(/finish_reason=length/);
      expect(error.message).toMatch(/Đoạn đầu/);
    });

    it("báo lỗi rõ ràng khi model trả rỗng (hết token lúc đang suy luận)", async () => {
      const { client } = makeClient(() =>
        of({
          data: {
            choices: [
              {
                finish_reason: "length",
                message: { content: "", reasoning_content: "...suy luận..." },
              },
            ],
          },
        }),
      );

      await expect(
        client.generateJson({
          systemInstruction: "sys",
          prompt: "prompt",
          schema: { type: "object" },
        }),
      ).rejects.toThrow(/không trả về nội dung/);
    });
  });

  describe("chịu lỗi & dự phòng (đo thật với GLM)", () => {
    beforeEach(() => {
      // Thử lại gần như tức thì để test không phải chờ backoff thật.
      process.env.GLM_MAX_ATTEMPTS = "3";
      process.env.GLM_RETRY_BASE_MS = "1";
      process.env.GLM_FALLBACK_MODELS = "none";
    });

    afterEach(() => {
      delete process.env.GLM_MAX_ATTEMPTS;
      delete process.env.GLM_RETRY_BASE_MS;
      delete process.env.GLM_FALLBACK_MODELS;
    });

    it("tự thử lại khi bị chặn tần suất (429) rồi thành công", async () => {
      let calls = 0;
      const { client, httpService } = makeClient(() => {
        calls += 1;
        return calls === 1
          ? throwError(() => glmError(429, "1301", "rate limit"))
          : glmOk('{"ok":true}');
      });

      const result = await client.generateJson<{ ok: boolean }>({
        systemInstruction: "sys",
        prompt: "prompt",
        schema: { type: "object" },
      });

      expect(result.data.ok).toBe(true);
      expect(httpService.post).toHaveBeenCalledTimes(2);
    });

    it("chuyển sang model dự phòng khi model chính hết quota (1113)", async () => {
      process.env.GLM_FALLBACK_MODELS = "glm-4.6v-flash";
      const { client, httpService } = makeClient((_url: string, body: any) =>
        body.model === "glm-4.5-flash"
          ? throwError(() => glmError(429, "1113", "余额不足"))
          : glmOk('{"ok":true}', "glm-4.6v-flash"),
      );

      const result = await client.generateJson<{ ok: boolean }>({
        systemInstruction: "sys",
        prompt: "prompt",
        schema: { type: "object" },
      });

      expect(result.model).toBe("glm-4.6v-flash");
      // 1113 không đáng thử lại ⇒ đúng 1 lần/model
      expect(httpService.post).toHaveBeenCalledTimes(2);
    });

    it("báo lỗi kèm gợi ý khi cạn cách, không lộ chi tiết thô", async () => {
      const { client, httpService } = makeClient(() =>
        throwError(() => glmError(429, "1113", "余额不足或无可用资源包")),
      );

      const error: any = await client
        .generateJson({
          systemInstruction: "sys",
          prompt: "prompt",
          schema: { type: "object" },
        })
        .catch((e) => e);

      expect(error.message).toMatch(/1113/);
      expect(error.message).toMatch(/glm-4\.5-flash/);
      expect(error.message).toMatch(/Model free đang dùng được/);
      expect(httpService.post).toHaveBeenCalledTimes(1);
    });

    it("không thử lại khi key sai (1001)", async () => {
      const { client, httpService } = makeClient(() =>
        throwError(() => glmError(401, "1001", "Authorization Token非法")),
      );

      await expect(
        client.generateJson({
          systemInstruction: "sys",
          prompt: "prompt",
          schema: { type: "object" },
        }),
      ).rejects.toThrow(/GLM_API_KEY không hợp lệ/);

      expect(httpService.post).toHaveBeenCalledTimes(1);
    });

    it("model vision hỏng ⇒ vẫn phân tích bằng model chữ và ghi chú đã bỏ ảnh", async () => {
      const { client, httpService } = makeClient((_url: string, body: any) =>
        body.model === "glm-4.6v-flash"
          ? throwError(() =>
              glmError(400, "1210", "messages.content.type 非法"),
            )
          : glmOk('{"ok":true}', "glm-4.5-flash"),
      );

      const result = await client.generateJson<{ ok: boolean }>({
        systemInstruction: "sys",
        prompt: "prompt",
        schema: { type: "object" },
        images: [{ mimeType: "image/png", base64: "AAAA" }],
      });

      expect(result.data.ok).toBe(true);
      expect(result.model).toBe("glm-4.5-flash");
      expect(result.notes?.join(" ")).toMatch(/ảnh bằng chứng/);
      // lần gọi cuối cùng không còn ảnh
      const lastBody = httpService.post.mock.calls[1][1] as any;
      expect(lastBody.model).toBe("glm-4.5-flash");
      expect(typeof lastBody.messages[1].content).toBe("string");
    });

    it("GLM_VISION_MODEL=none ⇒ bỏ ảnh ngay, 1 lượt gọi, có ghi chú giải thích", async () => {
      process.env.GLM_VISION_MODEL = "none";
      const { client, httpService } = makeClient(() => glmOk('{"ok":true}'));

      const result = await client.generateJson<{ ok: boolean }>({
        systemInstruction: "sys",
        prompt: "prompt",
        schema: { type: "object" },
        images: [{ mimeType: "image/png", base64: "AAAA" }],
      });

      expect(result.model).toBe("glm-4.5-flash");
      expect(result.notes?.join(" ")).toMatch(/GLM_VISION_MODEL=none/);
      expect(httpService.post).toHaveBeenCalledTimes(1);
      const body = httpService.post.mock.calls[0][1] as any;
      expect(typeof body.messages[1].content).toBe("string");
    });

    it("báo 404 khi model không tồn tại (glm-4v-flash đã bị gỡ)", async () => {
      const { client } = makeClient(() =>
        throwError(() => glmError(400, "1211", "模型不存在，请检查模型代码。")),
      );

      await expect(
        client.generateJson({
          systemInstruction: "sys",
          prompt: "prompt",
          schema: { type: "object" },
        }),
      ).rejects.toThrow(/Không tìm thấy model "glm-4\.5-flash"/);
    });
  });
});
