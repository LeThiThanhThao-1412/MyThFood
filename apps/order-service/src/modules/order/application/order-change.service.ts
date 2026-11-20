import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { EventBus } from "@nestjs/cqrs";
import { firstValueFrom } from "rxjs";
import { randomUUID } from "node:crypto";
import {
  Order,
  OrderItemOption,
  OrderItemProps,
} from "../domain/order.aggregate";
import { OrderId } from "../domain/order-id";
import {
  computeAfterDiscount,
  isItemEditable,
  isOfflinePaymentMethod,
  resolveAdjustmentMoney,
  summarizeItemChanges,
  AdjustmentMoneyPlan,
} from "../domain/order-change.policy";
import { OrderRepository } from "../infrastructure/order.repository";
import { OrderChangeRequestRepository } from "../infrastructure/order-change-request.repository";
import { OrderAdjustmentRepository } from "../infrastructure/order-adjustment.repository";
import { OrderTimelineRepository } from "../infrastructure/order-timeline.repository";
import { OrderChangeRequestEntity } from "../infrastructure/order-change-request.entity";
import { OrderAdjustmentEntity } from "../infrastructure/order-adjustment.entity";
import { OrderGateway } from "../gateway/order.gateway";
import {
  AcceptOrderChangeRequestDto,
  CancelOrderChangeRequestDto,
  ChangeItemDto,
  ChangeItemSnapshot,
  CreateOrderChangeRequestDto,
  OrderAdjustmentResponseDto,
  OrderChangeRequestResponseDto,
  RejectOrderChangeRequestDto,
} from "./dtos/order-change.dto";

interface MenuItemOptionFromApi {
  id: string;
  name: string;
  priceDelta: number;
  isDefault?: boolean;
  minQuantity?: number | null;
  maxQuantity?: number | null;
}

interface MenuItemOptionGroupFromApi {
  id: string;
  name: string;
  type?: string;
  required?: boolean;
  minSelections?: number | null;
  maxSelections?: number | null;
  options?: MenuItemOptionFromApi[];
}

interface MenuItemFromApi {
  id: string;
  name: string;
  imageUrl?: string | null;
  price: number;
  originalPrice?: number | null;
  isAvailable?: boolean;
  availabilityStatus?: string;
  optionGroups?: MenuItemOptionGroupFromApi[];
}

interface RequestUser {
  userId: string;
  roles: string[];
}

@Injectable()
export class OrderChangeService {
  private readonly logger = new Logger(OrderChangeService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly changeRequestRepository: OrderChangeRequestRepository,
    private readonly adjustmentRepository: OrderAdjustmentRepository,
    private readonly orderTimelineRepository: OrderTimelineRepository,
    private readonly orderGateway: OrderGateway,
    private readonly httpService: HttpService,
    private readonly eventBus: EventBus,
  ) {}

  // ===================== Merchant: create / cancel =====================

  /**
   * Nhà hàng tạo đề xuất chỉnh sửa món. Chưa thay đổi gì trên đơn — chỉ lưu
   * snapshot trước/sau và chờ khách xác nhận.
   */
  async createRequest(
    orderId: string,
    dto: CreateOrderChangeRequestDto,
    user: RequestUser,
  ): Promise<OrderChangeRequestResponseDto> {
    const order = await this.orderRepository.findByIdOrFail(
      OrderId.from(orderId),
    );
    await this.assertMerchantOwnership(order.orderMerchantId, user);

    if (!isItemEditable(order.orderStatus)) {
      throw new ConflictException(
        `Không thể chỉnh sửa món khi đơn đang ở trạng thái ${order.orderStatus}`,
      );
    }

    const menu = await this.fetchMenu(order.orderMerchantId);
    const afterItems = this.buildAfterItems(order, dto.items, menu);
    if (afterItems.length === 0) {
      throw new BadRequestException("Đơn hàng phải còn ít nhất một món");
    }

    const beforeSnapshots = order.orderItems.map((item) =>
      this.toSnapshot(item),
    );
    const afterSnapshots = afterItems.map((item) => this.toSnapshot(item));

    const beforeSubtotal = Number(order.orderSubtotal);
    const beforeDiscount = Number(order.orderDiscount);
    const beforeTotal = Number(order.orderTotalAmount);

    const afterSubtotal = afterSnapshots.reduce(
      (sum, item) => sum + item.subtotal,
      0,
    );
    const previewDiscount = await this.previewDiscount(
      order,
      afterSubtotal,
      afterSnapshots,
    );
    const afterDiscount = Math.min(previewDiscount, afterSubtotal);
    const afterTotal =
      afterSubtotal +
      Number(order.orderDeliveryFee) +
      Number(order.orderServiceFee) -
      afterDiscount;
    const deltaAmount = afterTotal - beforeTotal;

    // COD: giữ nguyên quy tắc xác minh danh tính cho đơn > 200.000đ khi tăng tiền.
    if (
      isOfflinePaymentMethod(order.orderPaymentMethod) &&
      deltaAmount > 0 &&
      afterTotal > 200000 &&
      afterTotal > beforeTotal
    ) {
      const verified = await this.isConsumerVerified(order.orderConsumerId);
      if (!verified) {
        throw new ConflictException(
          "Đơn COD trên 200.000đ cần xác minh danh tính (SĐT + CMND) trước khi tăng giá trị",
        );
      }
    }

    const expiresAt = new Date(Date.now() + this.requestTtlMinutes * 60_000);

    // Chỉ hủy yêu cầu cũ sau khi dữ liệu mới đã hợp lệ, tránh trường hợp
    // request mới lỗi lại làm mất request đang chờ hợp lệ của đơn.
    const active =
      await this.changeRequestRepository.findActiveByOrderId(orderId);
    if (active) {
      await this.changeRequestRepository.cancelActiveByOrderId(
        orderId,
        "Được thay thế bởi yêu cầu chỉnh sửa mới",
      );
    }

    let entity: OrderChangeRequestEntity;
    try {
      entity = await this.changeRequestRepository.create({
        id: randomUUID(),
        order_id: order.id.toString(),
        merchant_id: order.orderMerchantId,
        consumer_id: order.orderConsumerId,
        status: "PENDING",
        reason: dto.reason ?? null,
        reject_reason: null,
        before_items: beforeSnapshots as unknown as Record<string, unknown>[],
        after_items: afterSnapshots as unknown as Record<string, unknown>[],
        before_subtotal: beforeSubtotal,
        before_discount: beforeDiscount,
        before_total: beforeTotal,
        after_subtotal: afterSubtotal,
        after_discount: afterDiscount,
        after_total: afterTotal,
        delta_amount: deltaAmount,
        payment_method: order.orderPaymentMethod,
        money_status: "NONE",
        adjustment_payment_id: null,
        adjustment_txn_id: null,
        before_items_version: order.orderItemsVersion,
        created_by: user?.userId ?? null,
        confirmed_at: null,
        expires_at: expiresAt,
      });
    } catch (err: any) {
      const code = err?.code ?? err?.driverError?.code;
      if (code === "23505") {
        throw new ConflictException(
          "Đơn đang có yêu cầu chỉnh sửa chờ xác nhận, vui lòng hủy yêu cầu cũ trước",
        );
      }
      throw err;
    }

    await this.recordTimeline(
      order,
      `Nhà hàng đề xuất chỉnh sửa món: ${dto.reason ?? "không có lý do"}`,
    );

    try {
      await this.notifyConsumer(order, {
        type: "ORDER_CHANGE_REQUESTED",
        title: "Nhà hàng đề xuất chỉnh sửa đơn hàng",
        body: this.buildChangeNotificationBody(
          beforeSnapshots,
          afterSnapshots,
          deltaAmount,
          order.orderPaymentMethod,
        ),
        data: {
          orderId: order.id.toString(),
          changeRequestId: entity.id,
          deltaAmount,
        },
      });
    } catch (err: any) {
      this.logger.warn(
        `Notify consumer change-request failed: ${err?.message ?? err}`,
      );
    }

    try {
      this.orderGateway.emitOrderUpdate(
        order.orderMerchantId,
        "order:change-requested",
        {
          id: order.id.toString(),
          changeRequestId: entity.id,
          status: "PENDING",
        },
      );
      this.orderGateway.emitConsumerUpdate(
        order.orderConsumerId,
        "order:change-requested",
        {
          id: order.id.toString(),
          changeRequestId: entity.id,
          status: "PENDING",
        },
      );
    } catch {
      /* non-fatal */
    }

    return this.toResponse(entity);
  }

