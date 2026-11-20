import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles, RolesGuard } from "@mythfood/common";
import {
  ShippingService,
  ShippingFeeResponse,
  ShippingQuoteResponse,
} from "./shipping.service";
import { DeliveryOptionConfigService } from "./delivery-option-config.service";
import { UpdateDeliveryOptionConfigDto } from "./dtos/delivery-option-config.dto";
import {
  DELIVERY_OPTIONS,
  DeliveryOption,
  normalizeDeliveryOption,
} from "../order/domain/delivery-option";

@Controller("shipping")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class ShippingController {
  constructor(
    private readonly shippingService: ShippingService,
    private readonly configService: DeliveryOptionConfigService,
  ) {}

  // ─── Admin: cấu hình phương thức giao hàng (Phase 3) ───────────────────

  @Get("options/config")
  @Roles("ADMIN")
  async listOptionConfigs() {
    const policies = await Promise.all(
      DELIVERY_OPTIONS.map((option) => this.configService.getPolicy(option)),
    );
    return { statusCode: HttpStatus.OK, data: policies };
  }

  @Put("options/config/:option")
  @Roles("ADMIN")
  async updateOptionConfig(
    @Param("option") option: string,
    @Body() dto: UpdateDeliveryOptionConfigDto,
  ) {
    const normalized: DeliveryOption = normalizeDeliveryOption(option);
    const policy = await this.configService.update(normalized, dto);
    return { statusCode: HttpStatus.OK, data: policy };
  }

  /**
   * Báo giá cả 3 phương thức giao hàng (SAVER / FAST / PRIORITY) cho checkout.
   * Giữ `/shipping/fee` bên dưới để tương thích ngược (trả phí FAST).
   */
  @Get("quote")
  async getShippingQuote(
    @Query("originLat") originLat: string,
    @Query("originLng") originLng: string,
    @Query("destLat") destLat: string,
    @Query("destLng") destLng: string,
  ): Promise<ShippingQuoteResponse> {
    return this.shippingService.quoteAll({
      originLat: parseFloat(originLat),
      originLng: parseFloat(originLng),
      destLat: parseFloat(destLat),
      destLng: parseFloat(destLng),
    });
  }

  @Get("fee")
  async getShippingFee(
    @Query("originLat") originLat: string,
    @Query("originLng") originLng: string,
    @Query("destLat") destLat: string,
    @Query("destLng") destLng: string,
  ): Promise<ShippingFeeResponse> {
    return this.shippingService.calculateFee({
      originLat: parseFloat(originLat),
      originLng: parseFloat(originLng),
      destLat: parseFloat(destLat),
      destLng: parseFloat(destLng),
    });
  }
}
