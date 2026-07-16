import { BaseDomainEvent } from "@mythfood/shared-kernel";
import { WalletId } from "../wallet-id";

export class WalletCreditedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: WalletId,
    public readonly payload: {
      ownerId: string;
      ownerType: string;
      amount: number;
      orderId: string;
      stripeTransferId: string;
    },
  ) {
    super(aggregateId, "com.mythfood.wallet.credited");
  }
}