  async cancelRequest(
    requestId: string,
    dto: CancelOrderChangeRequestDto,
    user: RequestUser,
  ): Promise<OrderChangeRequestResponseDto> {
    const request = await this.requireRequest(requestId);
    const order = await this.requireOrder(request.order_id);
    await this.assertMerchantOwnership(order.orderMerchantId, user);

    if (request.status !== "PENDING" && request.status !== "AWAITING_PAYMENT") {
      throw new ConflictException(
        `Không thể hủy yêu cầu ở trạng thái ${request.status}`,
      );
    }

    request.status = "CANCELLED";
    request.reject_reason = dto.reason ?? "Nhà hàng hủy đề xuất chỉnh sửa";
    await this.settleAdjustmentPaymentOnCancel(
      request,
      order,
      "Nhà hàng hủy đề xuất chỉnh sửa",
    );
    await this.changeRequestRepository.save(request);

    await this.recordTimeline(order, "Nhà hàng hủy đề xuất chỉnh sửa món");

    try {
      await this.notifyConsumer(order, {
        type: "ORDER_CHANGE_CANCELLED",
        title: "Nhà hàng đã hủy đề xuất chỉnh sửa đơn",
        body: request.reject_reason ?? undefined,
        data: {
          orderId: order.id.toString(),
          changeRequestId: request.id,
        },
      });
    } catch (err: any) {
      this.logger.warn(
        `Notify consumer change-cancel failed: ${err?.message ?? err}`,
      );
    }

    try {
      this.orderGateway.emitConsumerUpdate(
        order.orderConsumerId,
        "order:change-cancelled",
        { id: order.id.toString(), changeRequestId: request.id },
      );
    } catch {
      /* non-fatal */
    }

    return this.toResponse(request);
  }

  // ===================== Consumer: accept / reject =====================

  /**
   * Khách xác nhận đề xuất.
   *
   * - COD/không chênh lệch: áp dụng ngay.
   * - WALLET tăng: trừ ví trước rồi mới áp dụng (thiếu tiền → 409, giữ PENDING).
   * - CREDIT_CARD tăng: tạo PaymentIntent bổ sung, trả clientSecret; khách
   *   thanh toán rồi gọi lại endpoint này kèm `paymentId` để áp dụng.
   * - Giảm: áp dụng rồi hoàn phần chênh lệch vào ví (best-effort + log retry).
   */
  async acceptRequest(
    requestId: string,
    dto: AcceptOrderChangeRequestDto,
    user: RequestUser,
  ): Promise<{
    changeRequest: OrderChangeRequestResponseDto;
    order?: any;
    requiresPayment: boolean;
    payment?: { paymentId: string; clientSecret: string; amount: number };
  }> {
    const request = await this.requireRequest(requestId);
    if (request.status !== "PENDING" && request.status !== "AWAITING_PAYMENT") {
      throw new ConflictException(`Yêu cầu đã ở trạng thái ${request.status}`);
    }

    const order = await this.requireOrder(request.order_id);
    this.assertConsumerAccess(order, user);

    if (!isItemEditable(order.orderStatus)) {
      request.status = "CANCELLED";
      request.reject_reason = `Đơn đã chuyển sang ${order.orderStatus}`;
      await this.changeRequestRepository.save(request);
      throw new ConflictException(
        `Đơn đã chuyển sang trạng thái ${order.orderStatus}, không thể chỉnh sửa`,
      );
    }

    if (request.expires_at && request.expires_at.getTime() <= Date.now()) {
      request.status = "EXPIRED";
      request.reject_reason = "Yêu cầu đã hết hạn xác nhận";
      await this.changeRequestRepository.save(request);
      throw new ConflictException("Yêu cầu chỉnh sửa đã hết hạn xác nhận");
    }

    if (order.orderItemsVersion !== request.before_items_version) {
      throw new ConflictException(
        "Đơn đã thay đổi kể từ khi tạo đề xuất, vui lòng tạo lại yêu cầu",
      );
    }

    const plan = resolveAdjustmentMoney(
      order.orderPaymentMethod,
      Number(request.delta_amount),
    );

    // Stripe yêu cầu khoản thanh toán tối thiểu ~50 cent (≈13.000 VND). Với
    // chênh lệch nhỏ hơn, fallback trừ vào ví thay vì tạo PaymentIntent.
    const cardMinimum = Number(process.env.CARD_ADJUSTMENT_MIN_AMOUNT || 13000);
    let effectivePlan = plan;
    if (
      request.status === "PENDING" &&
      plan.mode === "CARD_CHARGE" &&
      plan.amount < cardMinimum
    ) {
      this.logger.log(
        `Card adjustment ${plan.amount} below Stripe minimum ${cardMinimum}; fallback to wallet for request ${request.id}`,
      );
      effectivePlan = {
        mode: "WALLET_CHARGE",
        amount: plan.amount,
        requiresPayment: false,
      };
    }

    // Bước 2 của CREDIT_CARD: khách đã thanh toán khoản bổ sung.
    if (
      request.status === "AWAITING_PAYMENT" ||
      (plan.mode === "CARD_CHARGE" && !!dto.paymentId)
    ) {
      if (!dto.paymentId) {
        throw new BadRequestException(
          "Thiếu paymentId của khoản thanh toán bổ sung",
        );
      }
      const verified = await this.verifyAdjustmentPayment(
        dto.paymentId,
        request,
      );
      const applied = await this.applyRequest(order, request, plan, {
        paymentId: verified.paymentId,
        transactionId: verified.transactionId,
      });
      return {
        changeRequest: this.toResponse(request),
        order: applied,
        requiresPayment: false,
      };
    }

    // CREDIT_CARD & delta > 0: tạo PaymentIntent bổ sung trước.
    if (effectivePlan.mode === "CARD_CHARGE") {
      const payment = await this.createAdjustmentPayment(order, request);
      request.status = "AWAITING_PAYMENT";
      request.money_status = "AWAITING_PAYMENT";
      request.adjustment_payment_id = payment.paymentId;
      await this.changeRequestRepository.save(request);
      return {
        changeRequest: this.toResponse(request),
        requiresPayment: true,
        payment,
      };
    }

    // WALLET & delta > 0: trừ ví trước khi áp dụng.
    if (effectivePlan.mode === "WALLET_CHARGE") {
      await this.chargeWallet(order, request, effectivePlan);
    }

    const applied = await this.applyRequest(order, request, effectivePlan, {});
    return {
      changeRequest: this.toResponse(request),
      order: applied,
      requiresPayment: false,
    };
  }

