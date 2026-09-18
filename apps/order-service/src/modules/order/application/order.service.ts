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

    const result = Order.place({
      consumerId: dto.consumerId,
      userId: dto.userId,
      merchantId: dto.merchantId,
      orderType: dto.orderType as "DELIVERY" | "PICKUP",
      items: dto.items.map((item) => ({
        menuItemId: item.menuItemId,
        name: item.name,
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

    // Only settle COD if payment method is CASH/COD
    this.logger.log(
      `🔍 [COD-DEBUG] Order ${id} delivered - paymentMethod=${order.orderPaymentMethod}`,
    );
    const walletUrl =
      process.env.WALLET_SERVICE_URL || "http://wallet-service:3009";
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    const foodTotal = order.orderSubtotal || 0;
    const shippingFee = order.orderDeliveryFee || 0;
    const serviceFee = order.orderServiceFee || 0;
    const discount = order.orderDiscount || 0;
    const discountFundedBy = order.orderDiscountFundedBy || "MERCHANT";

    if (
      order.orderPaymentMethod === "CASH" ||
      order.orderPaymentMethod === "COD"
    ) {
      this.logger.log(`🔍 [COD-DEBUG] → COD order - settling...`);
      try {
        await firstValueFrom(
          this.httpService.post(
            `${walletUrl}/api/v1/wallets/settle/cod`,
            {
              merchantId: order.orderMerchantId,
              driverId: order.orderDriverId,
              orderId: id,
              foodTotal,
              shippingFee,
              serviceFee,
              discount,
              discountFundedBy,
            },
            {
              headers: { "x-service-key": serviceKey },
            },
          ),
        );
        this.logger.log(
          `COD Settled for order ${id}: food=${foodTotal} ship=${shippingFee} discount=${discount} fundedBy=${discountFundedBy}`,
        );
      } catch (err: any) {
        this.logger.warn(`COD settle failed for order ${id}: ${err.message}`);
      }
    } else {
      this.logger.log(
        `🔍 [COD-DEBUG] → Card order - online settlement (driver +ship, merchant/platform/tax split)`,
      );
      try {
        await firstValueFrom(
          this.httpService.post(
            `${walletUrl}/api/v1/wallets/settle/online`,
            {
              merchantId: order.orderMerchantId,
              driverId: order.orderDriverId,
              orderId: id,
              foodTotal,
              shippingFee,
              serviceFee,
              discount,
              discountFundedBy,
            },
            {
              headers: { "x-service-key": serviceKey },
            },
          ),
        );
        this.logger.log(
          `Online Settled for order ${id}: driver +${shippingFee} ship, food=${foodTotal} discount=${discount} fundedBy=${discountFundedBy}`,
        );
      } catch (err: any) {
        this.logger.warn(
          `Online settle failed for order ${id}: ${err.message}`,
        );
      }
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

  async cancel(id: string, dto: StatusTransitionDto): Promise<Order> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));
    if (!dto.reason) {
      throw new Error("Cancellation reason is required");
    }
    order.cancel(dto.reason);
    await this.orderRepository.save(order);

    // Giải phóng tài xế nếu đơn đã có tài xế (tránh kẹt currentOrderId).
    await this.releaseDriverIfAssigned(order);

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
          `Refunded ${order.orderTotalAmount} VND to consumer ${order.orderConsumerId} wallet for cancelled order ${id}`,
        );
      } catch (err: any) {
        this.logger.warn(
          `Wallet refund failed for order ${id}: ${err.message}`,
        );
      }
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
    _photoUrl?: string,
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

    // Case 8 bồi thường: lỗi khách → bồi thường phí ship cho tài xế;
    // lỗi tài xế → hoàn tiền khách hàng.
    try {
      await this.settleDeliveryFailure(order, faultParty);
    } catch (err: any) {
      this.logger.warn(`Delivery-failure settlement failed: ${err.message}`);
    }

    return order;
  }

  private async settleDeliveryFailure(
    order: Order,
    faultParty?: string,
  ): Promise<void> {
    const walletUrl =
      process.env.WALLET_SERVICE_URL || "http://wallet-service:3009";
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";

    if (faultParty === "DRIVER") {
      // Lỗi tài xế → hoàn tiền khách (store credit).
      if (
        (order.orderPaymentMethod === "WALLET" ||
          order.orderPaymentMethod === "CREDIT_CARD") &&
        order.orderTotalAmount > 0
      ) {
        await firstValueFrom(
          this.httpService.post(
            `${walletUrl}/api/v1/wallets/refund`,
            {
              ownerId: order.orderConsumerId,
              ownerType: "CONSUMER",
              amount: order.orderTotalAmount,
              orderId: order.id.toString(),
            },
            { headers: { "x-service-key": serviceKey } },
          ),
        );
      }
      return;
    }

    // Lỗi khách (bùng đơn/không liên lạc) → tài xế được đền bù phí ship.
    if (order.orderDriverId && order.orderDeliveryFee > 0) {
      await firstValueFrom(
        this.httpService.post(
          `${walletUrl}/api/v1/wallets/compensate-driver`,
          {
            driverId: order.orderDriverId,
            orderId: order.id.toString(),
            shippingFee: order.orderDeliveryFee,
          },
          { headers: { "x-service-key": serviceKey } },
        ),
      );
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
      title: "Giao hàng thất bại",
      body: `Không thể giao đơn hàng: ${reason}. Vui lòng kiểm tra thông tin chi tiết.`,
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
