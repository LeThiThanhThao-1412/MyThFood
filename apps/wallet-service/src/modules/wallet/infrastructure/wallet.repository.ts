import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, In, Repository } from "typeorm";
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

  async findByOwnerOrCreate(
    ownerId: string,
    ownerType: string,
  ): Promise<{
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

  /** Chỉ đọc ví — không tạo mới (dùng cho endpoint tra cứu). */
  async findByOwner(
    ownerId: string,
    ownerType: string,
  ): Promise<WalletEntity | null> {
    return this.walletRepo.findOne({ where: { ownerId, ownerType } });
  }

  async recordTransaction(params: {
    id: string;
    walletId: string;
    ownerId: string;
    ownerType: string;
    type: string;
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

  async getTransactions(
    ownerId: string,
    ownerType: string,
  ): Promise<WalletTransactionEntity[]> {
    return this.txRepo.find({
      where: { ownerId, ownerType },
      order: { createdAt: "DESC" },
      take: 50,
    });
  }

  async findTransactionsByType(
    ownerId: string,
    referenceType: string,
  ): Promise<WalletTransactionEntity[]> {
    return this.txRepo.find({
      where: { ownerId, referenceType },
      order: { createdAt: "DESC" },
    });
  }

  /** Tìm giao dịch theo reference để đảm bảo idempotency (vd điều chỉnh đơn). */
  async findTransactionByReference(
    referenceType: string,
    referenceId: string,
  ): Promise<WalletTransactionEntity | null> {
    return this.txRepo.findOne({
      where: { referenceType, referenceId },
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Idempotency theo (owner, referenceType, referenceId) — dùng cho các bút
   * toán mà nhiều bên cùng tham chiếu một reference (vd phạt đơn #X: bên bị
   * phạt và quỹ nền tảng).
   */
  async findTransactionByOwnerReference(
    ownerId: string,
    ownerType: string,
    referenceType: string,
    referenceId: string,
  ): Promise<WalletTransactionEntity | null> {
    return this.txRepo.findOne({
      where: { ownerId, ownerType, referenceType, referenceId },
      order: { createdAt: "DESC" },
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
    if (params.ownerType)
      qb.andWhere("tx.ownerType = :ownerType", { ownerType: params.ownerType });
    if (params.type)
      qb.andWhere("tx.referenceType = :type", { type: params.type });
    if (params.startDate)
      qb.andWhere("tx.createdAt >= :startDate", {
        startDate: params.startDate,
      });
    if (params.endDate)
      qb.andWhere("tx.createdAt <= :endDate", { endDate: params.endDate });
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

  async getStatsSummary(
    startDate?: string,
    endDate?: string,
  ): Promise<{
    totalTopupVolume: number;
    totalWithdrawVolume: number;
    totalSettlementVolume: number;
    totalCodVolume: number;
  }> {
    const statsQb = this.txRepo.createQueryBuilder("tx");
    if (startDate)
      statsQb.andWhere("tx.createdAt >= :startDate", { startDate });
    if (endDate) statsQb.andWhere("tx.createdAt <= :endDate", { endDate });
    const stats = await statsQb
      .select("tx.type", "txType")
      .addSelect("tx.referenceType", "refType")
      .addSelect("SUM(tx.amount)", "total")
      .groupBy("tx.type")
      .addGroupBy("tx.referenceType")
      .getRawMany();
    let totalTopupVolume = 0;
    let totalWithdrawVolume = 0;
    let totalSettlementVolume = 0;
    let totalCodVolume = 0;
    for (const row of stats) {
      const amount = Math.abs(Number(row.total) || 0);
      const txType = row.txType;
      const refType = row.refType;
      if (refType === "TOPUP" && txType === "CREDIT") {
        totalTopupVolume += amount;
      }
      if (refType === "WITHDRAW") {
        totalWithdrawVolume += amount;
      }
      if (refType === "COD_SETTLEMENT" && txType === "CREDIT") {
        totalCodVolume += amount;
      }
      if (
        (refType === "SETTLEMENT" || refType === "COD_SETTLEMENT") &&
        txType === "CREDIT"
      ) {
        totalSettlementVolume += amount;
      }
    }
    return {
      totalTopupVolume,
      totalWithdrawVolume,
      totalSettlementVolume,
      totalCodVolume,
    };
  }

  async getEarningsByOwner(
    ownerId: string,
    ownerType: string,
    startDate?: string,
    endDate?: string,
  ): Promise<{
    totalEarnings: number;
    totalOrders: number;
    earningsByDay: any[];
  }> {
    const where: Record<string, unknown> = {
      ownerId,
      ownerType,
      referenceType: "SETTLEMENT",
      type: In(["CREDIT", "REVENUE"]),
    };
    if (startDate || endDate) {
      const from = startDate ? new Date(startDate) : new Date(0);
      const to = endDate ? new Date(endDate) : new Date(8640000000000000);
      where["createdAt"] = Between(from, to);
    }

    const txs = await this.txRepo.find({ where, order: { createdAt: "ASC" } });

    const byDay = new Map<
      string,
      { earnings: number; orderIds: Set<string> }
    >();
    for (const tx of txs) {
      const date = tx.createdAt.toISOString().slice(0, 10);
      const bucket = byDay.get(date) ?? {
        earnings: 0,
        orderIds: new Set<string>(),
      };
      bucket.earnings += Number(tx.amount);
      if (tx.referenceId) bucket.orderIds.add(tx.referenceId);
      byDay.set(date, bucket);
    }

    const earningsByDay = [...byDay.entries()]
      .map(([date, b]) => ({
        date,
        earnings: b.earnings,
        orders: b.orderIds.size,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalEarnings = earningsByDay.reduce((s, d) => s + d.earnings, 0);
    const totalOrders = earningsByDay.reduce((s, d) => s + d.orders, 0);

    return { totalEarnings, totalOrders, earningsByDay };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Sổ ví nền tảng / ví tài xế (admin-portal → trang "Ví nền tảng")
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Tổng tiền + bảng theo `referenceType` của **một nhóm ví** (ví nền tảng +
   * quỹ dự phòng, hoặc ví của một tài xế).
   *
   * Vì sao gộp theo `referenceType`: một con số "tổng thu" không nói được tiền
   * đến từ đâu (hoa hồng, phạt, thu nợ, seed…). Admin cần thấy từng nguồn để
   * đối soát với sổ quyết toán.
   */
  async sumTransactionsByReference(params: {
    ownerIds: string[];
    type: string;
    from?: string;
    to?: string;
  }): Promise<{
    total: number;
    count: number;
    rows: { referenceType: string; count: number; total: number }[];
  }> {
    if (!Array.isArray(params.ownerIds) || params.ownerIds.length === 0) {
      return { total: 0, count: 0, rows: [] };
    }

    const qb = this.txRepo
      .createQueryBuilder("tx")
      .select(
        `COALESCE(tx."referenceType", 'UNCATEGORIZED')`,
        "referenceType",
      )
      .addSelect("COUNT(*)", "count")
      .addSelect("COALESCE(SUM(tx.amount), 0)", "total")
      .where("tx.type = :type", { type: params.type })
      .andWhere("tx.ownerId IN (:...ownerIds)", { ownerIds: params.ownerIds });
    if (params.from)
      qb.andWhere("tx.createdAt >= :from", { from: params.from });
    if (params.to) qb.andWhere("tx.createdAt <= :to", { to: params.to });

    const raw = await qb.groupBy("tx.referenceType").getRawMany();
    const rows = raw
      .map((r) => ({
        referenceType: String(r.referenceType || "UNCATEGORIZED"),
        count: Number(r.count) || 0,
        total: Number(r.total) || 0,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      total: rows.reduce((s, r) => s + r.total, 0),
      count: rows.reduce((s, r) => s + r.count, 0),
      rows,
    };
  }

  /** Giao dịch mới nhất của một nhóm ví (ví nền tảng + quỹ dự phòng). */
  async findTransactionsForOwners(params: {
    ownerIds: string[];
    type?: string;
    from?: string;
    to?: string;
    take: number;
  }): Promise<WalletTransactionEntity[]> {
    if (!Array.isArray(params.ownerIds) || params.ownerIds.length === 0) {
      return [];
    }

    const qb = this.txRepo
      .createQueryBuilder("tx")
      .where("tx.ownerId IN (:...ownerIds)", { ownerIds: params.ownerIds });
    if (params.type) qb.andWhere("tx.type = :type", { type: params.type });
    if (params.from)
      qb.andWhere("tx.createdAt >= :from", { from: params.from });
    if (params.to) qb.andWhere("tx.createdAt <= :to", { to: params.to });

    return qb
      .orderBy("tx.createdAt", "DESC")
      .take(Math.min(Math.max(1, params.take), 1000))
      .getMany();
  }

  /**
   * Giao dịch của **mọi chủ ví** theo `referenceType` — dùng cho sổ thu nợ
   * (`DEBIT CLAWBACK_RECOVERY` ở ví bên nợ, `CREDIT DEBT_RECOVERY` ở ví nền tảng).
   */
  async findTransactionsByReferenceType(params: {
    referenceType: string;
    type?: string;
    from?: string;
    to?: string;
    take: number;
  }): Promise<WalletTransactionEntity[]> {
    const qb = this.txRepo
      .createQueryBuilder("tx")
      .where("tx.referenceType = :referenceType", {
        referenceType: params.referenceType,
      });
    if (params.type) qb.andWhere("tx.type = :type", { type: params.type });
    if (params.from)
      qb.andWhere("tx.createdAt >= :from", { from: params.from });
    if (params.to) qb.andWhere("tx.createdAt <= :to", { to: params.to });

    return qb
      .orderBy("tx.createdAt", "DESC")
      .take(Math.min(Math.max(1, params.take), 1000))
      .getMany();
  }

  /**
   * Sổ thu chi ví tài xế: danh sách giao dịch + tổng theo loại + tổng theo
   * từng tài xế (để admin thấy ngay ai đang bị trừ nhiều nhất).
   */
  async getDriverLedger(params: {
    ownerId?: string;
    type?: string;
    search?: string;
    from?: string;
    to?: string;
    take: number;
  }): Promise<{
    items: WalletTransactionEntity[];
    totals: { credit: number; debit: number; revenue: number; count: number };
    byDriver: {
      ownerId: string;
      credit: number;
      debit: number;
      revenue: number;
      count: number;
    }[];
  }> {
    const scoped = () => {
      const qb = this.txRepo
        .createQueryBuilder("tx")
        .where("tx.ownerType = :ownerType", { ownerType: "DRIVER" });
      if (params.ownerId)
        qb.andWhere("tx.ownerId = :ownerId", { ownerId: params.ownerId });
      if (params.type) qb.andWhere("tx.type = :type", { type: params.type });
      if (params.search)
        qb.andWhere("tx.description ILIKE :search", {
          search: `%${params.search}%`,
        });
      if (params.from)
        qb.andWhere("tx.createdAt >= :from", { from: params.from });
      if (params.to) qb.andWhere("tx.createdAt <= :to", { to: params.to });
      return qb;
    };

    const items = await scoped()
      .orderBy("tx.createdAt", "DESC")
      .take(Math.min(Math.max(1, params.take), 1000))
      .getMany();

    const byType = await scoped()
      .select("tx.type", "txType")
      .addSelect("COALESCE(SUM(tx.amount), 0)", "total")
      .addSelect("COUNT(*)", "count")
      .groupBy("tx.type")
      .getRawMany();

    const totals = { credit: 0, debit: 0, revenue: 0, count: 0 };
    for (const row of byType) {
      const total = Number(row.total) || 0;
      const count = Number(row.count) || 0;
      const kind = String(row.txType || "").toUpperCase();
      if (kind === "CREDIT") totals.credit += total;
      else if (kind === "REVENUE") totals.revenue += total;
      else totals.debit += total;
      totals.count += count;
    }

    const perDriver = await scoped()
      .select("tx.ownerId", "ownerId")
      .addSelect("tx.type", "txType")
      .addSelect("COALESCE(SUM(tx.amount), 0)", "total")
      .addSelect("COUNT(*)", "count")
      .groupBy("tx.ownerId")
      .addGroupBy("tx.type")
      .getRawMany();

    const driverMap = new Map<
      string,
      { credit: number; debit: number; revenue: number; count: number }
    >();
    for (const row of perDriver) {
      const ownerId = String(row.ownerId || "");
      if (!ownerId) continue;
      const acc = driverMap.get(ownerId) ?? {
        credit: 0,
        debit: 0,
        revenue: 0,
        count: 0,
      };
      const total = Number(row.total) || 0;
      const kind = String(row.txType || "").toUpperCase();
      if (kind === "CREDIT") acc.credit += total;
      else if (kind === "REVENUE") acc.revenue += total;
      else acc.debit += total;
      acc.count += Number(row.count) || 0;
      driverMap.set(ownerId, acc);
    }

    const byDriver = [...driverMap.entries()]
      .map(([ownerId, v]) => ({ ownerId, ...v }))
      .sort((a, b) => b.revenue + b.debit - (a.revenue + a.debit));

    return { items, totals, byDriver };
  }

  toDomain(entity: WalletEntity): Wallet {
    return Wallet.create({
      id: entity.id,
      ownerId: entity.ownerId,
      ownerType: entity.ownerType,
      balance: Number(entity.balance),
      heldBalance: Number(entity.heldBalance || 0),
      currency: entity.currency,
    });
  }
}
