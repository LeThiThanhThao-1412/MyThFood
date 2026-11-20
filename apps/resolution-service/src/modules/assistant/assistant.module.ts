import { Module, forwardRef } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CaseModule } from "../case/case.module";
import { AssistantService } from "./application/assistant.service";
import { CaseContextService } from "./application/case-context.service";
import { GeminiClient } from "./infrastructure/gemini.client";
import { GlmClient } from "./infrastructure/glm.client";
import { assistantLlmProvider } from "./infrastructure/llm.provider";
import { CaseAiAnalysisEntity } from "./infrastructure/analysis.entity";
import { CaseAiAnalysisRepository } from "./infrastructure/analysis.repository";
import { AssistantController } from "./presentation/assistant.controller";

/**
 * Trợ lý AI phân tích khiếu nại/tố cáo.
 *
 * Chỉ phụ thuộc CaseModule (đọc vụ việc) và HttpModule (gọi LLM qua REST +
 * các service khác qua IntegrationService). Không ghi/đổi trạng thái nghiệp vụ.
 *
 * **Nhà cung cấp LLM chọn bằng `AI_PROVIDER`** (mặc định `glm` = Zhipu GLM,
 * `gemini` = Google). Hai client đều thoả `AssistantLlmClient`, nên đổi provider
 * không phải sửa tầng nghiệp vụ — xem `infrastructure/llm.types.ts`.
 *
 * Module còn lưu bản phân tích vào `case_ai_analyses` để `CaseService` gọi nền
 * (`triggerAutoAnalysis`) ngay khi có khiếu nại mới — admin chỉ đọc & duyệt.
 */
@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([CaseAiAnalysisEntity]),
    forwardRef(() => CaseModule),
  ],
  controllers: [AssistantController],
  providers: [
    GeminiClient,
    GlmClient,
    assistantLlmProvider,
    CaseContextService,
    CaseAiAnalysisRepository,
    AssistantService,
  ],
  exports: [AssistantService],
})
export class AssistantModule {}