  async rejectRequest(
    requestId: string,
    dto: RejectOrderChangeRequestDto,
    user: RequestUser,
  ): Promise<OrderChangeRequestResponseDto> {
    const request = await this.requireRequest(requestId);
    if (request.status !== "PENDING" && request.status !== "AWAITING_PAYMENT") {
      throw new ConflictException(
        `Không thể từ chối yêu cầu ở trạng thái ${request.status}`,
      );
    }
    const order = await this.requireOrder(request.order_id);
    this.assertConsumerAccess(order, user);

    request.status = "REJECTED";
    request.reject_reason = dto.reason?.trim() || "Khách từ chối chỉnh sửa";
    await this.settleAdjustmentPaymentOnCancel(
      request,
      order,
      "Khách từ chối chỉnh sửa",
    );
    await this.changeRequestRepository.save(request);

    await this.recordTimeline(
      order,
      `Khách từ chối chỉnh sửa món: ${request.reject_reason}`,
    );

    try {
      const merchant = await this.tryFetchMerchant(order.orderMerchantId);
      if (merchant?.userId) {
        await this.postNotification({
          userId: merchant.userId,
          type: "ORDER_CHANGE_REJECTED",
          title: "Khách từ chối chỉnh sửa đơn",
          body: `Đơn #${order.id.toString().slice(0, 8)}: ${request.reject_reason}`,
          data: {
            orderId: order.id.toString(),
            changeRequestId: request.id,
          },
        });
      }
    } catch (err: any) {
      this.logger.warn(
        `Notify merchant change-reject failed: ${err?.message ?? err}`,
      );
    }

    try {
      this.orderGateway.emitOrderUpdate(
        order.orderMerchantId,
        "order:change-rejected",
        { id: order.id.toString(), changeRequestId: request.id },
      );
    } catch {
      /* non-fatal */
    }

    return this.toResponse(request);
  }

  // ===================== Scheduler helpers =====================

  async expireRequests(): Promise<number> {
    const expired = await this.changeRequestRepository.findExpired(new Date());
    let count = 0;
    for (const request of expired) {
      try {
        // Khách đã thanh toán khoản bổ sung nhưng chưa bấm áp dụng → ưu tiên
        // áp dụng thay đổi (khách đã trả tiền) nếu đơn vẫn còn chỉnh được.
        if (
          request.status === "AWAITING_PAYMENT" &&
          request.adjustment_payment_id
        ) {
          const payment = await this.fetchAdjustmentPayment(
            request.adjustment_payment_id,
          );
          if (payment?.status === "COMPLETED") {
            const order = await this.tryRequireOrder(request.order_id);
            if (
              order &&
              isItemEditable(order.orderStatus) &&
              order.orderItemsVersion === request.before_items_version
            ) {
              const plan = resolveAdjustmentMoney(
                order.orderPaymentMethod,
                Number(request.delta_amount),
              );
              await this.applyRequest(order, request, plan, {
                paymentId: request.adjustment_payment_id,
                transactionId: payment.transactionId ?? "",
              });
              count += 1;
              continue;
            }
            this.logger.warn(
              `Change request ${request.id} paid but order ${request.order_id} is no longer editable; refunding the difference`,
            );
            if (order) {
              const plan = resolveAdjustmentMoney(
                order.orderPaymentMethod,
                Number(request.delta_amount),
              );
              const refunded = await this.refundWallet(order, request, plan);
              request.money_status = refunded ? "REFUNDED" : "FAILED";
            }
          } else {
            await this.releaseAdjustmentPaymentHold(
              request,
              "Yêu cầu hết hạn xác nhận",
            );
          }
        }

        request.status = "EXPIRED";
        request.reject_reason = "Hết hạn xác nhận của khách";
        await this.changeRequestRepository.save(request);

        const order = await this.tryRequireOrder(request.order_id);
        if (order) {
          await this.recordTimeline(
            order,
            "Yêu cầu chỉnh sửa món hết hạn xác nhận",
          );
          await this.notifyConsumer(order, {
            type: "ORDER_CHANGE_EXPIRED",
            title: "Đề xuất chỉnh sửa đơn đã hết hạn",
            body: "Bạn không xác nhận trong thời gian quy định nên đơn được giữ nguyên.",
            data: {
              orderId: order.id.toString(),
              changeRequestId: request.id,
            },
          }).catch(() => undefined);
          this.orderGateway.emitOrderUpdate(
            order.orderMerchantId,
            "order:change-expired",
            { id: order.id.toString(), changeRequestId: request.id },
          );
        }
        count += 1;
      } catch (err: any) {
        this.logger.warn(
          `Expire change request ${request.id} failed: ${err?.message ?? err}`,
        );
      }
    }
    return count;
  }

  /** Hủy yêu cầu đang chờ khi đơn bị hủy/từ chối/chuyển trạng thái không cho sửa. */
  async cancelActiveForOrder(orderId: string, reason: string): Promise<void> {
    const all = await this.changeRequestRepository.findByOrderId(orderId);
    const active = all.filter(
      (request) =>
        request.status === "PENDING" || request.status === "AWAITING_PAYMENT",
    );
    if (active.length === 0) return;

    const order = await this.tryRequireOrder(orderId);
    for (const request of active) {
      if (!request.adjustment_payment_id) continue;
      const payment = await this.fetchAdjustmentPayment(
        request.adjustment_payment_id,
      );
      if (!payment) {
        await this.releaseAdjustmentPaymentHold(
          request,
          `Không xác minh được payment, hủy giữ tiền: ${reason}`,
        );
        continue;
      }

      if (payment.status === "COMPLETED" && order) {
        // Khách đã trả khoản bổ sung nhưng thay đổi chưa áp dụng (đơn bị hủy
        // hoặc chuyển trạng thái) → hoàn phần chênh lệch vào ví khách.
        const plan = resolveAdjustmentMoney(
          order.orderPaymentMethod,
          Number(request.delta_amount),
        );
        await this.refundWallet(order, request, plan);
      } else {
        await this.releaseAdjustmentPaymentHold(
          request,
          `Yêu cầu chỉnh sửa bị hủy: ${reason}`,
        );
      }
    }

    const affected = await this.changeRequestRepository.cancelActiveByOrderId(
      orderId,
      reason,
    );
    if (affected > 0) {
      this.logger.log(
        `Cancelled ${affected} active change request(s) for order ${orderId}: ${reason}`,
      );
    }
  }

  private async fetchAdjustmentPayment(paymentId: string): Promise<any | null> {
    const paymentUrl =
      process.env.PAYMENT_SERVICE_URL || "http://payment-service:3006";
    try {
      const res = await firstValueFrom(
        this.httpService.get(`${paymentUrl}/api/v1/payments/${paymentId}`, {
          headers: { "x-service-key": this.serviceKey },
        }),
      );
      return res.data?.data ?? res.data ?? null;
    } catch (err: any) {
      this.logger.warn(
        `Fetch adjustment payment ${paymentId} failed: ${err?.message ?? err}`,
      );
      return null;
    }
  }

  /**
   * Khi yêu cầu bị hủy/từ chối: nếu khách đã trả khoản bổ sung thì hoàn lại
   * vào ví, nếu chưa thì hủy PaymentIntent để nhả tiền giữ trên thẻ.
   */
  private async settleAdjustmentPaymentOnCancel(
    request: OrderChangeRequestEntity,
    order: Order,
    reason: string,
  ): Promise<void> {
    if (!request.adjustment_payment_id) return;
    const payment = await this.fetchAdjustmentPayment(
      request.adjustment_payment_id,
    );
    if (!payment) {
      await this.releaseAdjustmentPaymentHold(request, reason);
      return;
    }
    if (payment?.status === "COMPLETED") {
      const plan = resolveAdjustmentMoney(
        order.orderPaymentMethod,
        Number(request.delta_amount),
      );
      const refunded = await this.refundWallet(order, request, plan);
      request.money_status = refunded ? "REFUNDED" : "FAILED";
      return;
    }
    await this.releaseAdjustmentPaymentHold(request, reason);
  }

