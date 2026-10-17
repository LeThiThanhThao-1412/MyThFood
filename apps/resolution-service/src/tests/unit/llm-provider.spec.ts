import { Test } from "@nestjs/testing";
import { HttpModule } from "@nestjs/axios";
import { GeminiClient } from "../../modules/assistant/infrastructure/gemini.client";
import { GlmClient } from "../../modules/assistant/infrastructure/glm.client";
import { assistantLlmProvider } from "../../modules/assistant/infrastructure/llm.provider";
import {
  ASSISTANT_LLM,
  AssistantLlmClient,
} from "../../modules/assistant/infrastructure/llm.types";

const ORIGINAL_ENV = { ...process.env };

/**
 * Kiểm tra DI thật của Nest: `AI_PROVIDER` phải cắm đúng client vào token
 * `ASSISTANT_LLM` mà `AssistantService` inject.
 */
describe("AssistantModule — chọn provider theo AI_PROVIDER", () => {
  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  async function resolve(): Promise<AssistantLlmClient> {
    const moduleRef = await Test.createTestingModule({
      imports: [HttpModule],
      providers: [GeminiClient, GlmClient, assistantLlmProvider],
    }).compile();
    return moduleRef.get<AssistantLlmClient>(ASSISTANT_LLM);
  }

  it("mặc định (không đặt AI_PROVIDER) ⇒ dùng GLM", async () => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.AI_PROVIDER;

    const client = await resolve();
    expect(client.provider).toBe("glm");
    expect(client.model).toBe("glm-4.5-flash");
  });

  it("AI_PROVIDER=gemini ⇒ dùng Gemini", async () => {
    process.env.AI_PROVIDER = "gemini";

    const client = await resolve();
    expect(client.provider).toBe("gemini");
  });

  it("chấp nhận chữ hoa và khoảng trắng thừa", async () => {
    process.env.AI_PROVIDER = "  GLM  ";

    const client = await resolve();
    expect(client.provider).toBe("glm");
  });
});
