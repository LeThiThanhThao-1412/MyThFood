import {
  AggregateRoot,
  BusinessRuleViolationError,
} from "@mythfood/shared-kernel";
import { DispatchId } from "./dispatch-id";
import { DispatchCreatedEvent } from "./events/dispatch-created.event";
import { DispatchStatusChangedEvent } from "./events/dispatch-status-changed.event";

export enum DispatchStatus {
  MATCHING = "MATCHING",
  DRIVER_ASSIGNED = "DRIVER_ASSIGNED",
  DRIVER_ACCEPTED = "DRIVER_ACCEPTED",
  DRIVER_DECLINED = "DRIVER_DECLINED",
  DRIVER_ARRIVED = "DRIVER_ARRIVED",
  PICKED_UP = "PICKED_UP",
  DELIVERING = "DELIVERING",
  DELIVERED = "DELIVERED",
  EXPIRED = "EXPIRED",
  CANCELLED = "CANCELLED",
}

export enum DispatchDeclineReason {
  TOO_FAR = "TOO_FAR",
  BUSY = "BUSY",
  FATIGUE = "FATIGUE",
  COD_NOT_ENOUGH = "COD_NOT_ENOUGH",
  OTHER = "OTHER",
}

const MAX_MATCHING_ATTEMPTS = 3;

export class Dispatch extends AggregateRoot<DispatchId> {
  private _orderId: string;
  private _merchantId: string;
  private _merchantLatitude: number;
  private _merchantLongitude: number;
  private _deliveryAddress: string;
  private _deliveryLatitude: number;
  private _deliveryLongitude: number;
  private _status: DispatchStatus;
  private _driverId: string | null;
  private _matchedDriverIds: string[];
  private _retryCount: number;
  private _declineReason: string | null;
  private _declineReasonType: DispatchDeclineReason | null;
  private _pickedUpAt: Date | null;
  private _deliveredAt: Date | null;
  private _expiresAt: Date | null;
  private _cancellationReason: string | null;
  private _notes: string | null;

  private constructor(
    id: DispatchId,
    props: {
      orderId: string;
      merchantId: string;
      merchantLatitude?: number;
      merchantLongitude?: number;
      deliveryAddress: string;
      deliveryLatitude: number;
      deliveryLongitude: number;
      status: DispatchStatus;
      driverId: string | null;
      matchedDriverIds: string[];
      retryCount: number;
      declineReason: string | null;
      declineReasonType: DispatchDeclineReason | null;
      pickedUpAt: Date | null;
      deliveredAt: Date | null;
      expiresAt: Date | null;
      cancellationReason: string | null;
      notes: string | null;
    },
  ) {
    super(id);
    this._orderId = props.orderId;
    this._merchantId = props.merchantId;
    this._merchantLatitude = props.merchantLatitude ?? 10.77;
    this._merchantLongitude = props.merchantLongitude ?? 106.7;
    this._deliveryAddress = props.deliveryAddress;
    this._deliveryLatitude = props.deliveryLatitude;
    this._deliveryLongitude = props.deliveryLongitude;
    this._status = props.status;
    this._driverId = props.driverId;
    this._matchedDriverIds = props.matchedDriverIds;
    this._retryCount = props.retryCount;
    this._declineReason = props.declineReason;
    this._declineReasonType = props.declineReasonType;
    this._pickedUpAt = props.pickedUpAt;
    this._deliveredAt = props.deliveredAt;
    this._expiresAt = props.expiresAt;
    this._cancellationReason = props.cancellationReason;
    this._notes = props.notes;
  }

  // ===================== Factory Methods =====================