  /** Hủy PaymentIntent (release hold) nếu khách chưa thanh toán khoản bổ sung. */
  private async releaseAdjustmentPaymentHold(
    request: OrderChangeRequestEntity,
    reason: string,
  ): Promise<void> {
    if (!request.adjustment_payment_id) return;
    const paymentUrl =
      process.env.PAYMENT_SERVICE_URL || "http://payment-service:3006";
    try {
      await firstValueFrom(
        this.httpService.patch(
          `${paymentUrl}/api/v1/payments/${request.adjustment_payment_id}/fail`,
          { reason },
          { headers: { "x-service-key": this.serviceKey } },
        ),
      );
    } catch (err: any) {
      this.logger.warn(
        `Release adjustment payment ${request.adjustment_payment_id} failed: ${err?.message ?? err}`,
      );
    }
  }

  // ===================== Apply change (transaction + money) =====================

  private async applyRequest(
    order: Order,
    request: OrderChangeRequestEntity,
    plan: AdjustmentMoneyPlan,
    payment: { paymentId?: string; transactionId?: string },
  ): Promise<Order> {
    const afterSnapshots =
      request.after_items as unknown as ChangeItemSnapshot[];
    const beforeSnapshots =
      request.before_items as unknown as ChangeItemSnapshot[];
    const afterItems: OrderItemProps[] = afterSnapshots.map((snapshot) =>
      this.snapshotToOrderItem(snapshot),
    );

    try {
      order.applyItemChange({
        items: afterItems,
        reason: request.reason ?? undefined,
        discount: Number(request.after_discount),
      });
      await this.orderRepository.saveWithItemsTx(order);
    } catch (err: any) {
      // Trừ ví đã thành công nhưng áp dụng đơn thất bại → hoàn lại ngay.
      if (plan.mode === "WALLET_CHARGE") {
        await this.refundWallet(order, request, plan).catch(() => undefined);
      }
      throw err;
    }

    let moneyStatus: string = "NOT_REQUIRED";
    if (plan.mode === "WALLET_CHARGE" || plan.mode === "CARD_CHARGE") {
      moneyStatus = "CHARGED";
    } else if (
      plan.mode === "WALLET_REFUND" ||
      plan.mode === "CARD_REFUND_TO_WALLET"
    ) {
      const refunded = await this.refundWallet(order, request, plan);
      moneyStatus = refunded ? "REFUNDED" : "FAILED";
    }

    await this.adjustmentRepository
      .create({
        id: randomUUID(),
        order_id: order.id.toString(),
        change_request_id: request.id,
        merchant_id: order.orderMerchantId,
        consumer_id: order.orderConsumerId,
        before_items: beforeSnapshots as unknown as Record<string, unknown>[],
        after_items: afterSnapshots as unknown as Record<string, unknown>[],
        before_subtotal: Number(request.before_subtotal),
        before_discount: Number(request.before_discount),
        before_total: Number(request.before_total),
        after_subtotal: Number(request.after_subtotal),
        after_discount: Number(request.after_discount),
        after_total: Number(request.after_total),
        delta_amount: Number(request.delta_amount),
        payment_method: request.payment_method,
        money_status: moneyStatus,
        settlement_status: "PENDING_ACCRUAL",
      })
      .catch((err: any) => {
        // Không chặn việc áp dụng đơn chỉ vì lỗi ghi nhật ký; log để đối soát.
        this.logger.error(
          `Create order adjustment log failed for order ${order.id.toString()}: ${err?.message ?? err}`,
        );
        return null;
      });

    request.status = "APPLIED";
    request.money_status =
      moneyStatus as OrderChangeRequestEntity["money_status"];
    request.confirmed_at = new Date();
    if (payment.paymentId) {
      request.adjustment_payment_id = payment.paymentId;
    }
    if (payment.transactionId) {
      request.adjustment_txn_id = payment.transactionId;
    }
    await this.changeRequestRepository.save(request);

    const delta = Number(request.delta_amount);
    const deltaText =
      delta === 0
        ? "không thay đổi tổng tiền"
        : delta > 0
          ? `khách trả thêm ${delta.toLocaleString("vi-VN")}đ`
          : `hoàn khách ${Math.abs(delta).toLocaleString("vi-VN")}đ`;

    await this.recordTimeline(
      order,
      `Áp dụng chỉnh sửa món (v${order.orderItemsVersion}): ${deltaText}`,
    );

    try {
      await this.notifyConsumer(order, {
        type: "ORDER_CHANGE_APPLIED",
        title: "Đơn hàng đã được cập nhật",
        body: `Nhà hàng đã cập nhật món theo xác nhận của bạn (${deltaText}).`,
        data: {
          orderId: order.id.toString(),
          changeRequestId: request.id,
          deltaAmount: delta,
          totalAmount: order.orderTotalAmount,
        },
      });
    } catch (err: any) {
      this.logger.warn(
        `Notify consumer change-applied failed: ${err?.message ?? err}`,
      );
    }

    try {
      const merchant = await this.tryFetchMerchant(order.orderMerchantId);
      if (merchant?.userId) {
        await this.postNotification({
          userId: merchant.userId,
          type: "ORDER_CHANGE_APPLIED",
          title: "Khách đã đồng ý chỉnh sửa đơn",
          body: `Đơn #${order.id.toString().slice(0, 8)}: ${deltaText}.`,
          data: {
            orderId: order.id.toString(),
            changeRequestId: request.id,
            deltaAmount: delta,
          },
        });
      }
    } catch (err: any) {
      this.logger.warn(
        `Notify merchant change-applied failed: ${err?.message ?? err}`,
      );
    }

    if (order.orderDriverId) {
      try {
        const driver = await this.tryFetchDriver(order.orderDriverId);
        if (driver?.userId) {
          await this.postNotification({
            userId: driver.userId,
            type: "ORDER_AMOUNT_UPDATED",
            title: "Đơn hàng thay đổi số tiền cần thu",
            body: `Đơn #${order.id.toString().slice(0, 8)}: thu ${Number(order.orderTotalAmount).toLocaleString("vi-VN")}đ khi giao.`,
            data: {
              orderId: order.id.toString(),
              totalAmount: order.orderTotalAmount,
            },
          });
        }
      } catch (err: any) {
        this.logger.warn(
          `Notify driver amount-updated failed: ${err?.message ?? err}`,
        );
      }
    }

    try {
      this.orderGateway.emitOrderUpdate(
        order.orderMerchantId,
        "order:change-applied",
        {
          id: order.id.toString(),
          changeRequestId: request.id,
          totalAmount: order.orderTotalAmount,
          itemsVersion: order.orderItemsVersion,
        },
      );
      this.orderGateway.emitConsumerUpdate(
        order.orderConsumerId,
        "order:change-applied",
        {
          id: order.id.toString(),
          changeRequestId: request.id,
          totalAmount: order.orderTotalAmount,
          itemsVersion: order.orderItemsVersion,
        },
      );
    } catch {
      /* non-fatal */
    }

    // Đồng bộ khuyến mãi / flash sale (best-effort, không chặn áp dụng).
    await this.syncPromotionAfterChange(order, afterSnapshots);
    await this.refundFlashSaleForRemovedItems(
      order,
      beforeSnapshots,
      afterSnapshots,
    );

    for (const event of order.pullDomainEvents()) {
      this.eventBus.publish(event);
    }

    return order;
  }

  // ===================== Queries =====================

  async listByOrder(
    orderId: string,
    user: RequestUser,
  ): Promise<OrderChangeRequestResponseDto[]> {
    const order = await this.requireOrder(orderId);
    await this.assertOrderAccess(order, user);
    const requests = await this.changeRequestRepository.findByOrderId(orderId);
    return requests.map((request) => this.toResponse(request));
  }

