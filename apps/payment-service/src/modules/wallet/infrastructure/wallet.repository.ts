import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository as TypeOrmRepo } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { IRepository } from "@mythfood/shared-kernel";
import { Wallet, OwnerType } from "../domain/wallet.aggregate";
import { WalletId } from "../domain/wallet-id";
import { WalletEntity } from "./wallet.entity";
import { WalletMapper } from "./wallet.mapper";
import {
  WalletTransactionEntity,
  WalletTransactionType,
} from "./wallet-transaction.entity";

@Injectable()
export class WalletRepository implements IRepository<Wallet, WalletId> {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepo: TypeOrmRepo<WalletEntity>,
    @InjectRepository(WalletTransactionEntity)
    private readonly txRepo: TypeOrmRepo<WalletTransactionEntity>,
  ) {}

  async save(aggregate: Wallet): Promise<void> {
    const entity = WalletMapper.toPersistence(aggregate);
    await this.walletRepo.save(entity);
  }

  async findById(id: WalletId): Promise<Wallet | null> {
    const entity = await this.walletRepo.findOne({
      where: { id: id.toString() },
    });
    if (!entity) return null;
    return WalletMapper.toDomain(entity);
  }

  async findByIdOrFail(id: WalletId): Promise<Wallet> {
    const wallet = await this.findById(id);
    if (!wallet) throw new Error(`Wallet with id ${id.toString()} not found`);
    return wallet;
  }

  async findByOwnerId(ownerId: string): Promise<Wallet | null> {
    const entity = await this.walletRepo.findOne({ where: { ownerId } });
    if (!entity) return null;
    return WalletMapper.toDomain(entity);
  }

  async findByOwnerIdOrCreate(
    ownerId: string,
    ownerType: OwnerType,
  ): Promise<Wallet> {
    let wallet = await this.findByOwnerId(ownerId);
    if (!wallet) {
      const result = Wallet.create({ ownerId, ownerType });
      if (result.isFailure) throw result.error;
      wallet = result.value;
      await this.save(wallet);
    }
    return wallet;
  }

  async recordTransaction(params: {
    walletId: string;
    ownerId: string;
    ownerType: string;
    type: WalletTransactionType;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    description?: string;
    orderId?: string;
    stripeTransferId?: string;
    stripePayoutId?: string;
  }): Promise<void> {
    const tx = new WalletTransactionEntity();
    tx.id = uuidv4();
    tx.walletId = params.walletId;
    tx.ownerId = params.ownerId;
    tx.ownerType = params.ownerType;
    tx.type = params.type;
    tx.amount = params.amount;
    tx.balanceBefore = params.balanceBefore;
    tx.balanceAfter = params.balanceAfter;
    tx.description = params.description ?? null;
    tx.orderId = params.orderId ?? null;
    tx.stripeTransferId = params.stripeTransferId ?? null;
    tx.stripePayoutId = params.stripePayoutId ?? null;
    await this.txRepo.save(tx);
  }

  async getTransactionsByWalletId(
    walletId: string,
  ): Promise<WalletTransactionEntity[]> {
    return this.txRepo.find({
      where: { walletId },
      order: { createdAt: "DESC" },
    });
  }

  async exists(id: WalletId): Promise<boolean> {
    const count = await this.walletRepo.count({
      where: { id: id.toString() },
    });
    return count > 0;
  }

  async delete(aggregate: Wallet): Promise<void> {
    await this.walletRepo.delete(aggregate.id.toString());
  }

  async deleteById(id: WalletId): Promise<void> {
    await this.walletRepo.delete(id.toString());
  }
}
