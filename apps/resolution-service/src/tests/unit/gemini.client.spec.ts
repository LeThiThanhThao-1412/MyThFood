import { of, throwError } from "rxjs";
import { GeminiClient } from "../../modules/assistant/infrastructure/gemini.client";

const ORIGINAL_ENV = { ...process.env };

function makeClient(
  postImpl: (url: string, body: any, config: any) => unknown,
) {
  const httpService = { post: jest.fn(postImpl) } as any;
  return { client: new GeminiClient(httpService), httpService };
}

function geminiOk(text: string) {
  return of({
    data: {
      candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
      usageMetadata: {
        promptTokenCount: 11,
        candidatesTokenCount: 7,
        totalTokenCount: 18,
      },
    },
  });
}

/** Lỗi thật Google trả khi model đang quá tải. */
function gemini503() {
  return {
    response: {
      status: 503,
      data: {
        error: {
          code: 503,
          message:
            "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
          status: "UNAVAILABLE",
        },
      },
    },
  };
}

describe("GeminiClient", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.AI_ASSISTANT_ENABLED = "true";
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_API_BASE;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe("cấu hình", () => {
    it("mặc định model gemini-3.8-flash và API base của Google", () => {
      const { client } = makeClient(() => geminiOk("{}"));
      expect(client.model).toBe("gemini-3.8-flash");
      expect(client.apiBase).toBe("https://generativelanguage.googleapis.com");
      expect(client.enabled).toBe(true);
      expect(client.hasApiKey).toBe(true);
    });

    it("assertReady ném lỗi khi assistant bị tắt", () => {
      process.env.AI_ASSISTANT_ENABLED = "false";
      const { client } = makeClient(() => geminiOk("{}"));
      expect(() => client.assertReady()).toThrow(/AI_ASSISTANT_ENABLED/);
    });

    it("assertReady ném lỗi khi thiếu API key", () => {
      process.env.GEMINI_API_KEY = "";
      const { client } = makeClient(() => geminiOk("{}"));
      expect(() => client.assertReady()).toThrow(/GEMINI_API_KEY/);
    });
  });

  describe("generateJson", () => {
    it("gọi đúng endpoint, header và parse JSON", async () => {
      const { client, httpService } = makeClient(() => geminiOk('{"ok":true}'));

      const result = await client.generateJson<{ ok: boolean }>({
        systemInstruction: "sys",
        prompt: "prompt",
        schema: { type: "object", properties: { ok: { type: "boolean" } } },
      });

      expect(result.data.ok).toBe(true);
      expect(result.model).toBe("gemini-3.8-flash");
      expect(result.usage.totalTokens).toBe(18);

      const [url, body, config] = httpService.post.mock.calls[0] as any[];
      expect(url).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      );
      expect(config.headers["x-goog-api-key"]).toBe("test-key");
      expect(body.generationConfig.responseMimeType).toBe("application/json");
      expect(body.generationConfig.responseSchema).toBeDefined();
      expect(body.contents[0].parts).toHaveLength(1);
    });

    it("đính kèm ảnh dưới dạng inlineData", async () => {
      const { client, httpService } = makeClient(() => geminiOk("{}"));

      await client.generateJson({
        systemInstruction: "sys",
        prompt: "prompt",
        schema: { type: "object" },
        images: [{ mimeType: "image/png", base64: "AAAA" }],
      });

      const [, body] = httpService.post.mock.calls[0] as any[];
      // Nhãn đứng trước ảnh để model biết ảnh của bên nào
      expect(body.contents[0].parts[1]).toEqual({ text: "ẢNH 1" });
      expect(body.contents[0].parts[2]).toEqual({
        inlineData: { mimeType: "image/png", data: "AAAA" },
      });
    });

    it("tự cắt JSON khi model thêm văn bản thừa", async () => {
      const { client } = makeClient(() =>
        geminiOk('Đây là kết quả:\n```json\n{"ok":true}\n```'),
      );
      const result = await client.generateJson<{ ok: boolean }>({
        systemInstruction: "sys",
        prompt: "prompt",
        schema: { type: "object" },
      });
      expect(result.data.ok).toBe(true);
    });

    it("báo lỗi cấu hình khi API key không hợp lệ", async () => {
      const { client } = makeClient(() =>
        throwError(() => ({
          response: {
            status: 400,
            data: {
              error: {
                code: 400,
                message: "API key not valid. Please pass a valid API key.",
                status: "INVALID_ARGUMENT",
                details: [
                  {
                    "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                    reason: "API_KEY_INVALID",
                    domain: "googleapis.com",
                  },
                ],
              },
            },
          },
        })),
      );

      await expect(
        client.generateJson({
          systemInstruction: "sys",
          prompt: "prompt",
          schema: { type: "object" },
        }),
      ).rejects.toThrow(/GEMINI_API_KEY không hợp lệ/);
    });

    it("báo lỗi khi model bị chặn, không trả nội dung", async () => {
      const { client } = makeClient(() =>
        of({ data: { candidates: [{ finishReason: "SAFETY" }] } }),
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

  describe("chịu lỗi tạm thời (503) của Gemini", () => {
    beforeEach(() => {
      // Thử lại gần như tức thì để test không phải chờ backoff thật.
      process.env.GEMINI_MAX_ATTEMPTS = "3";
      process.env.GEMINI_RETRY_BASE_MS = "1";
      process.env.GEMINI_FALLBACK_MODELS = "gemini-3.6-flash";
    });

    afterEach(() => {
      delete process.env.GEMINI_MAX_ATTEMPTS;
      delete process.env.GEMINI_RETRY_BASE_MS;
      delete process.env.GEMINI_FALLBACK_MODELS;
    });

    it("tự thử lại khi quá tải rồi thành công — admin không phải bấm lại", async () => {
      let calls = 0;
      const { client, httpService } = makeClient(() => {
        calls += 1;
        return calls === 1
          ? throwError(() => gemini503())
          : geminiOk('{"ok":true}');
      });

      const result = await client.generateJson<{ ok: boolean }>({
        systemInstruction: "sys",
        prompt: "prompt",
        schema: { type: "object" },
      });

      expect(result.data.ok).toBe(true);
      expect(result.model).toBe("gemini-3.8-flash");
      expect(httpService.post).toHaveBeenCalledTimes(2);
    });

    it("chuyển sang model dự phòng khi model chính quá tải liên tục", async () => {
      const { client, httpService } = makeClient((url: string) =>
        url.includes("gemini-3.8-flash")
          ? throwError(() => gemini503())
          : geminiOk('{"ok":true}'),
      );

      const result = await client.generateJson<{ ok: boolean }>({
        systemInstruction: "sys",
        prompt: "prompt",
        schema: { type: "object" },
      });

      expect(result.model).toBe("gemini-3.6-flash");
      // 3 lần thử model chính + 1 lần model dự phòng
      expect(httpService.post).toHaveBeenCalledTimes(4);
    });

    it("báo lỗi kèm gợi ý khi tất cả model đều quá tải", async () => {
      const { client, httpService } = makeClient(() =>
        throwError(() => gemini503()),
      );

      const error: any = await client
        .generateJson({
          systemInstruction: "sys",
          prompt: "prompt",
          schema: { type: "object" },
        })
        .catch((e) => e);

      expect(error.message).toMatch(/tạm thời quá tải/);
      expect(error.message).toMatch(/Đã tự thử lại 3 lần mỗi model/);
      // 2 model trong chuỗi × 3 lần thử mỗi model
      expect(httpService.post).toHaveBeenCalledTimes(6);
    });

    it("không thử lại khi key không hợp lệ (lỗi cấu hình)", async () => {
      const { client, httpService } = makeClient(() =>
        throwError(() => ({
          response: {
            status: 400,
            data: {
              error: {
                code: 400,
                message: "API key not valid. Please pass a valid API key.",
                status: "INVALID_ARGUMENT",
                details: [{ reason: "API_KEY_INVALID" }],
              },
            },
          },
        })),
      );

      await expect(
        client.generateJson({
          systemInstruction: "sys",
          prompt: "prompt",
          schema: { type: "object" },
        }),
      ).rejects.toThrow(/GEMINI_API_KEY không hợp lệ/);

      expect(httpService.post).toHaveBeenCalledTimes(1);
    });

    it("mặc định: 3 lần thử và 2 model dự phòng", () => {
      delete process.env.GEMINI_MAX_ATTEMPTS;
      delete process.env.GEMINI_RETRY_BASE_MS;
      delete process.env.GEMINI_FALLBACK_MODELS;

      const { client } = makeClient(() => geminiOk("{}"));
      expect(client.maxAttempts).toBe(3);
      expect(client.retryBaseMs).toBe(1500);
      expect(client.modelChain).toEqual([
        "gemini-3.8-flash",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
      ]);
    });
  });
});
