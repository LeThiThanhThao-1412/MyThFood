import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Patch,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { OrderService } from "../application/order.service";
import {
  PlaceOrderDto,
  UpdateOrderDto,
  StatusTransitionDto,
  OrderQueryDto,
  OrderResponseDto,
} from "../application/dtos/order.dto";
import { Order } from "../domain/order.aggregate";

@Controller("orders")
@UseGuards(AuthGuard("jwt"))
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  // ===================== Order Placement =====================

  @Post()
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
  async confirm(@Param("id") id: string): Promise<OrderResponseDto> {
    const order = await this.orderService.confirm(id);
    return this.toOrderResponse(order);
  }

  @Patch(":id/preparing")
  async startPreparing(@Param("id") id: string): Promise<OrderResponseDto> {
    const order = await this.orderService.startPreparing(id);
    return this.toOrderResponse(order);
  }

  @Patch(":id/ready")
  async markReadyForPickup(@Param("id") id: string): Promise<OrderResponseDto> {
    const order = await this.orderService.markReadyForPickup(id);
    return this.toOrderResponse(order);
  }

  @Patch(":id/out-for-delivery")
  async markOutForDelivery(
    @Param("id") id: string,
    @Body() dto: StatusTransitionDto,
  ): Promise<OrderResponseDto> {
    const order = await this.orderService.markOutForDelivery(id, dto);
    return this.toOrderResponse(order);
  }

  @Patch(":id/delivered")
  async markDelivered(@Param("id") id: string): Promise<OrderResponseDto> {
    const order = await this.orderService.markDelivered(id);
    return this.toOrderResponse(order);
  }

  @Patch(":id/cancel")
  async cancel(
    @Param("id") id: string,
    @Body() dto: StatusTransitionDto,
  ): Promise<OrderResponseDto> {
    const order = await this.orderService.cancel(id, dto);
    return this.toOrderResponse(order);
  }

  @Patch(":id/reject")
  async reject(
    @Param("id") id: string,
    @Body() dto: StatusTransitionDto,
  ): Promise<OrderResponseDto> {
    const order = await this.orderService.reject(id, dto);
    return this.toOrderResponse(order);
  }

  // ===================== Delete =====================

  @Delete(":id")
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
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
