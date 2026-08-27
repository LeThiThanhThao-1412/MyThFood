import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PromotionEntity, PromotionUsageEntity } from "./promotion.entity";
import { PromotionRepository } from "./promotion.repository";
import { PromotionService } from "./promotion.service";
import { PromotionController } from "./promotion.controller";

@Module({
  imports: [TypeOrmModule.forFeature([PromotionEntity, PromotionUsageEntity])],
  controllers: [PromotionController],
  providers: [PromotionRepository, PromotionService],
  exports: [PromotionService],
})
export class PromotionModule {}
