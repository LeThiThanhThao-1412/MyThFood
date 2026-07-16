import {
  AggregateRoot,
  Result,
  DomainError,
  BusinessRuleViolationError,
} from "@mythfood/shared-kernel";
import { WalletId } from "./wallet-id";
import { WalletCreditedEvent } from "./events/wallet-credited.event";
import { WalletDebitedEvent } from "./events/wallet-debited.event";

export enum OwnerType {
  MERCHANT = "MERCHANT",
  DRIVER = "DRIVER",
}

export interface WalletProps {
  ownerId: string;
  ownerType: OwnerType;
  balance: number;
  currency: string;
}

export class Wallet extends AggregateRoot<WalletId> {
  private ownerId: string;
  private ownerType: OwnerType;
  private balance: number;
  private currency: string;

  private constructor(id: WalletId, props: WalletProps) {
    super(id);
    this.ownerId = props.ownerId;
    this.ownerType = props.ownerType;
    this.balance = props.balance;
    this.currency = props.currency;
  }

  // ===================== Factory Methods =====================

  public static create(props: {
    ownerId: string;
    ownerType: OwnerType;
    currency?: string;
  }): Result<Wallet, DomainError> {
    if (!props.ownerId?.trim()) {
      return Result.fail(
        new BusinessRuleViolationError("Owner ID is required"),
      );
    }
    if (!Object.values(OwnerType).includes(props.ownerType)) {
      return Result.fail(new BusinessRuleViolationError("Invalid owner type"));
    }

    const wallet = new Wallet(WalletId.create(), {
      ownerId: props.ownerId,
      ownerType: props.ownerType,
      balance: 0,
      currency: props.currency || "VND",
    });

    return Result.ok(wallet);
  }

  public static rehydrate(id: WalletId, props: WalletProps): Wallet {
    return new Wallet(id, props);
  }

  // ===================== Commands =====================

  public credit(
    amount: number,
    orderId: string,
    stripeTransferId: string,
  ): void {
    if (amount <= 0) {
      throw new BusinessRuleViolationError("Credit amount must be positive");
    }

    this.balance += amount;
    this.markUpdated();

    this.addDomainEvent(
      new WalletCreditedEvent(this.id, {
        ownerId: this.ownerId,
        ownerType: this.ownerType,
        amount,
        orderId,
        stripeTransferId,
      }),
    );
  }

  public debit(amount: number, stripePayoutId: string): void {
    if (amount <= 0) {
      throw new BusinessRuleViolationError("Debit amount must be positive");
    }
    if (amount > this.balance) {
      throw new BusinessRuleViolationError(
        `Insufficient balance: requested ${amount}, available ${this.balance}`,
      );
    }

    this.balance -= amount;
    this.markUpdated();

    this.addDomainEvent(
      new WalletDebitedEvent(this.id, {
        ownerId: this.ownerId,
        ownerType: this.ownerType,
        amount,
        stripePayoutId,
      }),
    );
  }

  // ===================== Queries =====================

  get walletOwnerId(): string {
    return this.ownerId;
  }
  get walletOwnerType(): OwnerType {
    return this.ownerType;
  }
  get walletBalance(): number {
    return this.balance;
  }
  get walletCurrency(): string {
    return this.currency;
  }
}
