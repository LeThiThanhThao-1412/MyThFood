import { BaseDomainEvent } from "@mythfood/shared-kernel";
import { PaymentId } from "../payment-id";

export class PaymentFailedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: PaymentId,
    public readonly payload: {
      orderId: string;
      reason: string;
    },
  ) {
    super(aggregateId, "com.mythfood.payment.failed");
  }
}
