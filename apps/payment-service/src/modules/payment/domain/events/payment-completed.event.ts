import { BaseDomainEvent } from "@mythfood/shared-kernel";
import { PaymentId } from "../payment-id";

export class PaymentCompletedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: PaymentId,
    public readonly payload: {
      orderId: string;
      transactionId: string;
    },
  ) {
    super(aggregateId, "com.mythfood.payment.completed");
  }
}
