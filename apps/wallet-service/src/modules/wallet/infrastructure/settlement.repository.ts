import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SettlementEntryEntity } from "./settlement-entry.entity";
import { SettlementBatchEntity } from "./settlement-batch.entity";
import { ClawbackLiabilityEntity } from "./clawback-liability.entity";
import { ClawbackDeductionEntity } from "./clawback-deduction.entity";
import { WalletTransactionEntity } from "./wallet-transaction.entity";
import { FailureSettlementEntity } from "./failure-settlement.entity";

/** Dấu vết case ghi lên dòng escrow khi giữ / mở khoá doanh thu. */
export interface SettlementEntryStamp {
  /** Vụ việc đã gây ra việc giữ/mở khoá. */
  caseId?: string | null;
  /** Mốc quyết toán — 23:00 của ngày phán quyết. */
  settleOn?: Date | null;
}

@Injectable()
export class SettlementRepository {
  private readonly logger = new Logger(SettlementRepository.name);

  /**
   * Dấu vết vụ việc ghi lên dòng escrow khi giữ / mở khoá.
   *
   * `settleOn` = mốc 23:00 của **ngày case được giải quyết**. Nhờ đó dòng doanh
   * thu bị giữ lâu ngày vẫn được quyết toán đúng ngày phán quyết, kể cả khi lô
   * chạy tay/dry-run lọc theo `settleOn` thay vì `deliveredAt` đã cũ.
   */
  static stampPatch(
    stamp?: SettlementEntryStamp,
  ): Partial<SettlementEntryEntity> {
    const patch: Partial<SettlementEntryEntity> = {};
    if (stamp?.caseId) patch.caseId = stamp.caseId;
    if (stamp?.settleOn) patch.settleOn = stamp.settleOn;
    return patch;
  }

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
    @InjectRepository(FailureSettlementEntity)
    private readonly failureRepo: Repository<FailureSettlementEntity>,
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

  async holdByOrderId(
    orderId: string,
    stamp?: SettlementEntryStamp,
  ): Promise<number> {
    const res = await this.entryRepo
      .createQueryBuilder()
      .update(SettlementEntryEntity)
      .set({
        status: "HELD_BY_DISPUTE",
        ...SettlementRepository.stampPatch(stamp),
      })
      .where('"orderId" = :orderId AND "status" = :status', {
        orderId,
        status: "PENDING",
      })
      .execute();
    return res.affected ?? 0;
  }

  /**
   * Mở khoá doanh thu (HELD_BY_DISPUTE → PENDING) và đóng dấu ngày quyết toán.
   *
   * `settleOn` mặc định = thời điểm mở khoá (chính là ngày phán quyết): dòng
   * tiền được tính vào lô 23:00 của ngày đó thay vì mãi mãi nằm ngoài cửa sổ
   * `deliveredAt` cũ.
   */
  async releaseByOrderId(
    orderId: string,
    stamp?: SettlementEntryStamp,
  ): Promise<number> {
    const res = await this.entryRepo
      .createQueryBuilder()
      .update(SettlementEntryEntity)
      .set({
        status: "PENDING",
        ...SettlementRepository.stampPatch({
          caseId: stamp?.caseId,
          settleOn: stamp?.settleOn ?? new Date(),
        }),
      })
      .where('"orderId" = :orderId AND "status" = :status', {
        orderId,
        status: "HELD_BY_DISPUTE",
      })
      .execute();
    return res.affected ?? 0;
  }

