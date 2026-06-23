import { BaseDomainEvent } from "@mythfood/shared-kernel";
import { PaymentId } from "../payment-id";

export class PaymentCreatedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: PaymentId,
    public readonly payload: {
      orderId: string;
      consumerId: string;
      merchantId: string;
      amount: number;
      paymentMethod: string;
    },
  ) {
    super(aggregateId, "com.mythfood.payment.created");
  }
}
