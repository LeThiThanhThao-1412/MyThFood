import {
  AggregateRoot,
  Result,
  DomainError,
  BusinessRuleViolationError,
} from '@mythfood/shared-kernel';
import { InventoryId } from './inventory-id';
import { InventoryReservedEvent } from './events/inventory-reserved.event';
import { InventoryReleasedEvent } from './events/inventory-released.event';
import { InventoryConsumedEvent } from './events/inventory-consumed.event';

/** Mỗi một reservation đại diện cho lượng hàng đang được giữ cho 1 order */
export interface Reservation {
  orderId: string;
  quantity: number;
  reservedAt: Date;
  expiresAt: Date;
}

export interface InventoryProps {
  menuItemId: string;
  merchantId: string;
  totalQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  reservations: Reservation[];
  lowStockThreshold: number;
}

export class Inventory extends AggregateRoot<InventoryId> {
  private menuItemId: string;
  private merchantId: string;
  private totalQuantity: number;
  private availableQuantity: number;
  private reservedQuantity: number;
  private reservations: Reservation[];
  private lowStockThreshold: number;

  private constructor(id: InventoryId, props: InventoryProps) {
    super(id);
    this.menuItemId = props.menuItemId;
    this.merchantId = props.merchantId;
    this.totalQuantity = props.totalQuantity;
    this.availableQuantity = props.availableQuantity;
    this.reservedQuantity = props.reservedQuantity;
    this.reservations = props.reservations;
    this.lowStockThreshold = props.lowStockThreshold;
  }

  // ===================== Factory Methods =====================

  public static create(props: {
    menuItemId: string;
    merchantId: string;
    totalQuantity: number;
    lowStockThreshold?: number;
  }): Result<Inventory, DomainError> {
    if (!props.menuItemId?.trim()) {
      return Result.fail(new BusinessRuleViolationError('Menu item ID is required'));
    }
    if (!props.merchantId?.trim()) {
      return Result.fail(new BusinessRuleViolationError('Merchant ID is required'));
    }
    if (props.totalQuantity < 0) {
      return Result.fail(new BusinessRuleViolationError('Total quantity cannot be negative'));
    }

    const inv = new Inventory(InventoryId.create(), {
      menuItemId: props.menuItemId,
      merchantId: props.merchantId,
      totalQuantity: props.totalQuantity,
      availableQuantity: props.totalQuantity,
      reservedQuantity: 0,
      reservations: [],
      lowStockThreshold: props.lowStockThreshold ?? 5,
    });
    return Result.ok(inv);
  }

  public static rehydrate(id: InventoryId, props: InventoryProps): Inventory {
    return new Inventory(id, props);
  }

  // ===================== Core Operations =====================