  /**
   * VOID các dòng doanh thu đã bị phán quyết thay thế: nhà hàng/tài xế đã được
   * hoàn hoặc bồi thường trực tiếp qua ví nên dòng escrow cũ không còn giá trị.
   *
   * Dòng VOID không bao giờ được quyết toán ⇒ vừa không treo HELD_BY_DISPUTE
   * vĩnh viễn, vừa không trả tiền hai lần cho cùng một khoản.
   */
  async voidEntriesByOrderId(
    orderId: string,
    kinds: string[],
    stamp?: SettlementEntryStamp,
  ): Promise<number> {
    if (!kinds.length) return 0;
    const res = await this.entryRepo
      .createQueryBuilder()
      .update(SettlementEntryEntity)
      .set({ status: "VOID", ...SettlementRepository.stampPatch(stamp) })
      .where('"orderId" = :orderId', { orderId })
      .andWhere('"kind" IN (:...kinds)', { kinds })
      .andWhere('"status" IN (:...statuses)', {
        statuses: ["PENDING", "HELD_BY_DISPUTE"],
      })
      .execute();
    return res.affected ?? 0;
  }

  /**
   * Giải tỏa các dòng vẫn còn hiệu lực sau phán quyết VALID (hoa hồng nền tảng,
   * trích quỹ dự phòng) để cron 23:00 quyết toán bình thường.
   */
  async releaseEntriesByOrderId(
    orderId: string,
    kinds: string[],
    stamp?: SettlementEntryStamp,
  ): Promise<number> {
    if (!kinds.length) return 0;
    const res = await this.entryRepo
      .createQueryBuilder()
      .update(SettlementEntryEntity)
      .set({
        status: "PENDING",
        ...SettlementRepository.stampPatch({
          caseId: stamp?.caseId,
          settleOn: stamp?.settleOn ?? new Date(),
        }),
      })
      .where('"orderId" = :orderId', { orderId })
      .andWhere('"kind" IN (:...kinds)', { kinds })
      .andWhere('"status" = :status', { status: "HELD_BY_DISPUTE" })
      .execute();
    return res.affected ?? 0;
  }

  // ─────────────── Failure settlement ledger (idempotency) ───────────────

  async findFailureSettlement(
    orderId: string,
  ): Promise<FailureSettlementEntity | null> {
    return this.failureRepo.findOne({ where: { orderId } });
  }

  /**
   * Giành quyền settle cho đơn. Trả về `true` nếu lần gọi này là lần đầu tiên
   * (insert thành công), `false` nếu đơn đã được settle trước đó.
   * ON CONFLICT DO NOTHING ở mức PRIMARY KEY ⇒ an toàn cả khi có request đồng thời.
   */
  async claimFailureSettlement(
    data: Partial<FailureSettlementEntity>,
  ): Promise<boolean> {
    const res = await this.failureRepo
      .createQueryBuilder()
      .insert()
      .into(FailureSettlementEntity)
      .values(data as FailureSettlementEntity)
      .orIgnore()
      .returning('"orderId"')
      .execute();
    return Array.isArray(res.raw) && res.raw.length > 0;
  }

  async completeFailureSettlement(
    orderId: string,
    patch: Partial<FailureSettlementEntity>,
  ): Promise<void> {
    await this.failureRepo.update({ orderId }, patch);
  }

  /**
   * Xoá claim khi route tiền lỗi giữa đường, để lần gọi sau (admin retry hoặc
   * cron đối soát) có thể settle lại. Bút toán đã ghi vẫn idempotent theo
   * reference nên không sinh tiền trùng.
   */
  async releaseFailureSettlementClaim(
    orderId: string,
    reason: string,
  ): Promise<void> {
    this.logger.warn(
      `Release claim settle failure đơn ${orderId} để retry: ${reason}`,
    );
    await this.failureRepo.delete({ orderId });
  }

  async findPendingByPeriod(
    start: Date,
    end: Date,
  ): Promise<SettlementEntryEntity[]> {
    return (
      this.entryRepo
        .createQueryBuilder("e")
        .where("e.status = :status", { status: "PENDING" })
        // Dòng bị giữ vì khiếu nại mang `settleOn` = ngày phán quyết ⇒ được quyết
        // toán đúng ngày đó, dù `deliveredAt` đã cũ hơn cửa sổ rất nhiều.
        .andWhere(
          'COALESCE(e."settleOn", e."deliveredAt", e."createdAt") >= :start',
          { start },
        )
        .andWhere(
          'COALESCE(e."settleOn", e."deliveredAt", e."createdAt") < :end',
          { end },
        )
        .orderBy('e."createdAt"', "ASC")
        .getMany()
    );
  }