  async getById(
    requestId: string,
    user: RequestUser,
  ): Promise<OrderChangeRequestResponseDto> {
    const request = await this.requireRequest(requestId);
    const order = await this.requireOrder(request.order_id);
    await this.assertOrderAccess(order, user);
    return this.toResponse(request);
  }

  async listAdjustments(
    orderId: string,
    user: RequestUser,
  ): Promise<OrderAdjustmentResponseDto[]> {
    const order = await this.requireOrder(orderId);
    await this.assertOrderAccess(order, user);
    const adjustments = await this.adjustmentRepository.findByOrderId(orderId);
    return adjustments.map((adjustment) =>
      this.toAdjustmentResponse(adjustment),
    );
  }

  async merchantAdjustments(
    merchantId: string,
    options: { startDate?: string; endDate?: string },
    user: RequestUser,
  ): Promise<{
    items: OrderAdjustmentResponseDto[];
    total: number;
    totalDelta: number;
  }> {
    await this.assertMerchantOwnership(merchantId, user);
    const adjustments = await this.adjustmentRepository.findByMerchant(
      merchantId,
      options,
    );
    const items = adjustments.map((adjustment) =>
      this.toAdjustmentResponse(adjustment),
    );
    return {
      items,
      total: items.length,
      totalDelta: items.reduce((sum, item) => sum + item.deltaAmount, 0),
    };
  }

  // ===================== Mapping =====================

  private toResponse(
    request: OrderChangeRequestEntity,
  ): OrderChangeRequestResponseDto {
    return {
      id: request.id,
      orderId: request.order_id,
      merchantId: request.merchant_id,
      consumerId: request.consumer_id,
      status: request.status,
      reason: request.reason,
      rejectReason: request.reject_reason,
      beforeItems: request.before_items as unknown as ChangeItemSnapshot[],
      afterItems: request.after_items as unknown as ChangeItemSnapshot[],
      before: {
        subtotal: Number(request.before_subtotal),
        discount: Number(request.before_discount),
        total: Number(request.before_total),
      },
      after: {
        subtotal: Number(request.after_subtotal),
        discount: Number(request.after_discount),
        total: Number(request.after_total),
      },
      deltaAmount: Number(request.delta_amount),
      paymentMethod: request.payment_method,
      moneyStatus: request.money_status,
      adjustmentPaymentId: request.adjustment_payment_id,
      beforeItemsVersion: request.before_items_version,
      expiresAt: request.expires_at
        ? new Date(request.expires_at).toISOString()
        : null,
      createdAt: new Date(request.created_at).toISOString(),
      updatedAt: new Date(request.updated_at).toISOString(),
      confirmedAt: request.confirmed_at
        ? new Date(request.confirmed_at).toISOString()
        : null,
    };
  }

  private toAdjustmentResponse(
    adjustment: OrderAdjustmentEntity,
  ): OrderAdjustmentResponseDto {
    return {
      id: adjustment.id,
      orderId: adjustment.order_id,
      changeRequestId: adjustment.change_request_id,
      before: {
        subtotal: Number(adjustment.before_subtotal),
        discount: Number(adjustment.before_discount),
        total: Number(adjustment.before_total),
      },
      after: {
        subtotal: Number(adjustment.after_subtotal),
        discount: Number(adjustment.after_discount),
        total: Number(adjustment.after_total),
      },
      deltaAmount: Number(adjustment.delta_amount),
      paymentMethod: adjustment.payment_method,
      moneyStatus: adjustment.money_status,
      settlementStatus: adjustment.settlement_status,
      createdAt: new Date(adjustment.created_at).toISOString(),
    };
  }

  // ===================== Private helpers =====================

  private get requestTtlMinutes(): number {
    const value = Number(process.env.ORDER_CHANGE_REQUEST_TTL_MINUTES || 15);
    return Number.isFinite(value) && value > 0 ? value : 15;
  }

  private get serviceKey(): string {
    return process.env.SERVICE_API_KEY || "mythfood-service-key";
  }

  private async requireRequest(
    requestId: string,
  ): Promise<OrderChangeRequestEntity> {
    const request = await this.changeRequestRepository.findById(requestId);
    if (!request) {
      throw new NotFoundException(
        `Không tìm thấy yêu cầu chỉnh sửa ${requestId}`,
      );
    }
    return request;
  }

  private async requireOrder(orderId: string): Promise<Order> {
    return this.orderRepository.findByIdOrFail(OrderId.from(orderId));
  }

  private async tryRequireOrder(orderId: string): Promise<Order | null> {
    try {
      return await this.orderRepository.findById(OrderId.from(orderId));
    } catch {
      return null;
    }
  }

  private async assertMerchantOwnership(
    merchantId: string,
    user?: RequestUser,
  ): Promise<void> {
    const roles = user?.roles ?? [];
    if (roles.includes("ADMIN") || user?.userId === "service") return;
    if (!user?.userId) {
      throw new ForbiddenException("Thiếu thông tin người dùng");
    }
    const merchant = await this.fetchMerchant(merchantId);
    if (!merchant || merchant.userId !== user.userId) {
      throw new ForbiddenException(
        "Bạn chỉ có thể chỉnh sửa đơn của nhà hàng của bạn",
      );
    }
  }

  private async assertOrderAccess(
    order: Order,
    user?: RequestUser,
  ): Promise<void> {
    const roles = user?.roles ?? [];
    if (roles.includes("ADMIN") || user?.userId === "service") return;

    if (roles.includes("CONSUMER")) {
      if (!order.orderUserId) {
        // Đơn cũ chưa lưu userId — vẫn cho khách xem để không chặn luồng cũ.
        this.logger.warn(
          `Order ${order.id.toString()} has no userId; consumer access allowed by role`,
        );
        return;
      }
      if (order.orderUserId === user?.userId) return;
      throw new ForbiddenException("Bạn không có quyền với đơn hàng này");
    }

    await this.assertMerchantOwnership(order.orderMerchantId, user);
  }

  private assertConsumerAccess(order: Order, user?: RequestUser): void {
    const roles = user?.roles ?? [];
    if (roles.includes("ADMIN") || user?.userId === "service") return;
    if (!order.orderUserId) {
      this.logger.warn(
        `Order ${order.id.toString()} has no userId; consumer access allowed by role`,
      );
      return;
    }
    if (order.orderUserId !== user?.userId) {
      throw new ForbiddenException("Bạn không có quyền với đơn hàng này");
    }
  }

  // ===================== Menu resolution =====================