  /**
   * Reserve (đặt chỗ): order tạo → reserved += quantity, available -= quantity.
   * Timeout mặc định 5 phút.
   */
  public reserve(orderId: string, quantity: number, timeoutMinutes: number = 5): void {
    if (!orderId?.trim()) throw new BusinessRuleViolationError('Order ID is required');
    if (quantity <= 0) throw new BusinessRuleViolationError('Reserve quantity must be positive');
    if (quantity > this.availableQuantity) {
      throw new BusinessRuleViolationError(
        `Insufficient stock: requested ${quantity}, available ${this.availableQuantity}`,
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + timeoutMinutes * 60_000);

    this.reservations.push({
      orderId,
      quantity,
      reservedAt: now,
      expiresAt,
    });

    this.reservedQuantity += quantity;
    this.availableQuantity -= quantity;
    this.markUpdated();

    this.addDomainEvent(
      new InventoryReservedEvent(this.id, {
        inventoryId: this.id.toString(),
        menuItemId: this.menuItemId,
        merchantId: this.merchantId,
        orderId,
        quantity,
        availableQuantity: this.availableQuantity,
        reservedQuantity: this.reservedQuantity,
      }),
    );
  }

  /**
   * Release: hủy/reject order → reserved -= quantity, available += quantity.
   */
  public release(orderId: string, reason: string): void {
    if (!orderId?.trim()) throw new BusinessRuleViolationError('Order ID is required');
    if (!reason?.trim()) throw new BusinessRuleViolationError('Release reason is required');

    const reservation = this.reservations.find((r) => r.orderId === orderId);
    if (!reservation) {
      throw new BusinessRuleViolationError(`No reservation found for order ${orderId}`);
    }

    this.reservations = this.reservations.filter((r) => r.orderId !== orderId);
    this.reservedQuantity -= reservation.quantity;
    this.availableQuantity += reservation.quantity;
    this.markUpdated();

    this.addDomainEvent(
      new InventoryReleasedEvent(this.id, {
        inventoryId: this.id.toString(),
        menuItemId: this.menuItemId,
        merchantId: this.merchantId,
        orderId,
        quantity: reservation.quantity,
        reason,
        availableQuantity: this.availableQuantity,
        reservedQuantity: this.reservedQuantity,
      }),
    );
  }

  /**
   * Consume: order ready → reserved -= quantity (không tăng available).
   * Tổng quantity giảm theo.
   */
  public consume(orderId: string): void {
    if (!orderId?.trim()) throw new BusinessRuleViolationError('Order ID is required');

    const reservation = this.reservations.find((r) => r.orderId === orderId);
    if (!reservation) {
      throw new BusinessRuleViolationError(`No reservation found for order ${orderId}`);
    }

    this.reservations = this.reservations.filter((r) => r.orderId !== orderId);
    this.reservedQuantity -= reservation.quantity;
    this.totalQuantity -= reservation.quantity;
    this.markUpdated();

    this.addDomainEvent(
      new InventoryConsumedEvent(this.id, {
        inventoryId: this.id.toString(),
        menuItemId: this.menuItemId,
        merchantId: this.merchantId,
        orderId,
        quantity: reservation.quantity,
        availableQuantity: this.availableQuantity,
        reservedQuantity: this.reservedQuantity,
      }),
    );
  }

  /**
   * Trả về danh sách các reservation đã hết hạn.
   */
  public getExpiredReservations(now: Date = new Date()): Reservation[] {
    return this.reservations.filter((r) => r.expiresAt <= now);
  }

  // ===================== Stock Management =====================

  public updateTotal(newTotal: number): void {
    if (newTotal < 0) {
      throw new BusinessRuleViolationError('Total quantity cannot be negative');
    }
    const diff = newTotal - this.totalQuantity;
    this.totalQuantity = newTotal;
    this.availableQuantity += diff;
    if (this.availableQuantity < 0) this.availableQuantity = 0;
    this.markUpdated();
  }

  public setLowStockThreshold(threshold: number): void {
    if (threshold < 0) throw new BusinessRuleViolationError('Threshold cannot be negative');
    this.lowStockThreshold = threshold;
    this.markUpdated();
  }

  // ===================== Queries =====================

  public isLowStock(): boolean {
    return this.availableQuantity <= this.lowStockThreshold;
  }

  public isOutOfStock(): boolean {
    return this.availableQuantity <= 0;
  }

  public hasReservationForOrder(orderId: string): boolean {
    return this.reservations.some((r) => r.orderId === orderId);
  }

  // ===================== Getters =====================

  get inventoryMenuItemId(): string { return this.menuItemId; }
  get inventoryMerchantId(): string { return this.merchantId; }
  get inventoryTotalQuantity(): number { return this.totalQuantity; }
  get inventoryAvailableQuantity(): number { return this.availableQuantity; }
  get inventoryReservedQuantity(): number { return this.reservedQuantity; }
  get inventoryReservations(): ReadonlyArray<Reservation> { return [...this.reservations]; }
  get inventoryLowStockThreshold(): number { return this.lowStockThreshold; }
}