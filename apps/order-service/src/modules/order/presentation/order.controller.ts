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
import { Response } from "express";
import { Roles, RolesGuard, Idempotency } from "@mythfood/common";
import { ServiceKeyOrJwtGuard } from "../../auth/service-key-or-jwt.guard";
import { IdempotencyInterceptor } from "../../cache/idempotency.interceptor";
import { OrderService } from "../application/order.service";
import { OrderWarningService } from "../application/order-warning.service";
import { MerchantComplianceService } from "../application/merchant-compliance.service";
import {
  PlaceOrderDto,
  UpdateOrderDto,
  StatusTransitionDto,
  OrderQueryDto,
  OrderResponseDto,
  RecordDriverCancelDto,
  DeliveryFailedDto,
  MarkDeliveredDto,
} from "../application/dtos/order.dto";
import { Order } from "../domain/order.aggregate";

@Controller("orders")
@UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly merchantComplianceService: MerchantComplianceService,
    private readonly orderWarningService: OrderWarningService,
  ) {}

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
  async markDelivered(
    @Param("id") id: string,
    @Body() dto: MarkDeliveredDto,
  ): Promise<OrderResponseDto> {
    const order = await this.orderService.markDelivered(id, dto?.photoUrl);
    return this.toOrderResponse(order);
  }

  @Patch(":id/cancel")
  @Roles("CONSUMER", "MERCHANT_OWNER", "ADMIN")
  async cancel(
    @Param("id") id: string,
    @Body() dto: StatusTransitionDto,
    @Req() req: any,
  ): Promise<OrderResponseDto> {
    const roles: string[] = req.user?.roles ?? [];
    const actorType = roles.includes("MERCHANT_OWNER")
      ? "MERCHANT"
      : roles.includes("ADMIN")
        ? "ADMIN"
        : "CONSUMER";
    const order = await this.orderService.cancel(id, dto, actorType);
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

  @Post(":id/settle-failure-money")
  @UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
  @Roles("ADMIN", "SERVICE")
  async settleFailureMoney(
    @Param("id") id: string,
    @Body()
    body: {
      faultParty: string;
      severity: string;
      caseId?: string;
      resolvedAt?: string;
    },
  ) {
    const data = await this.orderService.settleFailureMoney(
      id,
      body.faultParty,
      body.severity,
      body.caseId,
      body.resolvedAt,
    );
    return { statusCode: 200, data: { ok: true, ...data } };
  }

  /**
   * Bồi thường cho khách khi đơn ĐÃ giao xong nhưng dịch vụ có lỗi (giao trễ...).
   * Số tiền do resolution-service tính theo chính sách; order-service chỉ xác
   * định đúng ví bên chịu / bên nhận rồi gọi wallet-service.
   */
  @Post(":id/settle-compensation")
  @UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
  @Roles("ADMIN", "SERVICE")
  async settleCompensation(
    @Param("id") id: string,
    @Body()
    body: {
      caseId?: string;
      category?: string;
      faultParty: string;
      amount: number;
    },
  ) {
    const data = await this.orderService.settleCompensation(id, body);
    return { statusCode: 200, data: { ok: true, ...data } };
  }

  // ============ Cảnh báo đơn hàng (thay cho phạt tiền) ============

  /** Danh sách cảnh báo của đơn (banner vàng trong chi tiết đơn). */
  @Get(":id/warnings")
  @UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
  @Roles("MERCHANT_OWNER", "ADMIN", "SERVICE")
  async listWarnings(@Param("id") id: string) {
    return this.orderWarningService.listByOrder(id);
  }

  /** Nhà hàng bấm "Đã hiểu" ⇒ ẩn cảnh báo (idempotent). */
  @Post(":id/warnings/:warningId/dismiss")
  @UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
  @Roles("MERCHANT_OWNER", "ADMIN", "SERVICE")
  @HttpCode(HttpStatus.OK)
  async dismissWarning(
    @Param("id") id: string,
    @Param("warningId") warningId: string,
    @Req() req: any,
  ) {
    const dismissedBy = String(
      req?.user?.userId ?? req?.user?.sub ?? req?.user?.id ?? "UNKNOWN",
    );
    return this.orderWarningService.dismiss(id, warningId, dismissedBy);
  }

  /** Cảnh báo còn hiệu lực của một nhà hàng (dùng cho dashboard). */
  @Get("merchant/:merchantId/warnings/active")
  @UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
  @Roles("MERCHANT_OWNER", "ADMIN", "SERVICE")
  async listActiveWarnings(@Param("merchantId") merchantId: string) {
    return this.orderWarningService.listActiveByMerchant(merchantId);
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

  // ===================== Top menu items (global) =====================

  @Get("stats/top-items")
  @Roles("ADMIN")
  async getTopMenuItems(@Query("take") take?: string): Promise<any> {
    const limit = take
      ? Math.min(Math.max(parseInt(take, 10) || 12, 1), 50)
      : 12;
    return this.orderService.getTopMenuItems(limit);
  }

  // ===================== Merchant compliance (tỉ lệ từ chối/không phản hồi) =====================

  @Get("stats/merchant-compliance")
  @Roles("ADMIN")
  async getMerchantCompliance(@Query("days") days?: string): Promise<any> {
    const windowDays = days ? parseInt(days, 10) : undefined;
    return this.merchantComplianceService.getComplianceView(windowDays);
  }

  // ===================== Merchant Stats (B7) =====================

  @Get("stats/delivery-options")
  @Roles("ADMIN")
  async getDeliveryOptionStats(@Query("days") days?: string) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.orderService.getDeliveryOptionStats(
        days ? parseInt(days, 10) : 30,
      ),
    };
  }

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

  @Get("reconciliation/merchant/:merchantId")
  @UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
  @Roles("MERCHANT_OWNER", "ADMIN")
  async getMerchantOrderItems(
    @Param("merchantId") merchantId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ): Promise<any> {
    const items = await this.orderService.getMerchantOrderItems(
      merchantId,
      startDate,
      endDate,
    );
    return { items, total: items.length };
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
        imageUrl: item.imageUrl ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        originalPrice: item.originalPrice ?? null,
        flashSaleFundedBy: item.flashSaleFundedBy ?? null,
        subtotal: item.subtotal,
        specialInstructions: item.specialInstructions,
        options: item.options ?? null,
      })),
      subtotal: order.orderSubtotal,
      deliveryFee: order.orderDeliveryFee,
      serviceFee: order.orderServiceFee,
      discount: order.orderDiscount,
      discountFundedBy: order.orderDiscountFundedBy,
      totalAmount: order.orderTotalAmount,
      deliveryAddress: order.orderDeliveryAddress,
      deliveryLatitude: order.orderDeliveryLatitude,
      deliveryLongitude: order.orderDeliveryLongitude,
      estimatedDeliveryTime:
        order.orderEstimatedDeliveryTime?.toISOString() ?? null,
      deliveryOption: order.orderDeliveryOption,
      deliveryOptionLabel: order.orderDeliveryOptionLabel,
      deliveryOptionFee: order.orderDeliveryOptionFee,
      priorityRank: order.orderPriorityRank,
      promisedDeliveryAt: order.orderPromisedDeliveryAt?.toISOString() ?? null,
      notes: order.orderNotes,
      driverId: order.orderDriverId,
      deliveryProofPhotoUrl: order.orderDeliveryProofPhotoUrl,
      cancelReason: order.orderCancelReason,
      rejectionReason: order.orderRejectionReason,
      rejectionSource: order.orderRejectionSource,
      paymentMethod: order.orderPaymentMethod,
      itemsVersion: order.orderItemsVersion,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
