import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HttpModule } from "@nestjs/axios";
import {
  PromotionEntity,
  PromotionUsageEntity,
  CompensationConfigEntity,
  CompensationVoucherEntity,
  FlashSaleEntity,
  FlashSaleItemEntity,
  FlashSaleUsageEntity,
} from "./promotion.entity";
import { PromotionRepository } from "./promotion.repository";
import { PromotionService } from "./promotion.service";
import { PromotionController } from "./promotion.controller";

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([
      PromotionEntity,
      PromotionUsageEntity,
      CompensationConfigEntity,
      CompensationVoucherEntity,
      FlashSaleEntity,
      FlashSaleItemEntity,
      FlashSaleUsageEntity,
    ]),
  ],
  controllers: [PromotionController],
  providers: [PromotionRepository, PromotionService],
  exports: [PromotionService],
})
export class PromotionModule {}
