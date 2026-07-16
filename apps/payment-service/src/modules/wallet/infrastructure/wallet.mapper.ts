import { Wallet, OwnerType, WalletProps } from "../domain/wallet.aggregate";
import { WalletId } from "../domain/wallet-id";
import { WalletEntity } from "./wallet.entity";

export class WalletMapper {
  public static toDomain(entity: WalletEntity): Wallet {
    const props: WalletProps = {
      ownerId: entity.ownerId,
      ownerType: entity.ownerType as OwnerType,
      balance: Number(entity.balance),
      currency: entity.currency,
    };

    return Wallet.rehydrate(WalletId.from(entity.id), props);
  }

  public static toPersistence(wallet: Wallet): WalletEntity {
    const entity = new WalletEntity();
    entity.id = wallet.id.toString();
    entity.ownerId = wallet.walletOwnerId;
    entity.ownerType = wallet.walletOwnerType;
    entity.balance = wallet.walletBalance;
    entity.currency = wallet.walletCurrency;
    return entity;
  }
}
