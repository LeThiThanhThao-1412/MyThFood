import {
  AggregateRoot,
  Result,
  DomainError,
  BusinessRuleViolationError,
} from "@mythfood/shared-kernel";
import { OrderId } from "./order-id";
import { OrderPlacedEvent } from "./events/order-placed.event";
import { OrderStatusChangedEvent } from "./events/order-status-changed.event";
import { OrderItemsChangedEvent } from "./events/order-items-changed.event";
import { computeOrderTotals, isItemEditable } from "./order-change.policy";

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "DELIVERY_FAILED"
  | "CANCELLED"
  | "CANCELLED_NO_DRIVER"
  | "REJECTED";

export type OrderType = "DELIVERY" | "PICKUP";

/**
 * Statuses in which an order is still "open" from the customer's perspective:
 * chờ tài xế nhận (PENDING) → đang giao (CONFIRMED/PREPARING/READY/OUT_FOR_DELIVERY).
 */
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
];

export interface OrderItemOption {
  optionId: string;
  groupId: string;
  groupName?: string;
  name: string;
  priceDelta: number;
  quantity?: number;
}

export interface OrderItemProps {
  menuItemId: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  originalPrice: number | null;
  // Nguồn tài trợ của flash sale cho món này: MERCHANT (do quán tạo) | PLATFORM (nền tảng) | null (không flash sale)
  flashSaleFundedBy?: string | null;
  subtotal: number;
  specialInstructions: string | null;
  options?: OrderItemOption[] | null;
}

export interface OrderProps {
  consumerId: string;
  userId?: string | null;
  merchantId: string;
  orderType: OrderType;
  status: OrderStatus;
  items: OrderItemProps[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  discount: number;
  discountFundedBy?: string;
  totalAmount: number;
  deliveryAddress: string | null;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  estimatedDeliveryTime: Date | null;
  notes: string | null;
  driverId: string | null;
  /**
   * Ảnh tài xế chụp món ăn lúc giao đến tay khách — bằng chứng bắt buộc trước
   * khi đơn DELIVERY được đánh dấu DELIVERED (chống khiếu nại "chưa nhận hàng").
   */
  deliveryProofPhotoUrl?: string | null;
  cancelReason: string | null;
  rejectionReason: string | null;
  rejectionSource?: string | null;
  paymentMethod: string;
  /**
   * Số phiên bản danh sách món. Tăng mỗi lần áp dụng yêu cầu chỉnh sửa đã
   * được khách xác nhận — dùng để chống race và version hóa hóa đơn.
   */
  itemsVersion?: number;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

/** Valid status transitions for the order state machine */
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "REJECTED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED", "CANCELLED_NO_DRIVER"],
  PREPARING: ["READY_FOR_PICKUP", "CANCELLED", "CANCELLED_NO_DRIVER"],
  READY_FOR_PICKUP: ["OUT_FOR_DELIVERY", "CANCELLED", "CANCELLED_NO_DRIVER"],
  OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED", "DELIVERY_FAILED"],
  DELIVERED: [],
  CANCELLED: [],
  CANCELLED_NO_DRIVER: [],
  DELIVERY_FAILED: [],
  REJECTED: [],
};

export class Order extends AggregateRoot<OrderId> {
  private consumerId: string;
  private userId: string | null;
  private merchantId: string;
  private orderType: OrderType;
  private status: OrderStatus;
  private items: OrderItemProps[];
  private subtotal: number;
  private deliveryFee: number;
  private serviceFee: number;
  private discount: number;
  private discountFundedBy: string;
  private totalAmount: number;
  private deliveryAddress: string | null;
  private deliveryLatitude: number | null;
  private deliveryLongitude: number | null;
  private estimatedDeliveryTime: Date | null;
  private notes: string | null;
  private driverId: string | null;
  private deliveryProofPhotoUrl: string | null;
  private cancelReason: string | null;
  private rejectionReason: string | null;
  private rejectionSource: string | null;
  private paymentMethod: string;
  private itemsVersion: number;

