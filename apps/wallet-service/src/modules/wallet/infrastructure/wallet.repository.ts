import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WalletEntity } from "./wallet.entity";
import { WalletTransactionEntity } from "./wallet-transaction.entity";
import { Wallet } from "../domain/wallet.aggregate";

/**
 * FIX #8: WalletRepository encapsulates TypeORM behind a clean domain-facing interface.
 * WalletService no longer depends directly on TypeORM Repositories.
 *
 * FIX #9: VersionColumn on WalletEntity enables optimistic locking.
 * Concurrent updates to the same wallet will throw OptimisticLockVersionMismatchError,
 * preventing race conditions on balance operations.
 */
@Injectable()
export class WalletRepository {
  private readonly logger = new Logger(WalletRepository.name);

  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(WalletTransactionEntity)
    private readonly txRepo: Repository<WalletTransactionEntity>,
  ) {}

  async findByOwnerOrCreate(ownerId: string, ownerType: string): Promise<{
    entity: WalletEntity;
    domain: Wallet;
  }> {
    let entity = await this.walletRepo.findOne({
      where: { ownerId, ownerType },
    });
    if (!entity) {
      const domain = Wallet.create({ ownerId, ownerType });
      entity = this.walletRepo.create({
        id: domain.id,
        ownerId: domain.ownerId,
        ownerType: domain.ownerType,
        balance: domain.walletBalance,
        currency: "VND",
      });
      await this.walletRepo.save(entity);
      this.logger.log(`Created wallet for ${ownerType}:${ownerId}`);
    }
    const domain = this.toDomain(entity);
    return { entity, domain };
  }

  async save(walletEntity: WalletEntity): Promise<WalletEntity> {
    return this.walletRepo.save(walletEntity);
  }

  async recordTransaction(params: {
    id: string;
    walletId: string;
    ownerId: string;
    ownerType: string;
    type: "CREDIT" | "DEBIT";
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    description: string;
    referenceType?: string;
    referenceId?: string;
    orderId?: string;
    stripeTransferId?: string;
    stripePayoutId?: string;
  }): Promise<WalletTransactionEntity> {
    return this.txRepo.save({
      id: params.id,
      walletId: params.walletId,
      ownerId: params.ownerId,
      ownerType: params.ownerType,
      type: params.type,
      amount: params.amount,
      balanceBefore: params.balanceBefore,
      balanceAfter: params.balanceAfter,
      description: params.description,
      referenceType: params.referenceType || null,
      referenceId: params.referenceId || null,
      orderId: params.orderId || null,
      stripeTransferId: params.stripeTransferId || null,
      stripePayoutId: params.stripePayoutId || null,
      createdAt: new Date(),
    } as WalletTransactionEntity);
  }

  async getTransactions(ownerId: string, ownerType: string): Promise<WalletTransactionEntity[]> {
    return this.txRepo.find({
      where: { ownerId, ownerType },
      order: { createdAt: "DESC" },
      take: 50,
    });
  }

  async countDailyWithdraws(ownerId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.txRepo
      .createQueryBuilder("tx")
      .where("tx.ownerId = :ownerId", { ownerId })
      .andWhere("tx.type = 'DEBIT'")
      .andWhere("tx.referenceType = 'WITHDRAW'")
      .andWhere("tx.createdAt >= :today", { today })
      .getCount();
  }

  async findAllWallets(): Promise<WalletEntity[]> {
    return this.walletRepo.find();
  }

  async findTransactionsPaginated(params: {
    skip: number;
    take: number;
    type?: string;
    ownerType?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }): Promise<{ items: WalletTransactionEntity[]; total: number }> {
    const qb = this.txRepo.createQueryBuilder("tx");
    if (params.ownerType) qb.andWhere("tx.ownerType = :ownerType", { ownerType: params.ownerType });
    if (params.type) qb.andWhere("tx.referenceType = :type", { type: params.type });
    if (params.startDate) qb.andWhere("tx.createdAt >= :startDate", { startDate: params.startDate });
    if (params.endDate) qb.andWhere("tx.createdAt <= :endDate", { endDate: params.endDate });
    if (params.search) {
      qb.andWhere(
        "(tx.description ILIKE :search OR tx.referenceId ILIKE :search OR tx.ownerId ILIKE :search)",
        { search: `%${params.search}%` },
      );
    }
    qb.skip(params.skip).take(params.take).orderBy("tx.createdAt", "DESC");
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getStatsSummary(startDate?: string, endDate?: string): Promise<{
    totalTopupVolume: number;
    totalSettlementVolume: number;
  }> {
    const statsQb = this.txRepo.createQueryBuilder("tx");
    if (startDate) statsQb.andWhere("tx.createdAt >= :startDate", { startDate });
    if (endDate) statsQb.andWhere("tx.createdAt <= :endDate", { endDate });
    const stats = await statsQb
      .select("tx.referenceType", "type")
      .addSelect("SUM(tx.amount)", "total")
      .where("tx.type = 'CREDIT'")
      .groupBy("tx.referenceType")
      .getRawMany();
    let totalTopupVolume = 0;
    let totalSettlementVolume = 0;
    for (const row of stats) {
      if (row.type === "TOPUP") totalTopupVolume = Number(row.total) || 0;
      if (row.type === "SETTLEMENT") totalSettlementVolume = Number(row.total) || 0;
    }
    return { totalTopupVolume, totalSettlementVolume };
  }

  toDomain(entity: WalletEntity): Wallet {
    return Wallet.create({
      id: entity.id,
      ownerId: entity.ownerId,
      ownerType: entity.ownerType,
      balance: Number(entity.balance),
      currency: entity.currency,
    });
  }
}