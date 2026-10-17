import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Roles, RolesGuard } from "@mythfood/common";
import { ServiceKeyOrJwtGuard } from "../../auth/service-key-or-jwt.guard";
import { OrderChangeService } from "../application/order-change.service";
import {
  AcceptOrderChangeRequestDto,
  CancelOrderChangeRequestDto,
  CreateOrderChangeRequestDto,
  OrderAdjustmentResponseDto,
  OrderChangeRequestResponseDto,
  RejectOrderChangeRequestDto,
} from "../application/dtos/order-change.dto";

/**
 * Endpoint cho nhà hàng tạo/hủy đề xuất chỉnh sửa và tra cứu biến động giá.
 * Đường dẫn nằm dưới `/orders` để đồng nhất với các API đơn hàng hiện có.
 */
@Controller("orders")
@UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
export class OrderChangeController {
  constructor(private readonly orderChangeService: OrderChangeService) {}

  @Post(":id/change-requests")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async createRequest(
    @Param("id") id: string,
    @Body() dto: CreateOrderChangeRequestDto,
    @Req() req: any,
  ): Promise<OrderChangeRequestResponseDto> {
    return this.orderChangeService.createRequest(id, dto, req.user);
  }

  @Get(":id/change-requests")
  async listRequests(
    @Param("id") id: string,
    @Req() req: any,
  ): Promise<OrderChangeRequestResponseDto[]> {
    return this.orderChangeService.listByOrder(id, req.user);
  }

  @Get(":id/adjustments")
  async listAdjustments(
    @Param("id") id: string,
    @Req() req: any,
  ): Promise<OrderAdjustmentResponseDto[]> {
    return this.orderChangeService.listAdjustments(id, req.user);
  }

  @Get("reconciliation/merchant/:merchantId/adjustments")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async merchantAdjustments(
    @Param("merchantId") merchantId: string,
    @Query("startDate") startDate: string | undefined,
    @Query("endDate") endDate: string | undefined,
    @Req() req: any,
  ): Promise<{
    items: OrderAdjustmentResponseDto[];
    total: number;
    totalDelta: number;
  }> {
    return this.orderChangeService.merchantAdjustments(
      merchantId,
      { startDate, endDate },
      req.user,
    );
  }
}

/**
 * Endpoint cho khách xác nhận/từ chối và cho nhà hàng hủy yêu cầu.
 * Đặt controller riêng để tránh xung đột route `GET /orders/:id`.
 */
@Controller("order-change-requests")
@UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
export class OrderChangeRequestController {
  constructor(private readonly orderChangeService: OrderChangeService) {}

  @Get(":id")
  async getById(
    @Param("id") id: string,
    @Req() req: any,
  ): Promise<OrderChangeRequestResponseDto> {
    return this.orderChangeService.getById(id, req.user);
  }

  @Post(":id/accept")
  @Roles("CONSUMER", "ADMIN")
  async accept(
    @Param("id") id: string,
    @Body() dto: AcceptOrderChangeRequestDto,
    @Req() req: any,
  ) {
    return this.orderChangeService.acceptRequest(id, dto, req.user);
  }

  @Post(":id/reject")
  @Roles("CONSUMER", "ADMIN")
  async reject(
    @Param("id") id: string,
    @Body() dto: RejectOrderChangeRequestDto,
    @Req() req: any,
  ): Promise<OrderChangeRequestResponseDto> {
    return this.orderChangeService.rejectRequest(id, dto, req.user);
  }

  @Post(":id/cancel")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async cancel(
    @Param("id") id: string,
    @Body() dto: CancelOrderChangeRequestDto,
    @Req() req: any,
  ): Promise<OrderChangeRequestResponseDto> {
    return this.orderChangeService.cancelRequest(id, dto, req.user);
  }
}