  private constructor(id: OrderId, props: OrderProps) {
    super(id, props.createdAt ?? undefined, props.updatedAt ?? undefined);
    this.consumerId = props.consumerId;
    this.userId = props.userId ?? null;
    this.merchantId = props.merchantId;
    this.orderType = props.orderType;
    this.status = props.status;
    this.items = props.items;
    this.subtotal = props.subtotal;
    this.deliveryFee = props.deliveryFee;
    this.serviceFee = props.serviceFee;
    this.discount = props.discount;
    this.discountFundedBy = props.discountFundedBy ?? "MERCHANT";
    this.totalAmount = props.totalAmount;
    this.deliveryAddress = props.deliveryAddress;
    this.deliveryLatitude = props.deliveryLatitude;
    this.deliveryLongitude = props.deliveryLongitude;
    this.estimatedDeliveryTime = props.estimatedDeliveryTime;
    this.notes = props.notes;
    this.driverId = props.driverId;
    this.deliveryProofPhotoUrl = props.deliveryProofPhotoUrl ?? null;
    this.cancelReason = props.cancelReason;
    this.rejectionReason = props.rejectionReason;
    this.rejectionSource = props.rejectionSource ?? null;
    this.paymentMethod = props.paymentMethod || "CASH";
    this.itemsVersion = props.itemsVersion ?? 1;
  }

  // ===================== Factory Methods =====================

  /**
   * Place a new order (customer action).
   */
  public static place(props: {
    id?: string;
    consumerId: string;
    userId?: string | null;
    merchantId: string;
    orderType: OrderType;
    items: Array<{
      menuItemId: string;
      name: string;
      imageUrl?: string | null;
      quantity: number;
      unitPrice: number;
      originalPrice?: number | null;
      flashSaleFundedBy?: string | null;
      specialInstructions?: string;
      options?: OrderItemOption[];
    }>;
    deliveryAddress: string | null;
    deliveryLatitude?: number | null;
    deliveryLongitude?: number | null;
    deliveryFee?: number;
    serviceFee?: number;
    discount?: number;
    discountFundedBy?: string;
    estimatedDeliveryTime?: Date;
    notes?: string;
    paymentMethod?: string;
  }): Result<Order, DomainError> {
    // Validation
    if (!props.consumerId || props.consumerId.trim().length === 0) {
      return Result.fail(
        new BusinessRuleViolationError("Consumer ID is required"),
      );
    }
    if (!props.merchantId || props.merchantId.trim().length === 0) {
      return Result.fail(
        new BusinessRuleViolationError("Merchant ID is required"),
      );
    }
    if (!props.items || props.items.length === 0) {
      return Result.fail(
        new BusinessRuleViolationError("Order must have at least one item"),
      );
    }

    if (
      props.orderType === "DELIVERY" &&
      (!props.deliveryAddress || props.deliveryAddress.trim().length === 0)
    ) {
      return Result.fail(
        new BusinessRuleViolationError(
          "Delivery address is required for delivery orders",
        ),
      );
    }

    // Validate and map order items
    const orderItems: OrderItemProps[] = [];
    for (const item of props.items) {
      if (item.quantity <= 0) {
        return Result.fail(
          new BusinessRuleViolationError(
            `Quantity must be positive for item ${item.name}`,
          ),
        );
      }
      if (item.unitPrice < 0) {
        return Result.fail(
          new BusinessRuleViolationError(
            `Unit price cannot be negative for item ${item.name}`,
          ),
        );
      }
      orderItems.push({
        menuItemId: item.menuItemId,
        name: item.name,
        imageUrl: item.imageUrl ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        originalPrice: item.originalPrice ?? null,
        flashSaleFundedBy: item.flashSaleFundedBy ?? null,
        subtotal: item.quantity * item.unitPrice,
        specialInstructions: item.specialInstructions ?? null,
        options: item.options ?? null,
      });
    }

    const subtotal = orderItems.reduce((sum, item) => sum + item.subtotal, 0);
    const deliveryFee = props.deliveryFee ?? 0;
    const serviceFee = props.serviceFee ?? 0;
    const discount = props.discount ?? 0;
    const totalAmount = subtotal + deliveryFee + serviceFee - discount;

    if (totalAmount < 0) {
      return Result.fail(
        new BusinessRuleViolationError("Total amount cannot be negative"),
      );
    }

    const order = new Order(
      props.id ? OrderId.from(props.id) : OrderId.create(),
      {
        consumerId: props.consumerId,
        userId: props.userId ?? null,
        merchantId: props.merchantId,
        orderType: props.orderType,
        status: "PENDING",
        items: orderItems,
        subtotal,
        deliveryFee,
        serviceFee,
        discount,
        discountFundedBy: props.discountFundedBy ?? "MERCHANT",
        totalAmount,
        deliveryAddress: props.deliveryAddress,
        deliveryLatitude: props.deliveryLatitude ?? null,
        deliveryLongitude: props.deliveryLongitude ?? null,
        estimatedDeliveryTime: props.estimatedDeliveryTime ?? null,
        notes: props.notes ?? null,
        driverId: null,
        cancelReason: null,
        rejectionReason: null,
        paymentMethod: props.paymentMethod || "CASH",
      },
    );

    order.addDomainEvent(
      new OrderPlacedEvent(order.id, {
        orderId: order.id.toString(),
        consumerId: props.consumerId,
        merchantId: props.merchantId,
        totalAmount,
        deliveryAddress: props.deliveryAddress ?? "",
        deliveryLatitude: props.deliveryLatitude ?? null,
        deliveryLongitude: props.deliveryLongitude ?? null,
        notes: props.notes ?? null,
        estimatedDeliveryTime: props.estimatedDeliveryTime ?? new Date(),
        items: orderItems.map((i) => ({
          menuItemId: i.menuItemId,
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          subtotal: i.subtotal,
        })),
      }),
    );

    return Result.ok(order);
  }

