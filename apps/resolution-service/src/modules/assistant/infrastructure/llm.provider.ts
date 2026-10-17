import { Provider } from "@nestjs/common";
import { GeminiClient } from "./gemini.client";
import { GlmClient } from "./glm.client";
import { ASSISTANT_LLM, AssistantLlmClient } from "./llm.types";

/**
 * Nhà cung cấp LLM đang chọn theo `AI_PROVIDER` (mặc định `glm` = Zhipu).
 *
 * Tách khỏi `assistant.module.ts` để test DI được mà không cần DB/service ngoài.
 */
export function resolveLlmProvider(): "glm" | "gemini" {
  return (process.env.AI_PROVIDER ?? "glm").trim().toLowerCase() === "gemini"
    ? "gemini"
    : "glm";
}

/** Provider DI cho token `ASSISTANT_LLM`: cắm đúng client theo `AI_PROVIDER`. */
export const assistantLlmProvider: Provider = {
  provide: ASSISTANT_LLM,
  inject: [GeminiClient, GlmClient],
  useFactory: (gemini: GeminiClient, glm: GlmClient): AssistantLlmClient =>
    resolveLlmProvider() === "gemini" ? gemini : glm,
};