  /**
   * Lấy TẤT CẢ các dòng PENDING (không giới hạn theo cửa sổ deliveredAt).
   * Dùng cho cron quyết toán 23:00 để các dòng vừa được giải tỏa
   * (HELD_BY_DISPUTE → PENDING sau phán quyết INVALID / rút đơn) không bị
   * kẹt vì deliveredAt cũ nằm ngoài cửa sổ quyết toán hiện tại.
   */
  async findAllPending(): Promise<SettlementEntryEntity[]> {
    return this.entryRepo.find({
      where: { status: "PENDING" },
      order: { createdAt: "ASC" },
    });
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

  /**
   * Trừ nợ **nguyên tử**: chỉ trừ khi khoản nợ còn đủ số tiền cần trừ.
   *
   * `UPDATE ... WHERE "remainingAmount" >= take` là điểm chống double-spend:
   * hai luồng khấu trừ đồng thời (credit + cron quét) không thể cùng trừ một
   * khoản nợ quá số còn lại. Nhờ vậy tiền trong ví không bị trừ hai lần.
   *
   * @returns số nợ còn lại sau khi trừ, hoặc `null` nếu không trừ được
   *          (khoản nợ đã đóng / phần còn lại nhỏ hơn `amount`).
   */
  async reduceClawback(id: string, amount: number): Promise<number | null> {
    const take = Math.round(Number(amount) || 0);
    if (take <= 0) return null;

    const res = await this.clawbackRepo
      .createQueryBuilder()
      .update(ClawbackLiabilityEntity)
      .set({
        remainingAmount: () => `"remainingAmount" - ${take}`,
        status: () =>
          `CASE WHEN "remainingAmount" - ${take} <= 0 THEN 'SETTLED' ELSE 'PARTIAL' END`,
        settledAt: () =>
          `CASE WHEN "remainingAmount" - ${take} <= 0 THEN NOW() ELSE "settledAt" END`,
      })
      .where('"id" = :id AND "remainingAmount" >= :take', { id, take })
      .returning('"remainingAmount"')
      .execute();

    if (!res.affected) return null;
    const raw = Array.isArray(res.raw) ? res.raw[0] : null;
    if (raw && raw.remainingAmount !== undefined) {
      return Number(raw.remainingAmount);
    }
    const updated = await this.clawbackRepo.findOne({ where: { id } });
    return updated ? Number(updated.remainingAmount) : 0;
  }

  /**
   * Danh sách chủ ví đang có nợ (OPEN/PARTIAL) kèm tổng nợ — nguồn cho cron
   * quét 30 phút để thu hồi các khoản nợ mà ví đã đủ tiền.
   */
  async listOpenDebtOwners(
    limit = 200,
  ): Promise<{ ownerId: string; ownerType: string; total: number }[]> {
    const rows = await this.clawbackRepo
      .createQueryBuilder("c")
      .select('c."ownerId"', "ownerId")
      .addSelect('c."ownerType"', "ownerType")
      .addSelect('SUM(c."remainingAmount")', "total")
      .where("c.status IN (:...status)", { status: ["OPEN", "PARTIAL"] })
      .andWhere('c."remainingAmount" > 0')
      .groupBy('c."ownerId"')
      .addGroupBy('c."ownerType"')
      .orderBy('MIN(c."createdAt")', "ASC")
      .limit(Math.max(1, Math.round(Number(limit) || 200)))
      .getRawMany();
    return rows.map((r) => ({
      ownerId: r.ownerId,
      ownerType: r.ownerType,
      total: Number(r.total) || 0,
    }));
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
