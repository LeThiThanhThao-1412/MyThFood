import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CqrsModule } from "@nestjs/cqrs";
import { HttpModule } from "@nestjs/axios";
import { MerchantController } from "./presentation/merchant.controller";
import { MerchantService } from "./application/merchant.service";
import { MerchantRepository } from "./infrastructure/merchant.repository";
import { MerchantEntity } from "./infrastructure/merchant.entity";
import { MenuItemEntity } from "./infrastructure/menu-item.entity";
import { OperatingHoursEntity } from "./infrastructure/operating-hours.entity";
import { MerchantDocumentEntity } from "./infrastructure/merchant-document.entity";
import { PriceHistoryEntity } from "./infrastructure/price-history.entity";
import { PriceAlertEntity } from "./infrastructure/price-alert.entity";
import { PriceHistoryRepository } from "./infrastructure/price-history.repository";
import { MenuUpdatedEventHandler } from "./application/menu-updated.handler";
import { MenuCategoryEntity } from "./infrastructure/menu-category.entity";
import { MenuCategoryRepository } from "./infrastructure/menu-category.repository";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MerchantEntity,
      MenuItemEntity,
      OperatingHoursEntity,
      MerchantDocumentEntity,
      PriceHistoryEntity,
      PriceAlertEntity,
      MenuCategoryEntity,
    ]),
    CqrsModule,
    HttpModule,
    AuthModule,
  ],
  controllers: [MerchantController],
  providers: [
    MerchantService,
    MerchantRepository,
    MenuCategoryRepository,
    PriceHistoryRepository,
    MenuUpdatedEventHandler,
  ],
  exports: [MerchantService],
})
export class MerchantModule {}
