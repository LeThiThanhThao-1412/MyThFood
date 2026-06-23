import {
  AggregateRoot,
  Result,
  DomainError,
  BusinessRuleViolationError,
} from "@mythfood/shared-kernel";
import { OrderId } from "./order-id";
import { OrderPlacedEvent } from "./events/order-placed.event";
import { OrderStatusChangedEvent } from "./events/order-status-changed.event";

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "REJECTED";

export type OrderType = "DELIVERY" | "PICKUP";

export interface OrderItemProps {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  specialInstructions: string | null;
}

export interface OrderProps {
  consumerId: string;
  merchantId: string;
  orderType: OrderType;
  status: OrderStatus;
  items: OrderItemProps[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  discount: number;
  totalAmount: number;
  deliveryAddress: string | null;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  estimatedDeliveryTime: Date | null;
  notes: string | null;
  driverId: string | null;
  cancelReason: string | null;
  rejectionReason: string | null;
}

/** Valid status transitions for the order state machine */
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "REJECTED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY_FOR_PICKUP", "CANCELLED"],
  READY_FOR_PICKUP: ["OUT_FOR_DELIVERY", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
  REJECTED: [],
};

export class Order extends AggregateRoot<OrderId> {
  private consumerId: string;
  private merchantId: string;
  private orderType: OrderType;
  private status: OrderStatus;
  private items: OrderItemProps[];
  private subtotal: number;
  private deliveryFee: number;
  private serviceFee: number;
  private discount: number;
  private totalAmount: number;
  private deliveryAddress: string | null;
  private deliveryLatitude: number | null;
  private deliveryLongitude: number | null;
  private estimatedDeliveryTime: Date | null;
  private notes: string | null;
  private driverId: string | null;
  private cancelReason: string | null;
  private rejectionReason: string | null;

  private constructor(id: OrderId, props: OrderProps) {
    super(id);
    this.consumerId = props.consumerId;
    this.merchantId = props.merchantId;
    this.orderType = props.orderType;
    this.status = props.status;
    this.items = props.items;
    this.subtotal = props.subtotal;
    this.deliveryFee = props.deliveryFee;
    this.serviceFee = props.serviceFee;
    this.discount = props.discount;
    this.totalAmount = props.totalAmount;
    this.deliveryAddress = props.deliveryAddress;
    this.deliveryLatitude = props.deliveryLatitude;
    this.deliveryLongitude = props.deliveryLongitude;
    this.estimatedDeliveryTime = props.estimatedDeliveryTime;
    this.notes = props.notes;
    this.driverId = props.driverId;
    this.cancelReason = props.cancelReason;
    this.rejectionReason = props.rejectionReason;
  }

  // ===================== Factory Methods =====================

  /**
   * Place a new order (customer action).
   */
  public static place(props: {
    consumerId: string;
    merchantId: string;
    orderType: OrderType;
    items: Array<{
      menuItemId: string;
      name: string;
      quantity: number;
      unitPrice: number;
      specialInstructions?: string;
    }>;
    deliveryAddress: string | null;
    deliveryLatitude?: number | null;
    deliveryLongitude?: number | null;
    deliveryFee?: number;
    serviceFee?: number;
    discount?: number;
    estimatedDeliveryTime?: Date;
    notes?: string;
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
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.quantity * item.unitPrice,
        specialInstructions: item.specialInstructions ?? null,
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

    const order = new Order(OrderId.create(), {
      consumerId: props.consumerId,
      merchantId: props.merchantId,
      orderType: props.orderType,
      status: "PENDING",
      items: orderItems,
      subtotal,
      deliveryFee,
      serviceFee,
      discount,
      totalAmount,
      deliveryAddress: props.deliveryAddress,
      deliveryLatitude: props.deliveryLatitude ?? null,
      deliveryLongitude: props.deliveryLongitude ?? null,
      estimatedDeliveryTime: props.estimatedDeliveryTime ?? null,
      notes: props.notes ?? null,
      driverId: null,
      cancelReason: null,
      rejectionReason: null,
    });

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
   */
  public markDelivered(): void {
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
   * Merchant rejects the order.
   */
  public reject(reason: string): void {
    if (!reason || reason.trim().length === 0) {
      throw new BusinessRuleViolationError("Rejection reason is required");
    }
    this.transitionTo("REJECTED", reason);
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

  // ===================== Queries =====================

  public isActive(): boolean {
    return !["DELIVERED", "CANCELLED", "REJECTED"].includes(this.status);
  }

  public isDelivery(): boolean {
    return this.orderType === "DELIVERY";
  }

  // ===================== Getters =====================

  get orderConsumerId(): string {
    return this.consumerId;
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

  get orderCancelReason(): string | null {
    return this.cancelReason;
  }

  get orderRejectionReason(): string | null {
    return this.rejectionReason;
  }
}
