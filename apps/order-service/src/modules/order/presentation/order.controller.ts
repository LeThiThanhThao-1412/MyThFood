import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  Patch,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Response } from "express";
import { Roles, RolesGuard, Idempotency } from "@mythfood/common";
import { ServiceKeyOrJwtGuard } from "../../auth/service-key-or-jwt.guard";
import { IdempotencyInterceptor } from "../../cache/idempotency.interceptor";
import { OrderService } from "../application/order.service";
import {
  PlaceOrderDto,
  UpdateOrderDto,
  StatusTransitionDto,
  OrderQueryDto,
  OrderResponseDto,
  RecordDriverCancelDto,
  DeliveryFailedDto,
} from "../application/dtos/order.dto";
import { Order } from "../domain/order.aggregate";

@Controller("orders")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  // ===================== Order Placement =====================

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotency({ keyField: "idempotency-key", ttlSeconds: 600 })
  async placeOrder(@Body() dto: PlaceOrderDto): Promise<OrderResponseDto> {
    const order = await this.orderService.placeOrder(dto);
    return this.toOrderResponse(order);
  }

  // ===================== Order Queries =====================

  @Get()
  async findAll(@Query() query: OrderQueryDto) {
    const result = await this.orderService.findAll(query);
    return {
      items: result.items.map((o) => this.toOrderResponse(o)),
      total: result.total,
    };
  }

  @Get("consumer/:consumerId")
  async findByConsumer(
    @Param("consumerId") consumerId: string,
  ): Promise<OrderResponseDto[]> {
    const orders = await this.orderService.findByConsumer(consumerId);
    return orders.map((o) => this.toOrderResponse(o));
  }

  @Get("merchant/:merchantId")
  async findByMerchant(
    @Param("merchantId") merchantId: string,
  ): Promise<OrderResponseDto[]> {
    const orders = await this.orderService.findByMerchant(merchantId);
    return orders.map((o) => this.toOrderResponse(o));
  }

  @Get("driver/:driverId")
  async findByDriver(
    @Param("driverId") driverId: string,
  ): Promise<OrderResponseDto[]> {
    const orders = await this.orderService.findByDriver(driverId);
    return orders.map((o) => this.toOrderResponse(o));
  }

  @Get(":id")
  @UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
  async findById(@Param("id") id: string): Promise<OrderResponseDto> {
    const order = await this.orderService.findById(id);
    return this.toOrderResponse(order);
  }

  // ===================== Order Update =====================

  @Put(":id")
  async updateOrder(
    @Param("id") id: string,
    @Body() dto: UpdateOrderDto,
  ): Promise<OrderResponseDto> {
    const order = await this.orderService.updateOrder(id, dto);
    return this.toOrderResponse(order);
  }

  // ===================== Status Transitions =====================

  @Patch(":id/confirm")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async confirm(@Param("id") id: string): Promise<OrderResponseDto> {
    const order = await this.orderService.confirm(id);
    return this.toOrderResponse(order);
  }

  @Patch(":id/preparing")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async startPreparing(@Param("id") id: string): Promise<OrderResponseDto> {
    const order = await this.orderService.startPreparing(id);
    return this.toOrderResponse(order);
  }

  @Patch(":id/ready")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async markReadyForPickup(@Param("id") id: string): Promise<OrderResponseDto> {
    const order = await this.orderService.markReadyForPickup(id);
    return this.toOrderResponse(order);
  }

  @Patch(":id/out-for-delivery")
  @Roles("DRIVER", "ADMIN")
  async markOutForDelivery(
    @Param("id") id: string,
    @Body() dto: StatusTransitionDto,
  ): Promise<OrderResponseDto> {
    const order = await this.orderService.markOutForDelivery(id, dto);
    return this.toOrderResponse(order);
  }

  @Patch(":id/delivered")
  @Roles("DRIVER", "ADMIN")
  async markDelivered(@Param("id") id: string): Promise<OrderResponseDto> {
    const order = await this.orderService.markDelivered(id);
    return this.toOrderResponse(order);
  }

  @Patch(":id/cancel")
  @Roles("CONSUMER", "MERCHANT_OWNER", "ADMIN")
  async cancel(
    @Param("id") id: string,
    @Body() dto: StatusTransitionDto,
  ): Promise<OrderResponseDto> {
    const order = await this.orderService.cancel(id, dto);
    return this.toOrderResponse(order);
  }

  @Patch(":id/reject")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async reject(
    @Param("id") id: string,
    @Body() dto: StatusTransitionDto,
  ): Promise<OrderResponseDto> {
    const order = await this.orderService.reject(id, dto);
    return this.toOrderResponse(order);
  }

  @Patch(":id/cancel-no-driver")
  @UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
  async cancelNoDriver(@Param("id") id: string): Promise<OrderResponseDto> {
    const order = await this.orderService.cancelNoDriver(id);
    return this.toOrderResponse(order);
  }

  @Patch(":id/assign-driver")
  @UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
  async assignDriver(
    @Param("id") id: string,
    @Body() dto: StatusTransitionDto,
  ): Promise<OrderResponseDto> {
    const order = await this.orderService.assignDriver(id, dto.driverId ?? "");
    return this.toOrderResponse(order);
  }

  @Patch(":id/driver-cancel")
  @UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
  async recordDriverCancel(
    @Param("id") id: string,
    @Body() dto: RecordDriverCancelDto,
  ): Promise<OrderResponseDto> {
    const order = await this.orderService.recordDriverCancel(id, dto.reason);
    return this.toOrderResponse(order);
  }

  @Patch(":id/delivery-failed")
  @UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
  async deliveryFailed(
    @Param("id") id: string,
    @Body() dto: DeliveryFailedDto,
  ): Promise<OrderResponseDto> {
    const order = await this.orderService.deliveryFailed(
      id,
      dto.reason,
      dto.photoUrl,
      dto.faultParty,
    );
    return this.toOrderResponse(order);
  }

  // ===================== Timeline (B6) =====================

  @Get(":id/timeline")
  async getTimeline(@Param("id") id: string): Promise<any> {
    return this.orderService.getTimeline(id);
  }

  @Get(":id/invoice")
  @UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
  @Roles("MERCHANT_OWNER", "ADMIN")
  async getInvoice(
    @Param("id") id: string,
    @Req() req: any,
    @Res() res: Response,
  ): Promise<void> {
    const pdf = await this.orderService.getInvoicePdf(id, req?.user);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${id.slice(0, 8)}.pdf"`,
    });
    res.send(pdf);
  }

  // ===================== Stats Daily (B6) =====================

  @Get("stats/daily")
  @Roles("ADMIN")
  async getDailyStats(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ): Promise<any> {
    return this.orderService.getDailyStats(startDate, endDate);
  }

  // ===================== Merchant Stats (B7) =====================

  @Get("stats/merchant/:merchantId")
  @UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
  @Roles("MERCHANT_OWNER", "ADMIN")
  async getMerchantStats(
    @Param("merchantId") merchantId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ): Promise<any> {
    return this.orderService.getMerchantStats(merchantId, startDate, endDate);
  }

  // ===================== Delete =====================

  @Delete(":id")
  @Roles("ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param("id") id: string): Promise<void> {
    await this.orderService.softDelete(id);
  }

  // ===================== Mapping Helpers =====================

  private toOrderResponse(order: Order): OrderResponseDto {
    return {
      id: order.id.toString(),
      consumerId: order.orderConsumerId,
      merchantId: order.orderMerchantId,
      orderType: order.orderTypeValue,
      status: order.orderStatus,
      items: order.orderItems.map((item) => ({
        menuItemId: item.menuItemId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        specialInstructions: item.specialInstructions,
        options: item.options ?? null,
      })),
      subtotal: order.orderSubtotal,
      deliveryFee: order.orderDeliveryFee,
      serviceFee: order.orderServiceFee,
      discount: order.orderDiscount,
      totalAmount: order.orderTotalAmount,
      deliveryAddress: order.orderDeliveryAddress,
      deliveryLatitude: order.orderDeliveryLatitude,
      deliveryLongitude: order.orderDeliveryLongitude,
      estimatedDeliveryTime:
        order.orderEstimatedDeliveryTime?.toISOString() ?? null,
      notes: order.orderNotes,
      driverId: order.orderDriverId,
      cancelReason: order.orderCancelReason,
      rejectionReason: order.orderRejectionReason,
      paymentMethod: order.orderPaymentMethod,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
