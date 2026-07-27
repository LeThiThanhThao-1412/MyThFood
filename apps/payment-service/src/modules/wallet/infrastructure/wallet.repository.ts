import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { WalletEntity } from "./wallet.entity";
import { WalletTransactionEntity } from "./wallet-transaction.entity";
import { Wallet } from "../domain/wallet.aggregate";

export { WalletTransactionEntity };

@Injectable()
export class WalletRepository {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(WalletTransactionEntity)
    private readonly txRepo: Repository<WalletTransactionEntity>,
  ) {}

  async findByOwnerId(ownerId: string): Promise<Wallet | null> {
    const entity = await this.walletRepo.findOne({ where: { ownerId } });
    if (!entity) return null;
    return this.entityToDomain(entity);
  }

  async findByOwnerIdOrCreate(ownerId: string, ownerType: string): Promise<Wallet> {
    let entity = await this.walletRepo.findOne({ where: { ownerId, ownerType } });
    if (!entity) {
      const wallet = Wallet.create({ ownerId, ownerType });
      entity = this.walletRepo.create({
        id: wallet.id,
        ownerId: wallet.walletOwnerId,
        ownerType: wallet.walletOwnerType,
        balance: wallet.walletBalance,
        currency: wallet.walletCurrency,
      });
      await this.walletRepo.save(entity);
    }
    return this.entityToDomain(entity);
  }

  async save(wallet: Wallet): Promise<void> {
    const entity = this.domainToEntity(wallet);
    await this.walletRepo.save(entity);
  }

  async recordTransaction(params: {
    walletId: string;
    ownerId: string;
    ownerType: string;
    type: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    description: string;
    orderId?: string;
    stripeTransferId?: string;
    stripePayoutId?: string;
  }): Promise<void> {
    await this.txRepo.save({
      id: randomUUID(),
      walletId: params.walletId,
      ownerId: params.ownerId,
      ownerType: params.ownerType,
      type: params.type,
      amount: params.amount,
      balanceBefore: params.balanceBefore,
      balanceAfter: params.balanceAfter,
      description: params.description,
      orderId: params.orderId || null,
      stripeTransferId: params.stripeTransferId || null,
      stripePayoutId: params.stripePayoutId || null,
      createdAt: new Date(),
    } as any);
  }

  async getTransactionsByWalletId(walletId: string): Promise<WalletTransactionEntity[]> {
    return this.txRepo.find({
      where: { walletId },
      order: { createdAt: "DESC" },
    });
  }

  private entityToDomain(entity: WalletEntity): Wallet {
    return Wallet.create({
      id: entity.id,
      ownerId: entity.ownerId,
      ownerType: entity.ownerType,
      balance: Number(entity.balance),
      currency: entity.currency,
    });
  }

  private domainToEntity(wallet: Wallet): WalletEntity {
    const entity = new WalletEntity();
    entity.id = wallet.id;
    entity.ownerId = wallet.walletOwnerId;
    entity.ownerType = wallet.walletOwnerType;
    entity.balance = wallet.walletBalance;
    entity.currency = wallet.walletCurrency;
    return entity;
  }
}