  /**
   * Rehydrate an Order from persistence (no events emitted).
   */
  public static rehydrate(id: OrderId, props: OrderProps): Order {
    return new Order(id, props);
  }

  // ===================== Status Transitions =====================

  private transitionTo(newStatus: OrderStatus, reason?: string): void {
    const allowedTransitions = VALID_TRANSITIONS[this.status];
    if (!allowedTransitions.includes(newStatus)) {
      throw new BusinessRuleViolationError(
        `Cannot transition order from ${this.status} to ${newStatus}`,
      );
    }

    const previousStatus = this.status;

    // Set reason fields based on new status
    if (newStatus === "CANCELLED" && reason) {
      this.cancelReason = reason;
    }
    if (newStatus === "CANCELLED_NO_DRIVER") {
      this.cancelReason = reason ?? "Không có tài xế nhận đơn";
    }
    if (newStatus === "DELIVERY_FAILED") {
      this.cancelReason = reason ?? "Giao hàng thất bại";
    }
    if (newStatus === "REJECTED" && reason) {
      this.rejectionReason = reason;
    }

    this.status = newStatus;
    this.markUpdated();

    this.addDomainEvent(
      new OrderStatusChangedEvent(this.id, {
        orderId: this.id.toString(),
        previousStatus,
        newStatus,
        reason,
      }),
    );
  }

  /**
   * Merchant confirms the order.
   */
  public confirm(): void {
    this.transitionTo("CONFIRMED");
  }

  /**
   * Merchant starts preparing the order.
   */
  public startPreparing(): void {
    this.transitionTo("PREPARING");
  }

  /**
   * Order is ready for driver pickup.
   */
  public markReadyForPickup(): void {
    this.transitionTo("READY_FOR_PICKUP");
  }

  /**
   * Driver picks up and is out for delivery.
   */
  public markOutForDelivery(driverId: string): void {
    if (!driverId || driverId.trim().length === 0) {
      throw new BusinessRuleViolationError("Driver ID is required");
    }
    this.driverId = driverId;
    this.transitionTo("OUT_FOR_DELIVERY");
  }

  /**
   * Order is delivered to the customer.
   *
   * Đơn giao hàng (DELIVERY) bắt buộc phải có ảnh món ăn tài xế chụp lúc giao
   * cho khách — dùng làm bằng chứng khi khách khiếu nại "chưa nhận được hàng".
   * Đơn PICKUP (khách tự đến lấy) không cần ảnh.
   */
  public markDelivered(deliveryProofPhotoUrl?: string): void {
    const proofUrl = deliveryProofPhotoUrl?.trim() ?? "";

    if (
      this.status === "OUT_FOR_DELIVERY" &&
      this.orderType === "DELIVERY" &&
      !proofUrl
    ) {
      throw new BusinessRuleViolationError(
        "Phải chụp ảnh món ăn khi giao cho khách trước khi xác nhận giao hàng thành công",
      );
    }

    if (proofUrl) {
      this.deliveryProofPhotoUrl = proofUrl;
    }

    this.transitionTo("DELIVERED");
  }

