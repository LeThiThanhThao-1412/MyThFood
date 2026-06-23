import {
  AggregateRoot,
  Result,
  DomainError,
  BusinessRuleViolationError,
} from "@mythfood/shared-kernel";
import { PaymentId } from "./payment-id";
import { PaymentCreatedEvent } from "./events/payment-created.event";
import { PaymentCompletedEvent } from "./events/payment-completed.event";
import { PaymentFailedEvent } from "./events/payment-failed.event";
import { PaymentRefundedEvent } from "./events/payment-refunded.event";

export enum PaymentStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
}

export enum PaymentMethod {
  CREDIT_CARD = "CREDIT_CARD",
  DEBIT_CARD = "DEBIT_CARD",
  BANK_TRANSFER = "BANK_TRANSFER",
  E_WALLET = "E_WALLET",
  CASH = "CASH",
}

export interface PaymentProps {
  orderId: string;
  consumerId: string;
  merchantId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  transactionId: string | null;
  failureReason: string | null;
  refundReason: string | null;
  refundedAmount: number | null;
}

export class Payment extends AggregateRoot<PaymentId> {
  private orderId: string;
  private consumerId: string;
  private merchantId: string;
  private amount: number;
  private paymentMethod: PaymentMethod;
  private status: PaymentStatus;
  private transactionId: string | null;
  private failureReason: string | null;
  private refundReason: string | null;
  private refundedAmount: number | null;

  private constructor(id: PaymentId, props: PaymentProps) {
    super(id);
    this.orderId = props.orderId;
    this.consumerId = props.consumerId;
    this.merchantId = props.merchantId;
    this.amount = props.amount;
    this.paymentMethod = props.paymentMethod;
    this.status = props.status;
    this.transactionId = props.transactionId;
    this.failureReason = props.failureReason;
    this.refundReason = props.refundReason;
    this.refundedAmount = props.refundedAmount;
  }

  // ===================== Factory Methods =====================

  public static create(props: {
    orderId: string;
    consumerId: string;
    merchantId: string;
    amount: number;
    paymentMethod: PaymentMethod;
  }): Result<Payment, DomainError> {
    if (!props.orderId?.trim()) {
      return Result.fail(
        new BusinessRuleViolationError("Order ID is required"),
      );
    }
    if (!props.consumerId?.trim()) {
      return Result.fail(
        new BusinessRuleViolationError("Consumer ID is required"),
      );
    }
    if (!props.merchantId?.trim()) {
      return Result.fail(
        new BusinessRuleViolationError("Merchant ID is required"),
      );
    }
    if (props.amount <= 0) {
      return Result.fail(
        new BusinessRuleViolationError("Amount must be positive"),
      );
    }

    const payment = new Payment(PaymentId.create(), {
      orderId: props.orderId,
      consumerId: props.consumerId,
      merchantId: props.merchantId,
      amount: props.amount,
      paymentMethod: props.paymentMethod,
      status: PaymentStatus.PENDING,
      transactionId: null,
      failureReason: null,
      refundReason: null,
      refundedAmount: null,
    });

    payment.addDomainEvent(
      new PaymentCreatedEvent(payment.id, {
        orderId: props.orderId,
        consumerId: props.consumerId,
        merchantId: props.merchantId,
        amount: props.amount,
        paymentMethod: props.paymentMethod,
      }),
    );

    return Result.ok(payment);
  }

  public static rehydrate(id: PaymentId, props: PaymentProps): Payment {
    return new Payment(id, props);
  }

  // ===================== State Machine =====================

  /**
   * Complete payment - only from PENDING
   */
  public complete(transactionId: string): void {
    if (this.status !== PaymentStatus.PENDING) {
      throw new BusinessRuleViolationError(
        `Cannot complete payment in status ${this.status}. Only PENDING payments can be completed.`,
      );
    }
    if (!transactionId?.trim()) {
      throw new BusinessRuleViolationError(
        "Transaction ID is required to complete payment",
      );
    }

    this.status = PaymentStatus.COMPLETED;
    this.transactionId = transactionId;
    this.markUpdated();

    this.addDomainEvent(
      new PaymentCompletedEvent(this.id, {
        orderId: this.orderId,
        transactionId,
      }),
    );
  }

  /**
   * Fail payment - only from PENDING
   */
  public fail(reason: string): void {
    if (this.status !== PaymentStatus.PENDING) {
      throw new BusinessRuleViolationError(
        `Cannot fail payment in status ${this.status}. Only PENDING payments can be failed.`,
      );
    }
    if (!reason?.trim()) {
      throw new BusinessRuleViolationError("Failure reason is required");
    }

    this.status = PaymentStatus.FAILED;
    this.failureReason = reason;
    this.markUpdated();

    this.addDomainEvent(
      new PaymentFailedEvent(this.id, {
        orderId: this.orderId,
        reason,
      }),
    );
  }

  /**
   * Refund payment - only from COMPLETED
   */
  public refund(reason: string): void {
    if (this.status !== PaymentStatus.COMPLETED) {
      throw new BusinessRuleViolationError(
        `Cannot refund payment in status ${this.status}. Only COMPLETED payments can be refunded.`,
      );
    }
    if (!reason?.trim()) {
      throw new BusinessRuleViolationError("Refund reason is required");
    }

    this.status = PaymentStatus.REFUNDED;
    this.refundReason = reason;
    this.refundedAmount = this.amount;
    this.markUpdated();

    this.addDomainEvent(
      new PaymentRefundedEvent(this.id, {
        orderId: this.orderId,
        reason,
        refundedAmount: this.amount,
      }),
    );
  }

  // ===================== Queries =====================

  public isCompleted(): boolean {
    return this.status === PaymentStatus.COMPLETED;
  }

  public isPending(): boolean {
    return this.status === PaymentStatus.PENDING;
  }

  public isFailed(): boolean {
    return this.status === PaymentStatus.FAILED;
  }

  public isRefunded(): boolean {
    return this.status === PaymentStatus.REFUNDED;
  }

  // ===================== Getters =====================

  get paymentOrderId(): string {
    return this.orderId;
  }
  get paymentConsumerId(): string {
    return this.consumerId;
  }
  get paymentMerchantId(): string {
    return this.merchantId;
  }
  get paymentAmount(): number {
    return this.amount;
  }
  get paymentMethodType(): PaymentMethod {
    return this.paymentMethod;
  }
  get paymentStatus(): PaymentStatus {
    return this.status;
  }
  get paymentTransactionId(): string | null {
    return this.transactionId;
  }
  get paymentFailureReason(): string | null {
    return this.failureReason;
  }
  get paymentRefundReason(): string | null {
    return this.refundReason;
  }
  get paymentRefundedAmount(): number | null {
    return this.refundedAmount;
  }
}