  public static create(props: {
    orderId: string;
    merchantId: string;
    deliveryAddress: string;
    deliveryLatitude: number;
    deliveryLongitude: number;
    merchantLatitude?: number;
    merchantLongitude?: number;
    expiresAt?: Date;
  }): Dispatch {
    const dispatchId = DispatchId.create();

    const dispatch = new Dispatch(dispatchId, {
      orderId: props.orderId,
      merchantId: props.merchantId,
      deliveryAddress: props.deliveryAddress,
      deliveryLatitude: props.deliveryLatitude,
      deliveryLongitude: props.deliveryLongitude,
      merchantLatitude: props.merchantLatitude,
      merchantLongitude: props.merchantLongitude,
      status: DispatchStatus.MATCHING,
      driverId: null,
      matchedDriverIds: [],
      retryCount: 0,
      declineReason: null,
      declineReasonType: null,
      pickedUpAt: null,
      deliveredAt: null,
      expiresAt: props.expiresAt ?? null,
      cancellationReason: null,
      notes: null,
    });

    dispatch.addDomainEvent(
      new DispatchCreatedEvent(dispatchId, {
        dispatchId: dispatchId.value,
        orderId: props.orderId,
        merchantId: props.merchantId,
        deliveryAddress: props.deliveryAddress,
        deliveryLatitude: props.deliveryLatitude,
        deliveryLongitude: props.deliveryLongitude,
      }),
    );

    return dispatch;
  }

  public static rehydrate(
    id: DispatchId,
    props: {
      orderId: string;
      merchantId: string;
      merchantLatitude?: number;
      merchantLongitude?: number;
      deliveryAddress: string;
      deliveryLatitude: number;
      deliveryLongitude: number;
      status: DispatchStatus;
      driverId: string | null;
      matchedDriverIds: string[];
      retryCount: number;
      declineReason: string | null;
      declineReasonType: DispatchDeclineReason | null;
      pickedUpAt: Date | null;
      deliveredAt: Date | null;
      expiresAt: Date | null;
      cancellationReason: string | null;
      notes: string | null;
    },
  ): Dispatch {
    return new Dispatch(id, props);
  }

  // ===================== Matching Engine =====================

  public assignDriver(driverId: string): void {
    if (this._status !== DispatchStatus.MATCHING) {
      throw new BusinessRuleViolationError(
        `Cannot assign driver when dispatch is in ${this._status} status`,
      );
    }
    if (this._matchedDriverIds.includes(driverId)) {
      throw new BusinessRuleViolationError(
        "Driver was already attempted for this dispatch",
      );
    }
    if (this._retryCount >= MAX_MATCHING_ATTEMPTS) {
      throw new BusinessRuleViolationError(
        `Maximum matching attempts (${MAX_MATCHING_ATTEMPTS}) reached`,
      );
    }

    const previousStatus = this._status;
    this._driverId = driverId;
    this._matchedDriverIds.push(driverId);
    this._status = DispatchStatus.DRIVER_ASSIGNED;
    this.markUpdated();

    this.addDomainEvent(
      new DispatchStatusChangedEvent(this.id, {
        dispatchId: this.id.value,
        orderId: this._orderId,
        previousStatus,
        newStatus: DispatchStatus.DRIVER_ASSIGNED,
        driverId,
      }),
    );
  }

  public driverAccept(): void {
    if (this._status !== DispatchStatus.DRIVER_ASSIGNED) {
      throw new BusinessRuleViolationError(
        `Driver can only accept when dispatch is in DRIVER_ASSIGNED status, current: ${this._status}`,
      );
    }

    const previousStatus = this._status;
    this._status = DispatchStatus.DRIVER_ACCEPTED;
    this.markUpdated();

    this.addDomainEvent(
      new DispatchStatusChangedEvent(this.id, {
        dispatchId: this.id.value,
        orderId: this._orderId,
        previousStatus,
        newStatus: DispatchStatus.DRIVER_ACCEPTED,
        driverId: this._driverId!,
      }),
    );
  }

