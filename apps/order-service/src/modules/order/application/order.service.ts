import {
  Injectable,
  Logger,
  ForbiddenException,
  ConflictException,
} from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { randomUUID } from "node:crypto";
import { Order } from "../domain/order.aggregate";
import { OrderId } from "../domain/order-id";
import { OrderRepository } from "../infrastructure/order.repository";
import { OrderTimelineRepository } from "../infrastructure/order-timeline.repository";
import { OrderGateway } from "../gateway/order.gateway";
import { BusinessRuleViolationError } from "@mythfood/shared-kernel";
import {
  PlaceOrderDto,
  UpdateOrderDto,
  StatusTransitionDto,
  OrderQueryDto,
} from "./dtos/order.dto";
import { buildInvoicePdf } from "./invoice-pdf";

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly eventBus: EventBus,
    private readonly httpService: HttpService,
    private readonly orderGateway: OrderGateway,
    private readonly orderTimelineRepository: OrderTimelineRepository,
  ) {}

  // ===================== Order Placement =====================

  async placeOrder(dto: PlaceOrderDto): Promise<Order> {
    // Case 2: mỗi tài khoản/thiết bị chỉ được có 1 đơn đang hoạt động tại một thời điểm.
    const hasActiveOrder =
      await this.orderRepository.hasActiveOrderByConsumerId(dto.consumerId);
    if (hasActiveOrder) {
      throw new ConflictException(
        "Bạn đang có một đơn hàng chưa hoàn tất, vui lòng chờ giao xong hoặc hủy đơn cũ trước khi đặt đơn mới",
      );
    }

    let discount = dto.discount ?? 0;
    let discountFundedBy = "MERCHANT";

    if (dto.promotionCode) {
      const validated = await this.validatePromotion(
        dto.promotionCode,
        dto.merchantId,
        dto.consumerId,
        this.computeFoodTotal(dto),
        dto.deliveryFee ?? 0,
        this.promotionItems(dto),
      );
      discount = validated.discount;
      discountFundedBy = validated.fundedBy ?? "MERCHANT";
    }

    const paymentMethod = dto.paymentMethod || "CASH";
    const isCod = paymentMethod === "COD" || paymentMethod === "CASH";
    if (isCod) {
      const orderTotal =
        this.computeFoodTotal(dto) +
        (dto.deliveryFee ?? 0) +
        (dto.serviceFee ?? 0) -
        discount;
      if (orderTotal > 200000) {
        const verified = await this.isConsumerVerified(dto.consumerId);
        if (!verified) {
          throw new ConflictException(
            "Đơn COD trên 200.000đ cần xác minh danh tính (SĐT + CMND) trước khi đặt",
          );
        }
      }
    }

    const result = Order.place({
      consumerId: dto.consumerId,
      userId: dto.userId,
      merchantId: dto.merchantId,
      orderType: dto.orderType as "DELIVERY" | "PICKUP",
      items: dto.items.map((item) => ({
        menuItemId: item.menuItemId,
        name: item.name,
        imageUrl: item.imageUrl ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        specialInstructions: item.specialInstructions,
        options: item.options,
      })),
      deliveryAddress: dto.deliveryAddress ?? null,
      deliveryLatitude: dto.deliveryLatitude ?? null,
      deliveryLongitude: dto.deliveryLongitude ?? null,
      deliveryFee: dto.deliveryFee,
      serviceFee: dto.serviceFee,
      discount,
      discountFundedBy,
      estimatedDeliveryTime: dto.estimatedDeliveryTime
        ? new Date(dto.estimatedDeliveryTime)
        : undefined,
      notes: dto.notes,
      paymentMethod: dto.paymentMethod || "CASH",
    });

    if (result.isFailure) {
      throw result.error;
    }

    const order = result.value;
    await this.orderRepository.save(order);

    // Tiêu thụ voucher bồi thường (nếu khách dùng) — best-effort.
    await this.consumeCompensationVoucher(dto, order.id.toString());

    if (dto.promotionCode) {
      try {
        await this.applyPromotion(
          dto.promotionCode,
          dto.merchantId,
          dto.consumerId,
          order.id.toString(),
          this.computeFoodTotal(dto),
          dto.deliveryFee ?? 0,
          this.promotionItems(dto),
        );
      } catch (err: any) {
        this.logger.warn(
          `Promotion apply failed for order ${order.id.toString()}: ${err.message}`,
        );
      }
    }

    const events = order.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }

    // Emit real-time to merchant
    try {
      this.orderGateway.emitOrderUpdate(order.orderMerchantId, "order:new", {
        id: order.id.toString(),
        consumerId: order.orderConsumerId,
        merchantId: order.orderMerchantId,
        status: order.orderStatus,
        totalAmount: order.orderTotalAmount,
        items: order.orderItems,
        deliveryAddress: order.orderDeliveryAddress,
        notes: order.orderNotes,
        paymentMethod: order.orderPaymentMethod,
        createdAt: order.createdAt,
      });
    } catch {}

    return order;
  }

  // ===================== Order Queries =====================

  async findById(id: string): Promise<Order> {
    return this.orderRepository.findByIdOrFail(OrderId.from(id));
  }

  async findAll(
    query: OrderQueryDto,
  ): Promise<{ items: Order[]; total: number }> {
    return this.orderRepository.findAll({
      status: query.status,
      merchantId: query.merchantId,
      consumerId: query.consumerId,
      skip: query.skip,
      take: query.take,
    });
  }

  async findByConsumer(consumerId: string): Promise<Order[]> {
    return this.orderRepository.findByConsumerId(consumerId);
  }

  async findByMerchant(merchantId: string): Promise<Order[]> {
    return this.orderRepository.findByMerchantId(merchantId);
  }

  async findByDriver(driverId: string): Promise<Order[]> {
    return this.orderRepository.findByDriverId(driverId);
  }

  // ===================== Order Update =====================

  async updateOrder(id: string, dto: UpdateOrderDto): Promise<Order> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));

    if (dto.estimatedDeliveryTime) {
      order.updateEstimatedDeliveryTime(new Date(dto.estimatedDeliveryTime));
    }
    if (dto.notes !== undefined) {
      order.updateNotes(dto.notes);
    }
    if (dto.driverId) {
      order.assignDriver(dto.driverId);
    }

    await this.orderRepository.save(order);
    return order;
  }

  /**
   * Gán tài xế cho đơn (không đổi trạng thái) — dispatch-service gọi khi tài xế
   * nhận đơn. Giúp đơn biết "đã có tài xế" ngay từ lúc nhận, tránh bị hủy nhầm
   * do hết thời gian chờ tài xế.
   */
  async assignDriver(id: string, driverId: string): Promise<Order> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));

    // Thiếu driverId hoặc đơn đã kết thúc thì không làm gì.
    if (!driverId || !order.isActive()) {
      return order;
    }
    // Idempotent: đã gán đúng tài xế này rồi thì không làm gì thêm.
    if (order.orderDriverId === driverId) {
      return order;
    }

    order.assignDriver(driverId);
    await this.orderRepository.save(order);
    return order;
  }

  // ===================== Status Transitions =====================

  async confirm(id: string): Promise<Order> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));
    order.confirm();
    await this.orderRepository.save(order);

    const events = order.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }
    // Emit real-time
    try {
      this.orderGateway.emitOrderUpdate(
        order.orderMerchantId,
        "order:confirmed",
        { id: order.id.toString(), status: "CONFIRMED" },
      );
    } catch {}
    return order;
  }

  async startPreparing(id: string): Promise<Order> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));
    order.startPreparing();
    await this.orderRepository.save(order);

    const events = order.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }
    // Emit real-time
    try {
      this.orderGateway.emitOrderUpdate(
        order.orderMerchantId,
        "order:preparing",
        { id: order.id.toString(), status: "PREPARING" },
      );
    } catch {}
    return order;
  }

  async markReadyForPickup(id: string): Promise<Order> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));
    order.markReadyForPickup();
    await this.orderRepository.save(order);

    const events = order.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }
    // Emit real-time
    try {
      this.orderGateway.emitOrderUpdate(order.orderMerchantId, "order:ready", {
        id: order.id.toString(),
        status: "READY_FOR_PICKUP",
      });
    } catch {}

    // Auto tạo dispatch → matching engine tìm & gán tài xế
    try {
      await this.triggerDispatchCreation(order);
    } catch (err: any) {
      this.logger.warn(
        `Failed to trigger dispatch for order ${id}: ${err.message}`,
      );
    }
    return order;
  }

  private async triggerDispatchCreation(order: Order): Promise<void> {
    const dispatchUrl =
      process.env.DISPATCH_SERVICE_URL || "http://dispatch-service:3008";
    const merchantUrl =
      process.env.MERCHANT_SERVICE_URL || "http://merchant-service:3003";
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";

    let merchantLat: number | undefined;
    let merchantLng: number | undefined;
    try {
      const mRes = await firstValueFrom(
        this.httpService.get(
          `${merchantUrl}/api/v1/merchants/${order.orderMerchantId}`,
          {
            headers: { "x-service-key": serviceKey },
          },
        ),
      );
      const mData: any = (mRes.data as any)?.data ?? mRes.data;
      if (mData?.latitude != null) merchantLat = Number(mData.latitude);
      if (mData?.longitude != null) merchantLng = Number(mData.longitude);
    } catch {
      /* non-fatal */
    }

    await firstValueFrom(
      this.httpService.post(
        `${dispatchUrl}/api/v1/dispatches`,
        {
          orderId: order.id.toString(),
          merchantId: order.orderMerchantId,
          deliveryAddress: order.orderDeliveryAddress ?? "",
          deliveryLatitude: Number(order.orderDeliveryLatitude ?? 10.775),
          deliveryLongitude: Number(order.orderDeliveryLongitude ?? 106.7),
          merchantLatitude:
            merchantLat != null ? Number(merchantLat) : undefined,
          merchantLongitude:
            merchantLng != null ? Number(merchantLng) : undefined,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-service-key": serviceKey,
          },
        },
      ),
    );
  }

  private async updateDriverLocationAfterDelivery(order: Order): Promise<void> {
    const driverId = order.orderDriverId;
    const lat = order.orderDeliveryLatitude;
    const lng = order.orderDeliveryLongitude;
    if (!driverId || lat == null || lng == null) return;

    const driverUrl =
      process.env.DRIVER_SERVICE_URL || "http://driver-service:3007";
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      await firstValueFrom(
        this.httpService.patch(
          `${driverUrl}/api/v1/drivers/${driverId}/location`,
          { latitude: lat, longitude: lng },
          {
            headers: {
              "Content-Type": "application/json",
              "x-service-key": serviceKey,
            },
          },
        ),
      );
      this.logger.log(
        `Driver ${driverId} location auto-updated to delivery point (${lat}, ${lng})`,
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to update driver location after delivery: ${err.message}`,
      );
    }
  }

  /** Giải phóng tài xế khỏi đơn khi đơn bị hủy (clear currentOrderId). */
  private async releaseDriverIfAssigned(order: Order): Promise<void> {
    const driverId = order.orderDriverId;
    if (!driverId) return;

    const driverUrl =
      process.env.DRIVER_SERVICE_URL || "http://driver-service:3007";
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      await firstValueFrom(
        this.httpService.patch(
          `${driverUrl}/api/v1/drivers/${driverId}/release-order`,
          {},
          {
            headers: {
              "Content-Type": "application/json",
              "x-service-key": serviceKey,
            },
          },
        ),
      );
      this.logger.log(
        `Released driver ${driverId} after order ${order.id.toString()} cancelled`,
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to release driver ${driverId} after order ${order.id.toString()} cancelled: ${err.message}`,
      );
    }
  }

  async markOutForDelivery(
    id: string,
    dto: StatusTransitionDto,
  ): Promise<Order> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));
    if (!dto.driverId) {
      throw new Error("Driver ID is required for out-for-delivery transition");
    }
    order.markOutForDelivery(dto.driverId);
    await this.orderRepository.save(order);

    const events = order.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }
    return order;
  }

  async markDelivered(id: string): Promise<Order> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));
    order.markDelivered();
    await this.orderRepository.save(order);

    // Ghi nhận doanh thu (accrue) — chưa cộng vào ví; quyết toán cuối ngày 23:00.
    const walletUrl =
      process.env.WALLET_SERVICE_URL || "http://wallet-service:3009";
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    const foodTotal = order.orderSubtotal || 0;
    const shippingFee = order.orderDeliveryFee || 0;
    const serviceFee = order.orderServiceFee || 0;
    const discount = order.orderDiscount || 0;
    const discountFundedBy = order.orderDiscountFundedBy || "MERCHANT";

    try {
      await firstValueFrom(
        this.httpService.post(
          `${walletUrl}/api/v1/wallets/settlement/accrue`,
          {
            merchantId: order.orderMerchantId,
            driverId: order.orderDriverId,
            orderId: id,
            foodTotal,
            shippingFee,
            serviceFee,
            discount,
            discountFundedBy,
            paymentMethod: order.orderPaymentMethod,
            deliveredAt: new Date().toISOString(),
          },
          {
            headers: { "x-service-key": serviceKey },
          },
        ),
      );
      this.logger.log(
        `Accrue doanh thu đơn ${id}: method=${order.orderPaymentMethod} food=${foodTotal} ship=${shippingFee}`,
      );
    } catch (err: any) {
      this.logger.warn(`Accrue failed for order ${id}: ${err.message}`);
    }

    // Cập nhật vị trí tài xế về điểm giao vừa hoàn thành
    try {
      await this.updateDriverLocationAfterDelivery(order);
    } catch (err: any) {
      this.logger.warn(`Driver location update failed: ${err.message}`);
    }

    // Emit real-time
    try {
      this.orderGateway.emitOrderUpdate(
        order.orderMerchantId,
        "order:delivered",
        {
          id: order.id.toString(),
          status: "DELIVERED",
        },
      );
      this.orderGateway.emitConsumerUpdate(
        order.orderConsumerId,
        "order:delivered",
        {
          id: order.id.toString(),
          status: "DELIVERED",
        },
      );
    } catch {}

    const events = order.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }
    return order;
  }

  async cancel(
    id: string,
    dto: StatusTransitionDto,
    actorType?: string,
  ): Promise<Order> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));
    if (!dto.reason) {
      throw new Error("Cancellation reason is required");
    }

    const isConsumerCancel = actorType === "CONSUMER";
    const prevStatus = order.orderStatus;

    // Khách chỉ được hủy khi đơn còn ở PENDING/CONFIRMED.
    // Khi nhà hàng đã bắt đầu nấu (PREPARING trở đi) → không cho khách hủy nữa.
    if (isConsumerCancel) {
      try {
        order.cancelByCustomer(dto.reason);
      } catch (err) {
        if (err instanceof BusinessRuleViolationError) {
          throw new ConflictException(err.message);
        }
        throw err;
      }
    } else {
      order.cancel(dto.reason);
    }
    await this.orderRepository.save(order);

    // Giải phóng tài xế nếu đơn đã có tài xế (tránh kẹt currentOrderId).
    await this.releaseDriverIfAssigned(order);

    // Auto-refund cho mọi lượt hủy hợp lệ (nhà hàng/admin hủy, hoặc khách tự
    // hủy ở PENDING/CONFIRMED — các trường hợp khác đã bị chặn ở trên).
    const autoRefundAllowed =
      !isConsumerCancel ||
      prevStatus === "PENDING" ||
      prevStatus === "CONFIRMED";
    const isOnlinePaid =
      order.orderPaymentMethod === "WALLET" ||
      order.orderPaymentMethod === "CREDIT_CARD";
    if (autoRefundAllowed && isOnlinePaid && order.orderTotalAmount > 0) {
      try {
        const walletUrl =
          process.env.WALLET_SERVICE_URL || "http://wallet-service:3009";
        const serviceKey =
          process.env.SERVICE_API_KEY || "mythfood-service-key";
        await firstValueFrom(
          this.httpService.post(
            `${walletUrl}/api/v1/wallets/refund`,
            {
              ownerId: order.orderConsumerId,
              ownerType: "CONSUMER",
              amount: order.orderTotalAmount,
              orderId: id,
            },
            {
              headers: { "x-service-key": serviceKey },
            },
          ),
        );
        this.logger.log(
          `Refunded ${order.orderTotalAmount} VND to consumer ${order.orderConsumerId} wallet for cancelled order ${id}`,
        );
      } catch (err: any) {
        this.logger.warn(
          `Wallet refund failed for order ${id}: ${err.message}`,
        );
      }
    }

    // Pha A: mọi hủy đơn từ một phía (khách/nhà hàng) đều mở case để xác minh
    // lý do có đúng sự thật không + thu thập minh chứng trước khi phán quyết.
    if (actorType === "CONSUMER" || actorType === "MERCHANT") {
      const respondentId =
        actorType === "MERCHANT"
          ? order.orderMerchantId
          : order.orderConsumerId;
      const respondentType = actorType === "MERCHANT" ? "MERCHANT" : "CONSUMER";
      await this.openResolutionCase({
        type: "COMPLAINT",
        category: "UNAUTHORIZED_CANCEL",
        orderId: id,
        respondentId,
        respondentType,
        subject: `${actorType === "MERCHANT" ? "Nhà hàng" : "Khách hàng"} hủy đơn`,
        description: `${actorType === "MERCHANT" ? "Nhà hàng" : "Khách hàng"} ${respondentId} hủy đơn ${id.slice(0, 8)}: ${dto.reason}`,
        severity: this.severityForStatus(prevStatus),
      });
    }

    const events = order.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }
    return order;
  }

  async reject(id: string, dto: StatusTransitionDto): Promise<Order> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));
    if (!dto.reason) {
      throw new Error("Rejection reason is required");
    }
    order.reject(dto.reason);
    await this.orderRepository.save(order);

    // Refund online-paid orders (WALLET or card) back to the customer's wallet
    // as store credit. COD orders have no captured money, so nothing to refund.
    const isOnlinePaid =
      order.orderPaymentMethod === "WALLET" ||
      order.orderPaymentMethod === "CREDIT_CARD";
    if (isOnlinePaid && order.orderTotalAmount > 0) {
      try {
        const walletUrl =
          process.env.WALLET_SERVICE_URL || "http://wallet-service:3009";
        const serviceKey =
          process.env.SERVICE_API_KEY || "mythfood-service-key";
        await firstValueFrom(
          this.httpService.post(
            `${walletUrl}/api/v1/wallets/refund`,
            {
              ownerId: order.orderConsumerId,
              ownerType: "CONSUMER",
              amount: order.orderTotalAmount,
              orderId: id,
            },
            {
              headers: { "x-service-key": serviceKey },
            },
          ),
        );
        this.logger.log(
          `Refunded ${order.orderTotalAmount} VND to consumer ${order.orderConsumerId} wallet for rejected order ${id}`,
        );
      } catch (err: any) {
        this.logger.warn(
          `Wallet refund failed for order ${id}: ${err.message}`,
        );
      }
    }

    // Pha A: mở case nhà hàng từ chối đơn để admin theo dõi (chống merchant reject abuse).
    await this.openResolutionCase({
      type: "COMPLAINT",
      category: "MERCHANT_BEHAVIOR",
      orderId: id,
      respondentId: order.orderMerchantId,
      respondentType: "MERCHANT",
      subject: "Nhà hàng từ chối đơn",
      description: `Nhà hàng ${order.orderMerchantId} từ chối đơn ${id.slice(0, 8)}: ${dto.reason}`,
    });

    const events = order.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }
    // Emit real-time
    try {
      this.orderGateway.emitOrderUpdate(
        order.orderMerchantId,
        "order:rejected",
        {
          id: order.id.toString(),
          status: "REJECTED",
          rejectionReason: dto.reason,
        },
      );
      this.orderGateway.emitConsumerUpdate(
        order.orderConsumerId,
        "order:rejected",
        {
          id: order.id.toString(),
          status: "REJECTED",
          rejectionReason: dto.reason,
        },
      );
    } catch {}
    return order;
  }

  /**
   * Case 3: không có tài xế nhận đơn → tự động hủy đơn.
   * - Chuyển trạng thái sang CANCELLED_NO_DRIVER.
   * - Hoàn tiền 100% nếu khách đã thanh toán online (WALLET/CREDIT_CARD).
   * - Gửi thông báo cho khách kèm gợi ý đặt lại.
   */
  async cancelNoDriver(id: string, reason?: string): Promise<Order> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));

    // Nếu đơn đã ở trạng thái kết thúc thì không làm gì thêm (idempotent).
    if (!order.isActive()) {
      return order;
    }

    // Đơn đã có tài xế nhận → KHÔNG hủy do "không có tài xế".
    if (order.orderDriverId) {
      this.logger.log(
        `Skip no-driver cancellation: order ${id} already has driver ${order.orderDriverId}`,
      );
      return order;
    }

    order.cancelNoDriver(reason);
    await this.orderRepository.save(order);

    // Hoàn tiền 100% nếu đã thanh toán online (COD không có tiền đã thu).
    const isOnlinePaid =
      order.orderPaymentMethod === "WALLET" ||
      order.orderPaymentMethod === "CREDIT_CARD";
    if (isOnlinePaid && order.orderTotalAmount > 0) {
      try {
        const walletUrl =
          process.env.WALLET_SERVICE_URL || "http://wallet-service:3009";
        const serviceKey =
          process.env.SERVICE_API_KEY || "mythfood-service-key";
        await firstValueFrom(
          this.httpService.post(
            `${walletUrl}/api/v1/wallets/refund`,
            {
              ownerId: order.orderConsumerId,
              ownerType: "CONSUMER",
              amount: order.orderTotalAmount,
              orderId: id,
            },
            {
              headers: { "x-service-key": serviceKey },
            },
          ),
        );
        this.logger.log(
          `Refunded ${order.orderTotalAmount} VND to consumer ${order.orderConsumerId} for no-driver order ${id}`,
        );
      } catch (err: any) {
        this.logger.warn(
          `Wallet refund failed for no-driver order ${id}: ${err.message}`,
        );
      }
    }

    // Gửi thông báo in-app cho khách (best-effort).
    try {
      await this.sendNoDriverNotification(order);
    } catch (err: any) {
      this.logger.warn(
        `No-driver notification failed for order ${id}: ${err.message}`,
      );
    }

    // Bồi thường voucher cho khách (best-effort, giá trị do admin cấu hình).
    try {
      await this.issueCompensationVoucher(order);
    } catch (err: any) {
      this.logger.warn(
        `Compensation voucher issue failed for order ${id}: ${err.message}`,
      );
    }

    const events = order.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }

    // Emit real-time
    try {
      this.orderGateway.emitOrderUpdate(
        order.orderMerchantId,
        "order:cancelled-no-driver",
        { id: order.id.toString(), status: "CANCELLED_NO_DRIVER" },
      );
      this.orderGateway.emitConsumerUpdate(
        order.orderConsumerId,
        "order:cancelled-no-driver",
        { id: order.id.toString(), status: "CANCELLED_NO_DRIVER" },
      );
    } catch {}

    return order;
  }

  private async sendNoDriverNotification(order: Order): Promise<void> {
    const userId = order.orderUserId;
    if (!userId) {
      this.logger.warn(
        `Cannot notify consumer for order ${order.id.toString()}: userId not recorded on order`,
      );
      return;
    }

    const notificationUrl =
      process.env.NOTIFICATION_SERVICE_URL ||
      "http://notification-service:3013";
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    await firstValueFrom(
      this.httpService.post(
        `${notificationUrl}/api/v1/notifications`,
        {
          userId,
          type: "ORDER_CANCELLED_NO_DRIVER",
          title: "Đơn hàng của bạn đã bị hủy",
          body: `Không có tài xế nhận đơn. Bạn nhận được voucher "Bồi thường #${order.id.toString().slice(0, 8)}" dùng 1 lần cho đơn tiếp theo.`,
          data: {
            orderId: order.id.toString(),
            status: "CANCELLED_NO_DRIVER",
          },
        },
        {
          headers: { "x-service-key": serviceKey },
        },
      ),
    );
  }

  private async issueCompensationVoucher(order: Order): Promise<void> {
    const promoUrl =
      process.env.PROMOTION_SERVICE_URL || "http://promotion-service:3012";
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    await firstValueFrom(
      this.httpService.post(
        `${promoUrl}/api/v1/promotions/compensation-vouchers/issue`,
        {
          consumerId: order.orderConsumerId,
          sourceOrderId: order.id.toString(),
        },
        {
          headers: { "x-service-key": serviceKey },
        },
      ),
    );
  }

  private async consumeCompensationVoucher(
    dto: PlaceOrderDto,
    orderId: string,
  ): Promise<void> {
    if (!dto.compensationVoucherId) return;
    const promoUrl =
      process.env.PROMOTION_SERVICE_URL || "http://promotion-service:3012";
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      await firstValueFrom(
        this.httpService.post(
          `${promoUrl}/api/v1/promotions/compensation-vouchers/apply`,
          {
            voucherId: dto.compensationVoucherId,
            consumerId: dto.consumerId,
            orderId,
          },
          {
            headers: { "x-service-key": serviceKey },
          },
        ),
      );
    } catch (err: any) {
      this.logger.warn(
        `Compensation voucher apply failed for order ${orderId}: ${err.message}`,
      );
    }
  }

  /**
   * Case 7: ghi lý do tài xế hủy đơn (sau khi đã nhận) vào lịch sử + thông báo khách.
   */
  async recordDriverCancel(id: string, reason: string): Promise<Order> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));

    await this.orderTimelineRepository.record({
      id: randomUUID(),
      orderId: id,
      previousStatus: order.orderStatus,
      newStatus: order.orderStatus,
      reason: `Tài xế hủy đơn: ${reason}`,
      occurredAt: new Date(),
    });

    const driverId = order.orderDriverId;

    // Gỡ tài xế khỏi đơn để đơn quay lại "chưa có tài xế" (tìm tài xế mới)
    // và xóa floating card bên tài xế cũ.
    order.clearDriver();
    await this.orderRepository.save(order);

    // Pha A: mở case tài xế hủy đơn trái phép để admin điều tra (chống cancel abuse).
    if (driverId) {
      await this.openResolutionCase({
        type: "COMPLAINT",
        category: "UNAUTHORIZED_CANCEL",
        orderId: id,
        respondentId: driverId,
        respondentType: "DRIVER",
        subject: "Tài xế hủy đơn sau khi nhận",
        description: `Tài xế ${driverId} hủy đơn ${id.slice(0, 8)}: ${reason}`,
      });
    }

    try {
      await this.sendDriverCancelNotification(order, reason);
    } catch (err: any) {
      this.logger.warn(`Driver-cancel notification failed: ${err.message}`);
    }

    return order;
  }

  /**
   * Case 8: tài xế giao hàng thất bại → chuyển trạng thái + thông báo khẩn.
   */
  async deliveryFailed(
    id: string,
    reason: string,
    photoUrl?: string,
    faultParty?: string,
  ): Promise<Order> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));

    if (!order.isActive()) {
      return order;
    }

    order.markDeliveryFailed(reason);
    await this.orderRepository.save(order);

    const events = order.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }

    try {
      await this.sendDeliveryFailedNotification(order, reason);
    } catch (err: any) {
      this.logger.warn(`Delivery-failed notification failed: ${err.message}`);
    }

    // Tiền chỉ được route khi có phán quyết cuối cùng (khách xác nhận / hết hạn 72h /
    // admin phán quyết) qua settleFailureMoney() — không route ngay tại deliveryFailed
    // để tránh trả tiền sai bên khi faultParty chưa chốt.

    // Pha A: tự mở case để admin điều tra/phán quyết.
    const respondentType = faultParty === "DRIVER" ? "DRIVER" : "CONSUMER";
    const respondentId =
      faultParty === "DRIVER"
        ? order.orderDriverId
        : order.orderConsumerId;
    if (respondentId) {
      await this.openResolutionCase({
        type: "COMPLAINT",
        category: "NOT_RECEIVED",
        orderId: id,
        respondentId,
        respondentType,
        subject: "Giao hàng thất bại",
        description: `Đơn ${id.slice(0, 8)} giao thất bại: ${reason} (lỗi ${faultParty || "CUSTOMER"})`,
        evidence: photoUrl ? [photoUrl] : undefined,
        severity: "HIGH",
        reporterId: order.orderDriverId ?? undefined,
        reporterType: order.orderDriverId ? "DRIVER" : undefined,
        responseDeadline:
          faultParty === "CUSTOMER"
            ? new Date(Date.now() + 72 * 3600 * 1000).toISOString()
            : undefined,
      });
    }

    return order;
  }

  private computeFine(severity: string, total: number): number {
    const table: Record<
      string,
      { rate: number; floor: number; ceiling: number }
    > = {
      LOW: { rate: 0, floor: 0, ceiling: 0 },
      MEDIUM: { rate: 0.15, floor: 20000, ceiling: 200000 },
      HIGH: { rate: 0.25, floor: 40000, ceiling: 500000 },
      CRITICAL: { rate: 0.4, floor: 80000, ceiling: 1500000 },
    };
    const cfg = table[severity] ?? { rate: 0, floor: 0, ceiling: 0 };
    if (cfg.rate === 0) return 0;
    return Math.min(
      cfg.ceiling,
      Math.max(cfg.floor, Math.round(cfg.rate * total)),
    );
  }

  private async walletPost(path: string, body: unknown): Promise<void> {
    const walletUrl =
      process.env.WALLET_SERVICE_URL || "http://wallet-service:3009";
    await firstValueFrom(
      this.httpService.post(`${walletUrl}${path}`, body, {
        headers: { "x-service-key": this.serviceKey },
      }),
    );
  }

  private async freezeConsumer(consumerId: string): Promise<void> {
    const consumerUrl =
      process.env.CONSUMER_SERVICE_URL || "http://consumer-service:3002";
    await firstValueFrom(
      this.httpService.patch(
        `${consumerUrl}/api/v1/consumers/${consumerId}/status`,
        { status: "SUSPENDED" },
        { headers: { "x-service-key": this.serviceKey } },
      ),
    );
  }

  private async isConsumerVerified(consumerId: string): Promise<boolean> {
    try {
      const consumerUrl =
        process.env.CONSUMER_SERVICE_URL || "http://consumer-service:3002";
      const res = await firstValueFrom(
        this.httpService.get(`${consumerUrl}/api/v1/consumers/${consumerId}`, {
          headers: { "x-service-key": this.serviceKey },
        }),
      );
      const data: any = res.data;
      const consumer = data?.data ?? data;
      return !!consumer?.isVerified;
    } catch {
      return false;
    }
  }

  private async reservePay(
    recipientId: string,
    recipientType: string,
    amount: number,
    description: string,
  ): Promise<void> {
    const walletUrl =
      process.env.WALLET_SERVICE_URL || "http://wallet-service:3009";
    await firstValueFrom(
      this.httpService.post(
        `${walletUrl}/api/v1/wallets/reserve/disburse`,
        { recipientId, recipientType, amount, description },
        { headers: { "x-service-key": this.serviceKey } },
      ),
    );
  }

  /**
   * Route tiền khi đơn giao thất bại đã có phán quyết cuối cùng.
   * Theo ma trận docs/TIEN_THEO_TRANG_THAI.md (COD vs online × bên lỗi).
   */
  async settleFailureMoney(
    id: string,
    faultParty: string,
    severity: string,
  ): Promise<void> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));
    const foodTotal = Math.max(order.orderSubtotal - order.orderDiscount, 0);
    const shippingFee = order.orderDeliveryFee;
    const total = order.orderTotalAmount;
    const isOnline =
      order.orderPaymentMethod === "WALLET" ||
      order.orderPaymentMethod === "CREDIT_CARD";
    const customerId = order.orderConsumerId;
    const driverId = order.orderDriverId;
    const merchantId = order.orderMerchantId;
    const fine = this.computeFine(severity, total);
    const short = id.slice(0, 8);
    const safe = (fn: () => Promise<void>) =>
      fn().catch((err) =>
        this.logger.warn(`Settle failure money step failed: ${err?.message}`),
      );

    switch (faultParty) {
      case "CUSTOMER": {
        if (isOnline) {
          // WALLET đã trừ / CREDIT_CARD HELD: giữ nguyên để settle trả các bên.
        } else {
          if (driverId && shippingFee > 0)
            await safe(() =>
              this.reservePay(driverId, "DRIVER", shippingFee,
                `Ứng trả phí ship do khách lỗi #${short}`),
            );
          if (merchantId && foodTotal > 0)
            await safe(() =>
              this.reservePay(merchantId, "MERCHANT", foodTotal,
                `Ứng trả món do khách lỗi #${short}`),
            );
          if (customerId && foodTotal + shippingFee > 0)
            await safe(() =>
              this.walletPost("/api/v1/wallets/penalty/debit", {
                ownerId: customerId, ownerType: "CONSUMER",
                amount: foodTotal + shippingFee,
                description: `Nợ giao thất bại do khách lỗi #${short}`,
              }),
            );
          if (customerId) await safe(() => this.freezeConsumer(customerId));
        }
        if (fine > 0 && customerId)
          await safe(() =>
            this.walletPost("/api/v1/wallets/penalty/debit", {
              ownerId: customerId, ownerType: "CONSUMER", amount: fine,
              description: `Phạt lỗi khách #${short}`,
            }),
          );
        break;
      }
      case "DRIVER": {
        if (isOnline && customerId && total > 0)
          await safe(() =>
            this.walletPost("/api/v1/wallets/refund", {
              ownerId: customerId, ownerType: "CONSUMER", amount: total,
              orderId: id,
            }),
          );
        if (merchantId && foodTotal > 0)
          await safe(() =>
            this.walletPost("/api/v1/wallets/penalty/credit", {
              ownerId: merchantId, ownerType: "MERCHANT", amount: foodTotal,
              description: `Tài xế bồi thường tiền món #${short}`,
            }),
          );
        if (driverId) {
          const driverCharge = foodTotal + shippingFee + fine;
          if (driverCharge > 0)
            await safe(() =>
              this.walletPost("/api/v1/wallets/penalty/debit", {
                ownerId: driverId, ownerType: "DRIVER", amount: driverCharge,
                description: `Tài xế bồi thường + mất phí ship + phạt #${short}`,
              }),
            );
        }
        break;
      }
      case "MERCHANT": {
        if (isOnline && customerId && total > 0)
          await safe(() =>
            this.walletPost("/api/v1/wallets/refund", {
              ownerId: customerId, ownerType: "CONSUMER", amount: total,
              orderId: id,
            }),
          );
        if (driverId && shippingFee > 0)
          await safe(() =>
            this.walletPost("/api/v1/wallets/compensate-driver", {
              driverId, orderId: id, shippingFee,
            }),
          );
        if (merchantId && fine > 0)
          await safe(() =>
            this.walletPost("/api/v1/wallets/penalty/debit", {
              ownerId: merchantId, ownerType: "MERCHANT", amount: fine,
              description: `Phạt lỗi nhà hàng #${short}`,
            }),
          );
        break;
      }
      case "SYSTEM": {
        if (isOnline && customerId && total > 0)
          await safe(() =>
            this.walletPost("/api/v1/wallets/refund", {
              ownerId: customerId, ownerType: "CONSUMER", amount: total,
              orderId: id,
            }),
          );
        if (merchantId && foodTotal > 0)
          await safe(() =>
            this.reservePay(merchantId, "MERCHANT", foodTotal,
              `Platform bồi thường món #${short}`),
          );
        if (driverId && shippingFee > 0)
          await safe(() =>
            this.reservePay(driverId, "DRIVER", shippingFee,
              `Platform bồi thường phí ship #${short}`),
          );
        break;
      }
      default:
        break;
    }
  }

  // ===================== Resolution & Compliance (auto case + penalty) =====================

  private get serviceKey(): string {
    return process.env.SERVICE_API_KEY || "mythfood-service-key";
  }

  /** Gợi ý mức nghiêm trọng theo trạng thái đơn lúc xảy ra sự cố. */
  private severityForStatus(status: string): string {
    switch (status) {
      case "PENDING":
        return "LOW";
      case "CONFIRMED":
      case "PREPARING":
        return "MEDIUM";
      case "READY_FOR_PICKUP":
        return "HIGH";
      case "OUT_FOR_DELIVERY":
        return "CRITICAL";
      default:
        return "LOW";
    }
  }

  /** Tự mở case khiếu nại ở resolution-service để admin điều tra/phán quyết. */
  private async openResolutionCase(input: {
    type: "COMPLAINT" | "FRAUD_REPORT";
    category: string;
    respondentId: string;
    respondentType: string;
    subject: string;
    description: string;
    orderId: string;
    evidence?: string[];
    severity?: string;
    reporterId?: string;
    reporterType?: string;
    responseDeadline?: string;
  }): Promise<void> {
    const url =
      process.env.RESOLUTION_SERVICE_URL || "http://resolution-service:3014";
    try {
      await firstValueFrom(
        this.httpService.post(`${url}/api/v1/cases`, input, {
          headers: { "x-service-key": this.serviceKey },
        }),
      );
    } catch (err: any) {
      this.logger.warn(`openResolutionCase failed: ${err.message}`);
    }
  }

  private async sendDriverCancelNotification(
    order: Order,
    reason: string,
  ): Promise<void> {
    const userId = order.orderUserId;
    if (!userId) return;
    await this.postNotification({
      userId,
      type: "ORDER_DRIVER_CANCELLED",
      title: "Tài xế đã hủy đơn của bạn",
      body: `Lý do: ${reason}. Hệ thống đang tìm tài xế khác.`,
      data: { orderId: order.id.toString(), reason },
    });
  }

  private async sendDeliveryFailedNotification(
    order: Order,
    reason: string,
  ): Promise<void> {
    const userId = order.orderUserId;
    if (!userId) return;
    await this.postNotification({
      userId,
      type: "ORDER_DELIVERY_FAILED",
      title: "Đơn hàng giao thất bại — bạn bị khiếu nại",
      body: `Tài xế báo giao thất bại: ${reason}. Vào đơn để phản hồi hoặc xác nhận.`,
      data: { orderId: order.id.toString(), reason },
    });
  }

  private async postNotification(payload: {
    userId: string;
    type: string;
    title: string;
    body?: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    const notificationUrl =
      process.env.NOTIFICATION_SERVICE_URL ||
      "http://notification-service:3013";
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    await firstValueFrom(
      this.httpService.post(
        `${notificationUrl}/api/v1/notifications`,
        payload,
        { headers: { "x-service-key": serviceKey } },
      ),
    );
  }

  // ===================== Timeline =====================

  async getTimeline(id: string): Promise<any> {
    await this.orderRepository.findByIdOrFail(OrderId.from(id));
    const entries = await this.orderTimelineRepository.findByOrderId(id);
    return {
      orderId: id,
      timeline: entries.map((e) => ({
        id: e.id,
        previousStatus: e.previous_status,
        newStatus: e.new_status,
        reason: e.reason,
        occurredAt: e.occurred_at,
      })),
    };
  }

  // ===================== Invoice (print / PDF) =====================

  async getInvoicePdf(
    id: string,
    user?: { userId: string; roles: string[] },
  ): Promise<Buffer> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));

    // Chỉ merchant sở hữu (hoặc admin/service) mới được xem hóa đơn
    if (
      user &&
      !(user.roles || []).includes("ADMIN") &&
      user.userId !== "service"
    ) {
      await this.assertMerchantOwnership(order.orderMerchantId, user.userId);
    }

    const merchant = await this.tryFetchMerchant(order.orderMerchantId);
    const createdAt = await this.orderRepository.getCreatedAt(
      order.id.toString(),
    );
    return buildInvoicePdf(order, merchant, createdAt);
  }

  private merchantServiceCandidates(): string[] {
    const urls = [
      process.env.MERCHANT_SERVICE_URL,
      "http://merchant-service:3003",
      "http://localhost:3003",
    ].filter((u): u is string => !!u);
    return [...new Set(urls)];
  }

  private async fetchMerchant(merchantId: string): Promise<any | null> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    let lastErr: any = null;
    for (const base of this.merchantServiceCandidates()) {
      try {
        const res = await firstValueFrom(
          this.httpService.get(`${base}/api/v1/merchants/${merchantId}`, {
            headers: { "x-service-key": serviceKey },
          }),
        );
        return res.data ?? null;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr ?? new Error("merchant-service unreachable");
  }

  private async assertMerchantOwnership(
    merchantId: string,
    userId: string,
  ): Promise<void> {
    try {
      const merchant = await this.fetchMerchant(merchantId);
      if (!merchant || merchant.userId !== userId) {
        throw new ForbiddenException(
          "Bạn chỉ có thể in hóa đơn của nhà hàng của bạn",
        );
      }
    } catch (err: any) {
      if (err instanceof ForbiddenException) {
        throw err;
      }
      this.logger.warn(
        `Failed to verify merchant ownership for ${merchantId}: ${err?.message}`,
      );
      throw new ForbiddenException("Không thể xác minh quyền truy cập hóa đơn");
    }
  }

  private async tryFetchMerchant(merchantId: string): Promise<any | null> {
    try {
      return await this.fetchMerchant(merchantId);
    } catch {
      return null;
    }
  }

  // ===================== Stats Daily =====================

  async getDailyStats(startDate?: string, endDate?: string): Promise<any> {
    return this.orderRepository.getDailyStats({ startDate, endDate });
  }

  // ===================== Merchant Stats (used by merchant-service) =====================

  async getMerchantStats(
    merchantId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<any> {
    return this.orderRepository.getMerchantStats(merchantId, {
      startDate,
      endDate,
    });
  }

  // ===================== Top menu items (global) =====================

  async getTopMenuItems(
    take?: number,
  ): Promise<
    Array<{
      menuItemId: string;
      merchantId: string;
      name: string;
      quantity: number;
    }>
  > {
    return this.orderRepository.getTopMenuItems(take);
  }

  // ===================== Delete =====================

  async softDelete(id: string): Promise<void> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));
    await this.orderRepository.delete(order);
  }

  // ===================== Promotion integration =====================

  private computeFoodTotal(dto: PlaceOrderDto): number {
    return dto.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );
  }

  private promotionItems(dto: PlaceOrderDto): {
    menuItemId: string;
    quantity: number;
    unitPrice: number;
  }[] {
    return dto.items.map((item) => ({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }));
  }

  private async validatePromotion(
    code: string,
    merchantId: string,
    consumerId: string,
    foodTotal: number,
    shippingFee: number,
    items: { menuItemId: string; quantity: number; unitPrice: number }[],
  ): Promise<{ discount: number; fundedBy: string }> {
    const url =
      process.env.PROMOTION_SERVICE_URL || "http://promotion-service:3012";
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    const res = await firstValueFrom(
      this.httpService.post(
        `${url}/api/v1/promotions/validate`,
        { code, merchantId, consumerId, foodTotal, shippingFee, items },
        {
          headers: {
            "Content-Type": "application/json",
            "x-service-key": serviceKey,
          },
        },
      ),
    );
    const data: any = res.data?.data ?? res.data;
    return {
      discount: Number(data?.discount ?? 0),
      fundedBy: data?.fundedBy ?? "MERCHANT",
    };
  }

  private async applyPromotion(
    code: string,
    merchantId: string,
    consumerId: string,
    orderId: string,
    foodTotal: number,
    shippingFee: number,
    items: { menuItemId: string; quantity: number; unitPrice: number }[],
  ): Promise<void> {
    const url =
      process.env.PROMOTION_SERVICE_URL || "http://promotion-service:3012";
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    await firstValueFrom(
      this.httpService.post(
        `${url}/api/v1/promotions/apply`,
        {
          code,
          merchantId,
          orderId,
          consumerId,
          foodTotal,
          shippingFee,
          items,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-service-key": serviceKey,
          },
        },
      ),
    );
  }
}
