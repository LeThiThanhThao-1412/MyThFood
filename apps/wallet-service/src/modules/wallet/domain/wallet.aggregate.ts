import { randomUUID } from "crypto";

export { OwnerType } from "./owner-type.enum";

export interface WalletProps {
  id?: string;
  ownerId: string;
  ownerType: string;
  balance?: number;
  currency?: string;
}

export class Wallet {
  readonly id: string;
  readonly ownerId: string;
  readonly ownerType: string;
  private _balance: number;
  readonly currency: string;

  private constructor(props: Required<WalletProps>) {
    this.id = props.id!;
    this.ownerId = props.ownerId;
    this.ownerType = props.ownerType;
    this._balance = props.balance!;
    this.currency = props.currency!;
  }

  static create(props: WalletProps): Wallet {
    return new Wallet({
      id: props.id || randomUUID(),
      ownerId: props.ownerId,
      ownerType: props.ownerType,
      balance: props.balance || 0,
      currency: props.currency || "VND",
    });
  }

  get walletBalance(): number {
    return this._balance;
  }

  credit(amount: number): void {
    if (amount <= 0) throw new Error("Credit amount must be positive");
    this._balance += amount;
  }

  debit(amount: number): void {
    if (amount <= 0) throw new Error("Debit amount must be positive");
    if (amount > this._balance) throw new Error("Insufficient balance");
    this._balance -= amount;
  }
}