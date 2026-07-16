import { BaseDomainEvent } from "@mythfood/shared-kernel";
import { WalletId } from "../wallet-id";

export class WalletDebitedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: WalletId,
    public readonly payload: {
      ownerId: string;
      ownerType: string;
      amount: number;
      stripePayoutId: string;
    },
  ) {
    super(aggregateId, "com.mythfood.wallet.debited");
  }
}
