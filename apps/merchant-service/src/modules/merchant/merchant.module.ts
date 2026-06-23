import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CqrsModule } from "@nestjs/cqrs";
import { MerchantController } from "./presentation/merchant.controller";
import { MerchantService } from "./application/merchant.service";
import { MerchantRepository } from "./infrastructure/merchant.repository";
import { MerchantEntity } from "./infrastructure/merchant.entity";
import { MenuItemEntity } from "./infrastructure/menu-item.entity";
import { OperatingHoursEntity } from "./infrastructure/operating-hours.entity";
import { MerchantDocumentEntity } from "./infrastructure/merchant-document.entity";
import { PriceHistoryEntity } from "./infrastructure/price-history.entity";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MerchantEntity,
      MenuItemEntity,
      OperatingHoursEntity,
      MerchantDocumentEntity,
      PriceHistoryEntity,
    ]),
    CqrsModule,
    AuthModule,
  ],
  controllers: [MerchantController],
  providers: [MerchantService, MerchantRepository],
  exports: [MerchantService],
})
export class MerchantModule {}