  /**
   * Xây danh sách món sau chỉnh sửa từ snapshot hiện tại + menu hiện tại.
   * Giá món mới hoàn toàn do server quyết định; món cũ giữ nguyên giá gốc
   * (kể cả flash sale) và chỉ cộng/trừ phần chênh lệch của options.
   */
  private buildAfterItems(
    order: Order,
    items: ChangeItemDto[],
    menu: MenuItemFromApi[],
  ): OrderItemProps[] {
    const before = order.orderItems;
    const menuById = new Map(menu.map((item) => [item.id, item]));
    const usedIndexes = new Set<number>();
    const result: OrderItemProps[] = [];

    for (const dto of items) {
      const menuItem = menuById.get(dto.menuItemId);
      const newOptions =
        dto.options !== undefined
          ? this.resolveOptions(menuItem, dto.options)
          : undefined;

      if (dto.sourceIndex !== undefined && dto.sourceIndex !== null) {
        if (dto.sourceIndex < 0 || dto.sourceIndex >= before.length) {
          throw new BadRequestException(
            `Vị trí món ${dto.sourceIndex} không hợp lệ`,
          );
        }
        if (usedIndexes.has(dto.sourceIndex)) {
          throw new BadRequestException(
            `Món ở vị trí ${dto.sourceIndex} bị lặp trong danh sách mới`,
          );
        }
        usedIndexes.add(dto.sourceIndex);

        const existing = before[dto.sourceIndex];
        if (!existing) {
          throw new BadRequestException(
            `Không tìm thấy món ở vị trí ${dto.sourceIndex}`,
          );
        }
        if (existing.menuItemId !== dto.menuItemId) {
          throw new BadRequestException(
            `Món ở vị trí ${dto.sourceIndex} không khớp với đơn hiện tại`,
          );
        }

        const oldOptionDelta = this.optionsDelta(existing.options ?? []);
        const effectiveOptions =
          newOptions !== undefined ? newOptions : (existing.options ?? null);
        const newOptionDelta = this.optionsDelta(effectiveOptions ?? []);
        const basePrice = Number(existing.unitPrice) - oldOptionDelta;
        const unitPrice = Math.max(0, basePrice + newOptionDelta);

        result.push({
          menuItemId: existing.menuItemId,
          name: menuItem?.name ?? existing.name,
          imageUrl: menuItem?.imageUrl ?? existing.imageUrl ?? null,
          quantity: dto.quantity,
          unitPrice,
          originalPrice: existing.originalPrice ?? null,
          flashSaleFundedBy: existing.flashSaleFundedBy ?? null,
          specialInstructions:
            dto.specialInstructions ?? existing.specialInstructions ?? null,
          options: effectiveOptions,
          subtotal: dto.quantity * unitPrice,
        });
        continue;
      }

      if (!menuItem) {
        throw new BadRequestException(
          `Món ${dto.menuItemId} không tồn tại trong menu của nhà hàng`,
        );
      }
      if (
        menuItem.isAvailable === false ||
        (menuItem.availabilityStatus &&
          menuItem.availabilityStatus !== "AVAILABLE")
      ) {
        throw new BadRequestException(`Món ${menuItem.name} đang ngừng bán`);
      }

      const options = newOptions ?? this.defaultOptions(menuItem);
      const unitPrice = Number(menuItem.price) + this.optionsDelta(options);
      result.push({
        menuItemId: menuItem.id,
        name: menuItem.name,
        imageUrl: menuItem.imageUrl ?? null,
        quantity: dto.quantity,
        unitPrice,
        originalPrice: null,
        flashSaleFundedBy: null,
        specialInstructions: dto.specialInstructions ?? null,
        options,
        subtotal: dto.quantity * unitPrice,
      });
    }

    const removedCount = before.length - usedIndexes.size;
    if (removedCount > 0 && before.length <= 1) {
      throw new BadRequestException("Không thể xóa món duy nhất của đơn hàng");
    }
    if (result.length === 0) {
      throw new BadRequestException("Đơn hàng phải còn ít nhất một món");
    }

    return result;
  }

  /**
   * Option mặc định cho món mới: ưu tiên isDefault, sau đó option đầu tiên
   * của nhóm bắt buộc. Giữ nhất quán với UI merchant.
   */
  private defaultOptions(menuItem: MenuItemFromApi): OrderItemOption[] {
    const result: OrderItemOption[] = [];
    for (const group of menuItem.optionGroups ?? []) {
      const options = group.options ?? [];
      if (options.length === 0) continue;
      const max =
        group.maxSelections ??
        (group.type === "CHOICE" || group.type === "TOGGLE"
          ? 1
          : options.length);
      const min = group.minSelections ?? (group.required ? 1 : 0);
      const defaults = options.filter((option) => option.isDefault);
      if (defaults.length > 0) {
        for (const option of defaults.slice(0, Math.max(1, max))) {
          result.push({
            optionId: option.id,
            groupId: group.id,
            groupName: group.name,
            name: option.name,
            priceDelta: Number(option.priceDelta) || 0,
            quantity: option.minQuantity ?? 1,
          });
        }
        continue;
      }
      if (min > 0) {
        for (const option of options.slice(0, Math.max(1, min))) {
          result.push({
            optionId: option.id,
            groupId: group.id,
            groupName: group.name,
            name: option.name,
            priceDelta: Number(option.priceDelta) || 0,
            quantity: option.minQuantity ?? 1,
          });
        }
      }
    }
    return result;
  }

  private resolveOptions(
    menuItem: MenuItemFromApi | undefined,
    selected: NonNullable<ChangeItemDto["options"]>,
  ): OrderItemOption[] {
    if (!menuItem) {
      throw new BadRequestException(
        "Không tìm thấy món trong menu để xác minh tùy chọn",
      );
    }
    const groups = menuItem.optionGroups ?? [];
    const selectedByGroup = new Map<string, number>();
    const options: OrderItemOption[] = [];

    for (const choice of selected) {
      const group = groups.find((g) => g.id === choice.groupId);
      if (!group) {
        throw new BadRequestException(
          `Nhóm tùy chọn ${choice.groupId} không thuộc món ${menuItem.name}`,
        );
      }
      const option = (group.options ?? []).find(
        (o) => o.id === choice.optionId,
      );
      if (!option) {
        throw new BadRequestException(
          `Tùy chọn ${choice.optionId} không thuộc nhóm ${group.name}`,
        );
      }
      const quantity = choice.quantity ?? 1;
      if (option.maxQuantity != null && quantity > option.maxQuantity) {
        throw new BadRequestException(
          `Tùy chọn ${option.name} chỉ được chọn tối đa ${option.maxQuantity}`,
        );
      }
      if (option.minQuantity != null && quantity < option.minQuantity) {
        throw new BadRequestException(
          `Tùy chọn ${option.name} phải chọn tối thiểu ${option.minQuantity}`,
        );
      }
      selectedByGroup.set(group.id, (selectedByGroup.get(group.id) ?? 0) + 1);
      options.push({
        optionId: option.id,
        groupId: group.id,
        groupName: group.name,
        name: option.name,
        priceDelta: Number(option.priceDelta) || 0,
        quantity,
      });
    }

    for (const group of groups) {
      const count = selectedByGroup.get(group.id) ?? 0;
      const min = group.minSelections ?? (group.required ? 1 : 0);
      const max =
        group.maxSelections ??
        (group.type === "CHOICE" || group.type === "TOGGLE" ? 1 : null);
      if (count < min) {
        throw new BadRequestException(
          `Nhóm tùy chọn ${group.name} cần chọn ít nhất ${min} mục`,
        );
      }
      if (max != null && count > max) {
        throw new BadRequestException(
          `Nhóm tùy chọn ${group.name} chỉ được chọn tối đa ${max} mục`,
        );
      }
    }

    return options;
  }

  private optionsDelta(options: OrderItemOption[]): number {
    return options.reduce(
      (sum, option) =>
        sum + Number(option.priceDelta || 0) * Number(option.quantity ?? 1),
      0,
    );
  }

  private toSnapshot(item: OrderItemProps): ChangeItemSnapshot {
    const unitPrice = Number(item.unitPrice);
    const quantity = Number(item.quantity);
    return {
      menuItemId: item.menuItemId,
      name: item.name,
      imageUrl: item.imageUrl ?? null,
      quantity,
      unitPrice,
      originalPrice: item.originalPrice ?? null,
      flashSaleFundedBy: item.flashSaleFundedBy ?? null,
      subtotal: quantity * unitPrice,
      specialInstructions: item.specialInstructions ?? null,
      options: (item.options as OrderItemOption[] | null) ?? null,
    };
  }

