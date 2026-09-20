import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PenaltyEntity } from "./infrastructure/penalty.entity";
import { AppealEntity } from "./infrastructure/appeal.entity";
import { PenaltyRepository } from "./infrastructure/penalty.repository";
import { PenaltyService } from "./application/penalty.service";
import { PenaltyController } from "./presentation/penalty.controller";
import { CaseModule } from "../case/case.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([PenaltyEntity, AppealEntity]),
    CaseModule,
  ],
  controllers: [PenaltyController],
  providers: [PenaltyRepository, PenaltyService],
  exports: [PenaltyService],
})
export class PenaltyModule {}