  /**
   * Customer or merchant cancels the order.
   */
  public cancel(reason: string): void {
    if (!reason || reason.trim().length === 0) {
      throw new BusinessRuleViolationError("Cancellation reason is required");
    }
    this.transitionTo("CANCELLED", reason);
  }

  /**
   * Khách hàng hủy đơn — chỉ được phép khi đơn còn ở PENDING/CONFIRMED.
   * Khi nhà hàng đã bắt đầu nấu (PREPARING trở đi) thì không cho khách hủy nữa.
   */
  public cancelByCustomer(reason: string): void {
    if (this.status !== "PENDING" && this.status !== "CONFIRMED") {
      throw new BusinessRuleViolationError(
        "Nhà hàng đã bắt đầu chuẩn bị món, bạn không thể hủy đơn nữa",
      );
    }
    this.cancel(reason);
  }

  /**
   * Merchant rejects the order.
   */
  public reject(reason: string): void {
    this.rejectWithSource(reason, "MERCHANT");
  }

  /**
   * Nhà hàng không phản hồi trong khoảng thời gian chờ → hệ thống tự từ chối.
   */
  public rejectNoResponse(reason: string): void {
    this.rejectWithSource(reason, "NO_RESPONSE");
  }

  private rejectWithSource(reason: string, source: string): void {
    if (!reason || reason.trim().length === 0) {
      throw new BusinessRuleViolationError("Rejection reason is required");
    }
    this.rejectionSource = source;
    this.transitionTo("REJECTED", reason);
  }

  /**
   * Auto-cancel the order because no driver accepted the dispatch in time.
   */
  public cancelNoDriver(reason?: string): void {
    this.transitionTo(
      "CANCELLED_NO_DRIVER",
      reason ?? "Không có tài xế nhận đơn",
    );
  }

  /**
   * Tài xế giao hàng thất bại (Case 8): khách không nhận hàng.
   */
  public markDeliveryFailed(reason: string): void {
    if (!reason || reason.trim().length === 0) {
      throw new BusinessRuleViolationError(
        "Delivery failure reason is required",
      );
    }
    this.transitionTo("DELIVERY_FAILED", reason);
  }

  // ===================== Mutations =====================

  /**
   * Update estimated delivery time.
   */
  public updateEstimatedDeliveryTime(newTime: Date): void {
    if (newTime <= new Date()) {
      throw new BusinessRuleViolationError(
        "Estimated delivery time must be in the future",
      );
    }
    this.estimatedDeliveryTime = newTime;
    this.markUpdated();
  }

  /**
   * Update order notes.
   */
  public updateNotes(notes: string | null): void {
    this.notes = notes;
    this.markUpdated();
  }

  /**
   * Assign a driver to the order.
   */
  public assignDriver(driverId: string): void {
    if (!driverId || driverId.trim().length === 0) {
      throw new BusinessRuleViolationError("Driver ID is required");
    }
    this.driverId = driverId;
    this.markUpdated();
  }

  /**
   * Gỡ tài xế khỏi đơn (khi tài xế hủy sau khi đã nhận) để đơn quay lại trạng thái
   * "chưa có tài xế" và có thể tìm tài xế mới.
   */
  public clearDriver(): void {
    this.driverId = null;
    this.markUpdated();
  }

