import { WalletEntity } from "./wallet.entity";
import { Wallet } from "../domain/wallet.aggregate";

export class WalletMapper {
  static toDomain(entity: WalletEntity): Wallet {
    return Wallet.create({
      id: entity.id,
      ownerId: entity.ownerId,
      ownerType: entity.ownerType,
      balance: Number(entity.balance),
      currency: entity.currency,
    });
  }

  static toPersistence(wallet: Wallet): WalletEntity {
    const entity = new WalletEntity();
    entity.id = wallet.id;
    entity.ownerId = wallet.walletOwnerId;
    entity.ownerType = wallet.walletOwnerType;
    entity.balance = wallet.walletBalance;
    entity.currency = wallet.walletCurrency;
    return entity;
  }
}