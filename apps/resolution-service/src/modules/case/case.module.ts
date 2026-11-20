import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CaseEntity } from "./infrastructure/case.entity";
import { CaseTimelineEntity } from "./infrastructure/case-timeline.entity";
import { CaseRepository } from "./infrastructure/case.repository";
import { CaseService } from "./application/case.service";
import { CaseController } from "./presentation/case.controller";
import { CaseScheduler } from "./application/case.scheduler";
import { PenaltyModule } from "../penalty/penalty.module";
import { AssistantModule } from "../assistant/assistant.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([CaseEntity, CaseTimelineEntity]),
    forwardRef(() => PenaltyModule),
    // Để CaseService gọi nền `AssistantService.triggerAutoAnalysis()` khi có
    // khiếu nại mới (AI phân tích trước, admin chỉ đọc & duyệt).
    forwardRef(() => AssistantModule),
  ],
  controllers: [CaseController],
  providers: [CaseRepository, CaseService, CaseScheduler],
  exports: [CaseRepository, CaseService],
})
export class CaseModule {}