  /**
   * Áp dụng danh sách món mới đã được khách xác nhận.
   *
   * Chỉ cho phép khi đơn còn ở trạng thái có thể chỉnh sửa (mặc định
   * CONFIRMED/PREPARING). Giá món do tầng application resolve từ menu
   * (server-authoritative) rồi truyền vào đây; domain chỉ tính lại tổng tiền
   * và đảm bảo bất biến (>= 1 món, tổng không âm, giảm giá không vượt tiền món).
   */
  public applyItemChange(input: {
    items: OrderItemProps[];
    reason?: string;
    /** Mức giảm giá đã chốt trong yêu cầu (đã tính lại theo promotion). */
    discount?: number;
  }): void {
    if (!isItemEditable(this.status)) {
      throw new BusinessRuleViolationError(
        `Không thể chỉnh sửa món khi đơn đang ở trạng thái ${this.status}`,
      );
    }
    if (!input.items || input.items.length === 0) {
      throw new BusinessRuleViolationError("Đơn hàng phải còn ít nhất một món");
    }
    for (const item of input.items) {
      if (!item.quantity || item.quantity <= 0) {
        throw new BusinessRuleViolationError(
          `Số lượng món ${item.name} phải lớn hơn 0`,
        );
      }
      if (item.unitPrice < 0) {
        throw new BusinessRuleViolationError(
          `Giá món ${item.name} không hợp lệ`,
        );
      }
    }

    const previous = {
      itemsVersion: this.itemsVersion,
      subtotal: this.subtotal,
      discount: this.discount,
      totalAmount: this.totalAmount,
    };

    const items: OrderItemProps[] = input.items.map((item) => ({
      menuItemId: item.menuItemId,
      name: item.name,
      imageUrl: item.imageUrl ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      originalPrice: item.originalPrice ?? null,
      flashSaleFundedBy: item.flashSaleFundedBy ?? null,
      specialInstructions: item.specialInstructions ?? null,
      options: item.options ?? null,
      subtotal: item.quantity * item.unitPrice,
    }));

    const totals = computeOrderTotals({
      items,
      deliveryFee: this.deliveryFee,
      serviceFee: this.serviceFee,
      discount: input.discount ?? this.discount,
    });

    if (totals.totalAmount < 0) {
      throw new BusinessRuleViolationError("Tổng tiền đơn hàng không được âm");
    }

    this.items = items;
    this.subtotal = totals.subtotal;
    this.discount = totals.discount;
    this.totalAmount = totals.totalAmount;
    this.itemsVersion = this.itemsVersion + 1;
    this.markUpdated();

    this.addDomainEvent(
      new OrderItemsChangedEvent(this.id, {
        orderId: this.id.toString(),
        previousItemsVersion: previous.itemsVersion,
        newItemsVersion: this.itemsVersion,
        previousSubtotal: previous.subtotal,
        newSubtotal: this.subtotal,
        previousDiscount: previous.discount,
        newDiscount: this.discount,
        previousTotalAmount: previous.totalAmount,
        newTotalAmount: this.totalAmount,
        deltaAmount: this.totalAmount - previous.totalAmount,
        reason: input.reason,
      }),
    );
  }

  // ===================== Queries =====================

  public isActive(): boolean {
    return ACTIVE_ORDER_STATUSES.includes(this.status);
  }

  public isDelivery(): boolean {
    return this.orderType === "DELIVERY";
  }

  // ===================== Getters =====================

  get orderConsumerId(): string {
    return this.consumerId;
  }

  get orderUserId(): string | null {
    return this.userId;
  }

  get orderMerchantId(): string {
    return this.merchantId;
  }

  get orderTypeValue(): OrderType {
    return this.orderType;
  }

  get orderStatus(): OrderStatus {
    return this.status;
  }

  get orderItems(): ReadonlyArray<OrderItemProps> {
    return [...this.items];
  }

  get orderSubtotal(): number {
    return this.subtotal;
  }

  get orderDeliveryFee(): number {
    return this.deliveryFee;
  }

  get orderServiceFee(): number {
    return this.serviceFee;
  }

  get orderDiscount(): number {
    return this.discount;
  }

  get orderDiscountFundedBy(): string {
    return this.discountFundedBy;
  }

  get orderTotalAmount(): number {
    return this.totalAmount;
  }

  get orderDeliveryAddress(): string | null {
    return this.deliveryAddress;
  }

  get orderDeliveryLatitude(): number | null {
    return this.deliveryLatitude;
  }

  get orderDeliveryLongitude(): number | null {
    return this.deliveryLongitude;
  }

  get orderEstimatedDeliveryTime(): Date | null {
    return this.estimatedDeliveryTime;
  }

  get orderNotes(): string | null {
    return this.notes;
  }

  get orderDriverId(): string | null {
    return this.driverId;
  }

  get orderDeliveryProofPhotoUrl(): string | null {
    return this.deliveryProofPhotoUrl;
  }

  get orderCancelReason(): string | null {
    return this.cancelReason;
  }

  get orderRejectionReason(): string | null {
    return this.rejectionReason;
  }

  get orderRejectionSource(): string | null {
    return this.rejectionSource;
  }

  get orderPaymentMethod(): string {
    return this.paymentMethod;
  }

  get orderItemsVersion(): number {
    return this.itemsVersion;
  }
}
