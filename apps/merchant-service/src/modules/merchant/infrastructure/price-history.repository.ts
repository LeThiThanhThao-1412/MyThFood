import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository as TypeOrmRepo } from "typeorm";
import { PriceHistoryEntity, PriceHistoryStatus } from "./price-history.entity";
import { PriceAlertEntity } from "./price-alert.entity";

export interface PriceHistoryFilters {
  menuItemId?: string;
  changedBy?: string;
  from?: Date;
  to?: Date;
  skip?: number;
  take?: number;
}

@Injectable()
export class PriceHistoryRepository {
  constructor(
    @InjectRepository(PriceHistoryEntity)
    private readonly historyRepo: TypeOrmRepo<PriceHistoryEntity>,
    @InjectRepository(PriceAlertEntity)
    private readonly alertRepo: TypeOrmRepo<PriceAlertEntity>,
  ) {}

  async save(history: PriceHistoryEntity): Promise<PriceHistoryEntity> {
    return this.historyRepo.save(history);
  }

  async findById(id: string): Promise<PriceHistoryEntity | null> {
    return this.historyRepo.findOne({ where: { id } });
  }

  async updateStatus(
    id: string,
    status: PriceHistoryStatus,
  ): Promise<PriceHistoryEntity | null> {
    const entity = await this.findById(id);
    if (!entity) return null;
    entity.status = status;
    return this.historyRepo.save(entity);
  }

  async findByMerchant(
    merchantId: string,
    filters: PriceHistoryFilters = {},
  ): Promise<{ items: PriceHistoryEntity[]; total: number }> {
    const qb = this.historyRepo
      .createQueryBuilder("ph")
      .where("ph.merchant_id = :merchantId", { merchantId });

    if (filters.menuItemId) {
      qb.andWhere("ph.menu_item_id = :menuItemId", {
        menuItemId: filters.menuItemId,
      });
    }
    if (filters.changedBy) {
      qb.andWhere("ph.changed_by = :changedBy", {
        changedBy: filters.changedBy,
      });
    }
    if (filters.from) {
      qb.andWhere("ph.created_at >= :from", { from: filters.from });
    }
    if (filters.to) {
      qb.andWhere("ph.created_at <= :to", { to: filters.to });
    }

    const [items, total] = await qb
      .orderBy("ph.created_at", "DESC")
      .skip(filters.skip ?? 0)
      .take(filters.take ?? 50)
      .getManyAndCount();

    return { items, total };
  }

  /** Lấy bản ghi giá gần nhất trước một thời điểm của một món (để so sánh giá). */
  async findNearestBefore(
    merchantId: string,
    menuItemId: string,
    at: Date,
  ): Promise<PriceHistoryEntity | null> {
    return this.historyRepo
      .createQueryBuilder("ph")
      .where("ph.merchant_id = :merchantId", { merchantId })
      .andWhere("ph.menu_item_id = :menuItemId", { menuItemId })
      .andWhere("ph.created_at <= :at", { at })
      .orderBy("ph.created_at", "DESC")
      .getOne();
  }

  /** Tổng hợp biến động giá trong một khoảng thời gian (cho báo cáo). */
  async getFluctuationStats(
    merchantId: string,
    from?: Date,
    to?: Date,
  ): Promise<{
    totalChanges: number;
    flaggedCount: number;
    avgChangePercent: number;
    maxChangePercent: number;
  }> {
    const qb = this.historyRepo
      .createQueryBuilder("ph")
      .where("ph.merchant_id = :merchantId", { merchantId });
    if (from) qb.andWhere("ph.created_at >= :from", { from });
    if (to) qb.andWhere("ph.created_at <= :to", { to });

    const rows = await qb.getMany();
    const totalChanges = rows.length;
    const flaggedCount = rows.filter((r) => r.status === "FLAGGED").length;
    const changes = rows.map((r) => {
      const old = Number(r.old_price);
      const next = Number(r.new_price);
      if (old === 0) return 0;
      return ((next - old) / old) * 100;
    });
    const avgChangePercent =
      changes.length > 0
        ? changes.reduce((a, b) => a + b, 0) / changes.length
        : 0;
    const maxChangePercent =
      changes.length > 0 ? Math.max(...changes.map((c) => Math.abs(c))) : 0;
    return { totalChanges, flaggedCount, avgChangePercent, maxChangePercent };
  }

  // ---- Price Alerts ----

  async saveAlert(alert: PriceAlertEntity): Promise<PriceAlertEntity> {
    return this.alertRepo.save(alert);
  }

  async findAlertsByMerchant(
    merchantId: string,
    skip = 0,
    take = 50,
  ): Promise<{ items: PriceAlertEntity[]; total: number }> {
    const [items, total] = await this.alertRepo.findAndCount({
      where: { merchant_id: merchantId },
      order: { created_at: "DESC" },
      skip,
      take,
    });
    return { items, total };
  }
}
