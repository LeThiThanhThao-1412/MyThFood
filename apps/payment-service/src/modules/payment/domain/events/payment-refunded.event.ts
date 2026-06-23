import { BaseDomainEvent } from "@mythfood/shared-kernel";
import { PaymentId } from "../payment-id";

export class PaymentRefundedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: PaymentId,
    public readonly payload: {
      orderId: string;
      reason: string;
      refundedAmount: number;
    },
  ) {
    super(aggregateId, "com.mythfood.payment.refunded");
  }
}
