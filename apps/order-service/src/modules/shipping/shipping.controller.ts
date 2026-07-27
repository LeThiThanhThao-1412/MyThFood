import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ShippingService, ShippingFeeResponse } from "./shipping.service";

@Controller("shipping")
@UseGuards(AuthGuard("jwt"))
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

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