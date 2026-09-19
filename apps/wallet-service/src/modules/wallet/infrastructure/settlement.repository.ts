import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SettlementEntryEntity } from "./settlement-entry.entity";
import { SettlementBatchEntity } from "./settlement-batch.entity";
import { ClawbackLiabilityEntity } from "./clawback-liability.entity";
import { ClawbackDeductionEntity } from "./clawback-deduction.entity";
import { WalletTransactionEntity } from "./wallet-transaction.entity";

@Injectable()
export class SettlementRepository {
  private readonly logger = new Logger(SettlementRepository.name);

  constructor(
    @InjectRepository(SettlementEntryEntity)
    private readonly entryRepo: Repository<SettlementEntryEntity>,
    @InjectRepository(SettlementBatchEntity)
    private readonly batchRepo: Repository<SettlementBatchEntity>,
    @InjectRepository(ClawbackLiabilityEntity)
    private readonly clawbackRepo: Repository<ClawbackLiabilityEntity>,
    @InjectRepository(ClawbackDeductionEntity)
    private readonly deductionRepo: Repository<ClawbackDeductionEntity>,
    @InjectRepository(WalletTransactionEntity)
    private readonly txRepo: Repository<WalletTransactionEntity>,
  ) {}

  // ─────────────── Settlement entries ───────────────

  async insertEntries(
    entries: Partial<SettlementEntryEntity>[],
  ): Promise<SettlementEntryEntity[]> {
    return this.entryRepo.save(entries as SettlementEntryEntity[]);
  }

  async findEntriesByOrderId(
    orderId: string,
  ): Promise<SettlementEntryEntity[]> {
    return this.entryRepo.find({ where: { orderId } });
  }

  async findPendingByPeriod(
    start: Date,
    end: Date,
  ): Promise<SettlementEntryEntity[]> {
    return this.entryRepo
      .createQueryBuilder("e")
      .where("e.status = :status", { status: "PENDING" })
      .andWhere('COALESCE(e."deliveredAt", e."createdAt") >= :start', { start })
      .andWhere('COALESCE(e."deliveredAt", e."createdAt") < :end', { end })
      .orderBy('e."createdAt"', "ASC")
      .getMany();
  }

  async markEntriesSettled(ids: string[], batchId: string): Promise<void> {
    if (!ids.length) return;
    await this.entryRepo
      .createQueryBuilder()
      .update(SettlementEntryEntity)
      .set({ status: "SETTLED", settlementBatchId: batchId })
      .whereInIds(ids)
      .execute();
  }

  async findPendingForOwner(
    ownerId: string,
    ownerType: string,
  ): Promise<SettlementEntryEntity[]> {
    return this.entryRepo.find({
      where: { ownerId, ownerType, status: "PENDING" },
      order: { createdAt: "ASC" },
    });
  }

  // ─────────────── Settlement batches ───────────────

  async saveBatch(
    batch: Partial<SettlementBatchEntity>,
  ): Promise<SettlementBatchEntity> {
    return this.batchRepo.save(batch as SettlementBatchEntity);
  }

  async findBatchByPeriod(
    start: Date,
    end: Date,
  ): Promise<SettlementBatchEntity | null> {
    return this.batchRepo.findOne({
      where: { periodStart: start, periodEnd: end },
    });
  }

  async findBatchById(id: string): Promise<SettlementBatchEntity | null> {
    return this.batchRepo.findOne({ where: { id } });
  }

  async listBatches(
    from?: Date,
    to?: Date,
    status?: string,
  ): Promise<SettlementBatchEntity[]> {
    const qb = this.batchRepo.createQueryBuilder("b");
    if (from) qb.andWhere('b."periodStart" >= :from', { from });
    if (to) qb.andWhere('b."periodEnd" <= :to', { to });
    if (status) qb.andWhere("b.status = :status", { status });
    qb.orderBy('b."periodStart"', "DESC");
    return qb.getMany();
  }

  // ─────────────── Clawback ───────────────

  async createClawback(
    data: Partial<ClawbackLiabilityEntity>,
  ): Promise<ClawbackLiabilityEntity> {
    return this.clawbackRepo.save(data as ClawbackLiabilityEntity);
  }

  async findOpenClawbacks(
    ownerId: string,
    ownerType: string,
  ): Promise<ClawbackLiabilityEntity[]> {
    return this.clawbackRepo
      .createQueryBuilder("c")
      .where('c."ownerId" = :ownerId', { ownerId })
      .andWhere('c."ownerType" = :ownerType', { ownerType })
      .andWhere("c.status IN (:...status)", { status: ["OPEN", "PARTIAL"] })
      .andWhere('c."remainingAmount" > 0')
      .orderBy('c."createdAt"', "ASC")
      .getMany();
  }

  async sumOpenClawback(ownerId: string, ownerType: string): Promise<number> {
    const row = await this.clawbackRepo
      .createQueryBuilder("c")
      .select('COALESCE(SUM(c."remainingAmount"), 0)', "total")
      .where('c."ownerId" = :ownerId', { ownerId })
      .andWhere('c."ownerType" = :ownerType', { ownerType })
      .andWhere("c.status IN (:...status)", { status: ["OPEN", "PARTIAL"] })
      .getRawOne();
    return Number(row?.total) || 0;
  }

  async recordDeduction(
    data: Partial<ClawbackDeductionEntity>,
  ): Promise<ClawbackDeductionEntity> {
    return this.deductionRepo.save(data as ClawbackDeductionEntity);
  }

  async reduceClawback(id: string, amount: number): Promise<void> {
    const c = await this.clawbackRepo.findOne({ where: { id } });
    if (!c) return;
    c.remainingAmount = Math.max(0, Number(c.remainingAmount) - amount);
    c.status = Number(c.remainingAmount) === 0 ? "SETTLED" : "PARTIAL";
    await this.clawbackRepo.save(c);
  }

  // ─────────────── Idempotency check ───────────────

  async hasSettlementCredit(
    ownerId: string,
    ownerType: string,
    referenceId: string,
  ): Promise<boolean> {
    const count = await this.txRepo.count({
      where: {
        ownerId,
        ownerType,
        referenceType: "SETTLEMENT",
        referenceId,
      },
    });
    return count > 0;
  }
}