  public driverDecline(reason: DispatchDeclineReason, detail?: string): void {
    if (this._status !== DispatchStatus.DRIVER_ASSIGNED) {
      throw new BusinessRuleViolationError(
        `Driver can only decline when dispatch is in DRIVER_ASSIGNED status, current: ${this._status}`,
      );
    }

    const previousStatus = this._status;
    const previousDriverId = this._driverId;
    this._status = DispatchStatus.DRIVER_DECLINED;
    this._declineReason = detail ?? reason;
    this._declineReasonType = reason;
    this._retryCount += 1;
    this._driverId = null;
    this.markUpdated();

    this.addDomainEvent(
      new DispatchStatusChangedEvent(this.id, {
        dispatchId: this.id.value,
        orderId: this._orderId,
        previousStatus,
        newStatus: DispatchStatus.DRIVER_DECLINED,
        driverId: previousDriverId!,
        reason: detail ?? reason,
      }),
    );

    // Auto-retry: go back to matching if retries remain
    if (this._retryCount < MAX_MATCHING_ATTEMPTS) {
      this._status = DispatchStatus.MATCHING;
    } else {
      this._status = DispatchStatus.EXPIRED;
      this.addDomainEvent(
        new DispatchStatusChangedEvent(this.id, {
          dispatchId: this.id.value,
          orderId: this._orderId,
          previousStatus: DispatchStatus.DRIVER_DECLINED,
          newStatus: DispatchStatus.EXPIRED,
          reason: "Maximum matching attempts reached",
        }),
      );
    }
  }

  public driverArrived(): void {
    if (this._status !== DispatchStatus.DRIVER_ACCEPTED) {
      throw new BusinessRuleViolationError(
        `Driver can only mark arrived when dispatch is in DRIVER_ACCEPTED status, current: ${this._status}`,
      );
    }

    const previousStatus = this._status;
    this._status = DispatchStatus.DRIVER_ARRIVED;
    this.markUpdated();

    this.addDomainEvent(
      new DispatchStatusChangedEvent(this.id, {
        dispatchId: this.id.value,
        orderId: this._orderId,
        previousStatus,
        newStatus: DispatchStatus.DRIVER_ARRIVED,
        driverId: this._driverId!,
      }),
    );
  }

  public markPickedUp(): void {
    if (this._status !== DispatchStatus.DRIVER_ARRIVED) {
      throw new BusinessRuleViolationError(
        `Can only mark picked up when dispatch is in DRIVER_ARRIVED status, current: ${this._status}`,
      );
    }

    const previousStatus = this._status;
    this._status = DispatchStatus.PICKED_UP;
    this._pickedUpAt = new Date();
    this.markUpdated();

    this.addDomainEvent(
      new DispatchStatusChangedEvent(this.id, {
        dispatchId: this.id.value,
        orderId: this._orderId,
        previousStatus,
        newStatus: DispatchStatus.PICKED_UP,
        driverId: this._driverId!,
      }),
    );
  }

  public startDelivering(): void {
    if (this._status !== DispatchStatus.PICKED_UP) {
      throw new BusinessRuleViolationError(
        `Can only start delivering when dispatch is in PICKED_UP status, current: ${this._status}`,
      );
    }

    const previousStatus = this._status;
    this._status = DispatchStatus.DELIVERING;
    this.markUpdated();

    this.addDomainEvent(
      new DispatchStatusChangedEvent(this.id, {
        dispatchId: this.id.value,
        orderId: this._orderId,
        previousStatus,
        newStatus: DispatchStatus.DELIVERING,
        driverId: this._driverId!,
      }),
    );
  }

  public markDelivered(): void {
    if (this._status !== DispatchStatus.DELIVERING) {
      throw new BusinessRuleViolationError(
        `Can only mark delivered when dispatch is in DELIVERING status, current: ${this._status}`,
      );
    }

    const previousStatus = this._status;
    this._status = DispatchStatus.DELIVERED;
    this._deliveredAt = new Date();
    this.markUpdated();

    this.addDomainEvent(
      new DispatchStatusChangedEvent(this.id, {
        dispatchId: this.id.value,
        orderId: this._orderId,
        previousStatus,
        newStatus: DispatchStatus.DELIVERED,
        driverId: this._driverId!,
      }),
    );
  }

