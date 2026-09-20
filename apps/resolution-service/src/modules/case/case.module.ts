import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CaseEntity } from "./infrastructure/case.entity";
import { CaseTimelineEntity } from "./infrastructure/case-timeline.entity";
import { CaseRepository } from "./infrastructure/case.repository";
import { CaseService } from "./application/case.service";
import { CaseController } from "./presentation/case.controller";
import { CaseScheduler } from "./application/case.scheduler";

@Module({
  imports: [TypeOrmModule.forFeature([CaseEntity, CaseTimelineEntity])],
  controllers: [CaseController],
  providers: [CaseRepository, CaseService, CaseScheduler],
  exports: [CaseRepository, CaseService],
})
export class CaseModule {}