  private snapshotToOrderItem(snapshot: ChangeItemSnapshot): OrderItemProps {
    return {
      menuItemId: snapshot.menuItemId,
      name: snapshot.name,
      imageUrl: snapshot.imageUrl ?? null,
      quantity: Number(snapshot.quantity),
      unitPrice: Number(snapshot.unitPrice),
      originalPrice: snapshot.originalPrice ?? null,
      flashSaleFundedBy: snapshot.flashSaleFundedBy ?? null,
      specialInstructions: snapshot.specialInstructions ?? null,
      options: (snapshot.options as OrderItemOption[] | null) ?? null,
      subtotal: Number(snapshot.quantity) * Number(snapshot.unitPrice),
    };
  }

  // ===================== Service-to-service HTTP =====================

  private merchantServiceCandidates(): string[] {
    const urls = [
      process.env.MERCHANT_SERVICE_URL,
      "http://merchant-service:3003",
      "http://localhost:3003",
    ].filter((url): url is string => !!url);
    return [...new Set(urls)];
  }

  private async fetchMerchant(merchantId: string): Promise<any | null> {
    let lastErr: any = null;
    for (const base of this.merchantServiceCandidates()) {
      try {
        const res = await firstValueFrom(
          this.httpService.get(`${base}/api/v1/merchants/${merchantId}`, {
            headers: { "x-service-key": this.serviceKey },
          }),
        );
        const data: any = res.data;
        return data?.data ?? data ?? null;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr ?? new Error("merchant-service unreachable");
  }

  private async tryFetchMerchant(merchantId: string): Promise<any | null> {
    try {
      return await this.fetchMerchant(merchantId);
    } catch {
      return null;
    }
  }

  private async fetchMenu(merchantId: string): Promise<MenuItemFromApi[]> {
    let lastErr: any = null;
    for (const base of this.merchantServiceCandidates()) {
      try {
        const res = await firstValueFrom(
          this.httpService.get(`${base}/api/v1/merchants/${merchantId}/menu`, {
            params: { includeUnavailable: "true" },
            headers: { "x-service-key": this.serviceKey },
          }),
        );
        const data: any = res.data?.data ?? res.data;
        const items = Array.isArray(data) ? data : (data?.items ?? []);
        return items as MenuItemFromApi[];
      } catch (err) {
        lastErr = err;
      }
    }
    this.logger.warn(
      `Cannot load menu for merchant ${merchantId}: ${lastErr?.message ?? lastErr}`,
    );
    throw new ConflictException(
      "Không thể xác minh menu của nhà hàng, vui lòng thử lại",
    );
  }

  private async tryFetchDriver(driverId: string): Promise<any | null> {
    const urls = [
      process.env.DRIVER_SERVICE_URL,
      "http://driver-service:3007",
      "http://localhost:3007",
    ].filter((url): url is string => !!url);

    for (const base of [...new Set(urls)]) {
      try {
        const res = await firstValueFrom(
          this.httpService.get(`${base}/api/v1/drivers/${driverId}`, {
            headers: { "x-service-key": this.serviceKey },
          }),
        );
        const data: any = res.data;
        return data?.data ?? data ?? null;
      } catch {
        /* try next */
      }
    }
    return null;
  }

  // ===================== Promotion / flash sale sync =====================

  /**
   * Xem trước mức giảm giá sau khi đổi món. Nếu đơn có promotion usage,
   * promotion-service là nguồn chân lý (có thể mất điều kiện đơn tối thiểu).
   * Fallback: giữ nguyên giảm giá nhưng cap theo tiền món mới.
   */
  private async previewDiscount(
    order: Order,
    afterSubtotal: number,
    afterItems: ChangeItemSnapshot[],
  ): Promise<number> {
    const fallback = computeAfterDiscount(order.orderDiscount, afterSubtotal);
    try {
      const url =
        process.env.PROMOTION_SERVICE_URL || "http://promotion-service:3012";
      const res = await firstValueFrom(
        this.httpService.post(
          `${url}/api/v1/promotions/usages/recalculate`,
          {
            orderId: order.id.toString(),
            foodTotal: afterSubtotal,
            shippingFee: Number(order.orderDeliveryFee),
            dryRun: true,
            items: afterItems.map((item) => ({
              menuItemId: item.menuItemId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
          },
          { headers: { "x-service-key": this.serviceKey } },
        ),
      );
      const data: any = res.data?.data ?? res.data;
      if (!data?.hasUsage) return fallback;
      return Math.max(0, Math.min(Number(data.discount ?? 0), afterSubtotal));
    } catch (err: any) {
      this.logger.warn(
        `Preview promotion discount failed for order ${order.id.toString()}: ${err?.message ?? err}`,
      );
      return fallback;
    }
  }

  private async syncPromotionAfterChange(
    order: Order,
    afterItems: ChangeItemSnapshot[],
  ): Promise<void> {
    try {
      const url =
        process.env.PROMOTION_SERVICE_URL || "http://promotion-service:3012";
      await firstValueFrom(
        this.httpService.post(
          `${url}/api/v1/promotions/usages/recalculate`,
          {
            orderId: order.id.toString(),
            foodTotal: Number(order.orderSubtotal),
            shippingFee: Number(order.orderDeliveryFee),
            dryRun: false,
            items: afterItems.map((item) => ({
              menuItemId: item.menuItemId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
          },
          { headers: { "x-service-key": this.serviceKey } },
        ),
      );
    } catch (err: any) {
      this.logger.warn(
        `Sync promotion usage failed for order ${order.id.toString()}: ${err?.message ?? err}`,
      );
    }
  }

  /**
   * Hoàn suất flash sale cho phần số lượng bị giảm/xóa. Món giữ nguyên
   * không bị đụng tới nên khách không mất giá sale đã chốt.
   */
  private async refundFlashSaleForRemovedItems(
    order: Order,
    beforeItems: ChangeItemSnapshot[],
    afterItems: ChangeItemSnapshot[],
  ): Promise<void> {
    const beforeQty = new Map<string, number>();
    const afterQty = new Map<string, number>();
    for (const item of beforeItems) {
      beforeQty.set(
        item.menuItemId,
        (beforeQty.get(item.menuItemId) ?? 0) + item.quantity,
      );
    }
    for (const item of afterItems) {
      afterQty.set(
        item.menuItemId,
        (afterQty.get(item.menuItemId) ?? 0) + item.quantity,
      );
    }

    const items: Array<{ menuItemId: string; quantity: number }> = [];
    for (const [menuItemId, quantity] of beforeQty) {
      const diff = quantity - (afterQty.get(menuItemId) ?? 0);
      if (diff > 0) items.push({ menuItemId, quantity: diff });
    }
    if (items.length === 0) return;

    try {
      const url =
        process.env.PROMOTION_SERVICE_URL || "http://promotion-service:3012";
      await firstValueFrom(
        this.httpService.post(
          `${url}/api/v1/promotions/flash-sales/refund-items`,
          { orderId: order.id.toString(), items },
          { headers: { "x-service-key": this.serviceKey } },
        ),
      );
    } catch (err: any) {
      this.logger.warn(
        `Flash sale refund-items failed for order ${order.id.toString()}: ${err?.message ?? err}`,
      );
    }
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

  // ===================== Money movement =====================

  private async createAdjustmentPayment(
    order: Order,
    request: OrderChangeRequestEntity,
  ): Promise<{ paymentId: string; clientSecret: string; amount: number }> {
    const paymentUrl =
      process.env.PAYMENT_SERVICE_URL || "http://payment-service:3006";
    const amount = Math.round(Math.abs(Number(request.delta_amount)));
    try {
      const res = await firstValueFrom(
        this.httpService.post(
          `${paymentUrl}/api/v1/payments/order-adjustment/stripe`,
          {
            orderId: order.id.toString(),
            consumerId: order.orderConsumerId,
            merchantId: order.orderMerchantId,
            amount,
            currency: "vnd",
            adjustmentRequestId: request.id,
          },
          { headers: { "x-service-key": this.serviceKey } },
        ),
      );
      const data: any = res.data?.data ?? res.data;
      if (!data?.id || !data?.clientSecret) {
        throw new Error("payment-service không trả về clientSecret");
      }
      return {
        paymentId: data.id,
        clientSecret: data.clientSecret,
        amount,
      };
    } catch (err: any) {
      const payload = err?.response?.data;
      const upstream =
        payload?.message ??
        payload?.data?.message ??
        err?.message ??
        "unknown error";
      this.logger.error(
        `Create adjustment payment failed for request ${request.id}: status=${err?.response?.status ?? "n/a"} ${upstream}`,
      );
      throw new ConflictException(
        `Không thể tạo khoản thanh toán bổ sung: ${upstream}`,
      );
    }
  }

  private async verifyAdjustmentPayment(
    paymentId: string,
    request: OrderChangeRequestEntity,
  ): Promise<{ paymentId: string; transactionId: string }> {
    const paymentUrl =
      process.env.PAYMENT_SERVICE_URL || "http://payment-service:3006";
    let payment: any;
    try {
      const res = await firstValueFrom(
        this.httpService.get(`${paymentUrl}/api/v1/payments/${paymentId}`, {
          headers: { "x-service-key": this.serviceKey },
        }),
      );
      payment = res.data?.data ?? res.data;
    } catch (err: any) {
      this.logger.error(
        `Verify adjustment payment ${paymentId} failed: ${err?.message ?? err}`,
      );
      throw new ConflictException(
        "Không thể xác minh khoản thanh toán bổ sung",
      );
    }

    if (!payment || payment.orderId !== request.order_id) {
      throw new ConflictException(
        "Khoản thanh toán không thuộc đơn hàng đang chỉnh sửa",
      );
    }
    if (
      payment.adjustmentRequestId &&
      payment.adjustmentRequestId !== request.id
    ) {
      throw new ConflictException(
        "Khoản thanh toán không thuộc yêu cầu chỉnh sửa này",
      );
    }
    if (Number(payment.amount) < Math.abs(Number(request.delta_amount))) {
      throw new ConflictException("Số tiền thanh toán bổ sung không đủ");
    }
    if (payment.status !== "COMPLETED") {
      throw new ConflictException(
        "Khoản thanh toán bổ sung chưa hoàn tất, vui lòng thử lại",
      );
    }

    return {
      paymentId,
      transactionId:
        payment.transactionId ?? payment.stripePaymentIntentId ?? "",
    };
  }

  private async chargeWallet(
    order: Order,
    request: OrderChangeRequestEntity,
    plan: AdjustmentMoneyPlan,
  ): Promise<void> {
    const walletUrl =
      process.env.WALLET_SERVICE_URL || "http://wallet-service:3009";
    try {
      await firstValueFrom(
        this.httpService.post(
          `${walletUrl}/api/v1/wallets/order-adjustment`,
          {
            adjustmentId: request.id,
            ownerId: order.orderConsumerId,
            ownerType: "CONSUMER",
            direction: "CHARGE",
            amount: plan.amount,
            orderId: order.id.toString(),
            description: `Thu thêm chênh lệch chỉnh sửa đơn #${order.id.toString().slice(0, 8)}`,
          },
          { headers: { "x-service-key": this.serviceKey } },
        ),
      );
    } catch (err: any) {
      const payload = err?.response?.data;
      const message =
        payload?.message ?? payload?.data?.message ?? err?.message;
      this.logger.warn(
        `Wallet charge failed for request ${request.id}: ${message}`,
      );
      throw new ConflictException(
        message ||
          "Không thể trừ tiền trong ví. Vui lòng nạp thêm tiền vào ví rồi thử lại.",
      );
    }
  }

  /** Hoàn phần chênh lệch vào ví. Trả về false nếu lỗi (đã log để đối soát). */
  private async refundWallet(
    order: Order,
    request: OrderChangeRequestEntity,
    plan: AdjustmentMoneyPlan,
  ): Promise<boolean> {
    const walletUrl =
      process.env.WALLET_SERVICE_URL || "http://wallet-service:3009";
    try {
      await firstValueFrom(
        this.httpService.post(
          `${walletUrl}/api/v1/wallets/order-adjustment`,
          {
            adjustmentId: request.id,
            ownerId: order.orderConsumerId,
            ownerType: "CONSUMER",
            direction: "REFUND",
            amount: plan.amount,
            orderId: order.id.toString(),
            description: `Hoàn chênh lệch chỉnh sửa đơn #${order.id.toString().slice(0, 8)}`,
          },
          { headers: { "x-service-key": this.serviceKey } },
        ),
      );
      return true;
    } catch (err: any) {
      this.logger.warn(
        `Wallet refund failed for request ${request.id}: ${err?.message ?? err}`,
      );
      return false;
    }
  }

  // ===================== Notifications / timeline =====================

  private async notifyConsumer(
    order: Order,
    payload: {
      type: string;
      title: string;
      body?: string;
      data?: Record<string, unknown>;
    },
  ): Promise<void> {
    if (!order.orderUserId) {
      this.logger.warn(
        `Cannot notify consumer for order ${order.id.toString()}: userId not recorded`,
      );
      return;
    }
    await this.postNotification({ userId: order.orderUserId, ...payload });
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
    await firstValueFrom(
      this.httpService.post(
        `${notificationUrl}/api/v1/notifications`,
        payload,
        { headers: { "x-service-key": this.serviceKey } },
      ),
    );
  }

  private async recordTimeline(order: Order, reason: string): Promise<void> {
    try {
      await this.orderTimelineRepository.record({
        id: randomUUID(),
        orderId: order.id.toString(),
        previousStatus: order.orderStatus,
        newStatus: order.orderStatus,
        reason,
        occurredAt: new Date(),
      });
    } catch (err: any) {
      this.logger.warn(
        `Record change timeline failed for order ${order.id.toString()}: ${err?.message ?? err}`,
      );
    }
  }

  private buildChangeNotificationBody(
    before: ChangeItemSnapshot[],
    after: ChangeItemSnapshot[],
    deltaAmount: number,
    paymentMethod: string,
  ): string {
    const { removed, added } = summarizeItemChanges(
      before.map((item) => this.snapshotToOrderItem(item)),
      after.map((item) => this.snapshotToOrderItem(item)),
    );
    const parts: string[] = [];
    if (removed.length > 0) parts.push(`Bỏ: ${removed.join(", ")}`);
    if (added.length > 0) parts.push(`Thêm: ${added.join(", ")}`);

    const deltaText =
      deltaAmount === 0
        ? "Tổng tiền không đổi"
        : deltaAmount > 0
          ? `Tổng tiền tăng ${deltaAmount.toLocaleString("vi-VN")}đ`
          : `Tổng tiền giảm ${Math.abs(deltaAmount).toLocaleString("vi-VN")}đ`;

    const method = (paymentMethod || "CASH").toUpperCase();
    const methodText =
      method === "WALLET"
        ? deltaAmount > 0
          ? " (trừ thêm vào ví khi bạn đồng ý)"
          : deltaAmount < 0
            ? " (hoàn vào ví sau khi bạn đồng ý)"
            : ""
        : method === "COD" || method === "CASH"
          ? deltaAmount !== 0
            ? " (điều chỉnh số tiền thanh toán khi nhận hàng)"
            : ""
          : method === "CREDIT_CARD"
            ? deltaAmount > 0
              ? " (thanh toán thêm bằng thẻ)"
              : deltaAmount < 0
                ? " (hoàn vào ví sau khi bạn đồng ý)"
                : ""
            : "";

    parts.push(`${deltaText}${methodText}`);
    return parts.join(". ").concat(". Vui lòng xác nhận hoặc từ chối.");
  }
}