  public expire(): void {
    if (
      this._status !== DispatchStatus.MATCHING &&
      this._status !== DispatchStatus.DRIVER_ASSIGNED
    ) {
      throw new BusinessRuleViolationError(
        `Cannot expire dispatch in ${this._status} status`,
      );
    }

    const previousStatus = this._status;
    this._status = DispatchStatus.EXPIRED;
    this.markUpdated();

    this.addDomainEvent(
      new DispatchStatusChangedEvent(this.id, {
        dispatchId: this.id.value,
        orderId: this._orderId,
        previousStatus,
        newStatus: DispatchStatus.EXPIRED,
        reason: "Dispatch timed out",
      }),
    );
  }

  public cancel(reason: string): void {
    const cancellableStatuses = [
      DispatchStatus.MATCHING,
      DispatchStatus.DRIVER_ASSIGNED,
      DispatchStatus.DRIVER_ACCEPTED,
    ];

    if (!cancellableStatuses.includes(this._status)) {
      throw new BusinessRuleViolationError(
        `Cannot cancel dispatch in ${this._status} status`,
      );
    }

    const previousStatus = this._status;
    this._status = DispatchStatus.CANCELLED;
    this._cancellationReason = reason;
    this.markUpdated();

    this.addDomainEvent(
      new DispatchStatusChangedEvent(this.id, {
        dispatchId: this.id.value,
        orderId: this._orderId,
        previousStatus,
        newStatus: DispatchStatus.CANCELLED,
        reason,
      }),
    );
  }

  // ---- Updates ----

  public updateNotes(notes: string): void {
    this._notes = notes;
    this.markUpdated();
  }

  // ---- Queries ----

  get dispatchOrderId(): string {
    return this._orderId;
  }
  get dispatchMerchantId(): string {
    return this._merchantId;
  }
  get dispatchMerchantLatitude(): number {
    return this._merchantLatitude;
  }
  get dispatchMerchantLongitude(): number {
    return this._merchantLongitude;
  }
  get dispatchDeliveryAddress(): string {
    return this._deliveryAddress;
  }
  get dispatchDeliveryLatitude(): number {
    return this._deliveryLatitude;
  }
  get dispatchDeliveryLongitude(): number {
    return this._deliveryLongitude;
  }
  get dispatchStatus(): DispatchStatus {
    return this._status;
  }
  get dispatchDriverId(): string | null {
    return this._driverId;
  }
  get dispatchMatchedDriverIds(): string[] {
    return [...this._matchedDriverIds];
  }
  get dispatchRetryCount(): number {
    return this._retryCount;
  }
  get dispatchDeclineReason(): string | null {
    return this._declineReason;
  }
  get dispatchDeclineReasonType(): DispatchDeclineReason | null {
    return this._declineReasonType;
  }
  get dispatchPickedUpAt(): Date | null {
    return this._pickedUpAt;
  }
  get dispatchDeliveredAt(): Date | null {
    return this._deliveredAt;
  }
  get dispatchExpiresAt(): Date | null {
    return this._expiresAt;
  }
  get dispatchCancellationReason(): string | null {
    return this._cancellationReason;
  }
  get dispatchNotes(): string | null {
    return this._notes;
  }

  get isTerminal(): boolean {
    return [
      DispatchStatus.DELIVERED,
      DispatchStatus.EXPIRED,
      DispatchStatus.CANCELLED,
    ].includes(this._status);
  }

  get isActive(): boolean {
    return !this.isTerminal;
  }

  get hasRemainingRetries(): boolean {
    return this._retryCount < MAX_MATCHING_ATTEMPTS;
  }
}
