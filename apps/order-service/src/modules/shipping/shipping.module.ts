import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ShippingController } from "./shipping.controller";
import { ShippingService } from "./shipping.service";
import { DeliveryOptionConfigService } from "./delivery-option-config.service";
import { DeliveryOptionConfigEntity } from "./delivery-option-config.entity";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [TypeOrmModule.forFeature([DeliveryOptionConfigEntity]), AuthModule],
  controllers: [ShippingController],
  providers: [ShippingService, DeliveryOptionConfigService],
  exports: [ShippingService, DeliveryOptionConfigService],
})
export class ShippingModule {}
