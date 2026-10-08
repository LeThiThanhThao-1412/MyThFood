import { Injectable, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { v4 as uuidv4 } from "uuid";
import { DataSource, IsNull, Repository as TypeOrmRepo } from "typeorm";
import {
  PromotionEntity,
  PromotionUsageEntity,
  CompensationConfigEntity,
  CompensationVoucherEntity,
  FlashSaleEntity,
  FlashSaleItemEntity,
  FlashSaleUsageEntity,
  COMPENSATION_CONFIG_ID,
} from "./promotion.entity";

@Injectable()
export class PromotionRepository {
  constructor(
    @InjectRepository(PromotionEntity)
    private readonly promoRepo: TypeOrmRepo<PromotionEntity>,
    @InjectRepository(PromotionUsageEntity)
    private readonly usageRepo: TypeOrmRepo<PromotionUsageEntity>,
    @InjectRepository(CompensationConfigEntity)
    private readonly configRepo: TypeOrmRepo<CompensationConfigEntity>,
    @InjectRepository(CompensationVoucherEntity)
    private readonly voucherRepo: TypeOrmRepo<CompensationVoucherEntity>,
    @InjectRepository(FlashSaleEntity)
    private readonly flashSaleRepo: TypeOrmRepo<FlashSaleEntity>,
    @InjectRepository(FlashSaleItemEntity)
    private readonly flashSaleItemRepo: TypeOrmRepo<FlashSaleItemEntity>,
    @InjectRepository(FlashSaleUsageEntity)
    private readonly flashSaleUsageRepo: TypeOrmRepo<FlashSaleUsageEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async savePromotion(promo: PromotionEntity): Promise<PromotionEntity> {
    return this.promoRepo.save(promo);
  }

  async findByCode(code: string): Promise<PromotionEntity | null> {
    return this.promoRepo.findOne({ where: { code: code.toUpperCase() } });
  }

  async findById(id: string): Promise<PromotionEntity | null> {
    return this.promoRepo.findOne({ where: { id } });
  }

  async findByMerchantId(merchantId: string): Promise<PromotionEntity[]> {
    return this.promoRepo.find({
      where: { merchantId },
      order: { createdAt: "DESC" },
    });
  }

  async findAll(filter: {
    merchantId?: string;
    isActive?: boolean;
    skip?: number;
    take?: number;
  }): Promise<{ items: PromotionEntity[]; total: number }> {
    const qb = this.promoRepo
      .createQueryBuilder("p")
      .orderBy("p.createdAt", "DESC");
    if (filter.merchantId) {
      qb.andWhere("p.merchantId = :merchantId", {
        merchantId: filter.merchantId,
      });
    }
    if (filter.isActive !== undefined) {
      qb.andWhere("p.isActive = :isActive", { isActive: filter.isActive });
    }
    qb.skip(filter.skip ?? 0).take(filter.take ?? 50);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async countUsagesByUser(
    promotionId: string,
    consumerId: string,
  ): Promise<number> {
    return this.usageRepo.count({ where: { promotionId, consumerId } });
  }

  async findUsageByOrderId(
    orderId: string,
  ): Promise<PromotionUsageEntity | null> {
    return this.usageRepo.findOne({ where: { orderId } });
  }

  async saveUsage(usage: PromotionUsageEntity): Promise<PromotionUsageEntity> {
    return this.usageRepo.save(usage);
  }

  /**
   * Ghi nhận usage + tăng usedCount một cách nguyên tử.
   * Khóa dòng promotion (pessimistic_write) để tránh race-condition,
   * đồng thời re-check các điều kiện "đếm được" trong transaction.
   */
  async applyAtomic(
    promotionId: string,
    usage: PromotionUsageEntity,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const promo = await manager.findOne(PromotionEntity, {
        where: { id: promotionId },
        lock: { mode: "pessimistic_write" },
      });
      if (!promo) {
        throw new BadRequestException("Mã khuyến mãi không hợp lệ");
      }
      if (!promo.isActive) {
        throw new BadRequestException("Mã khuyến mãi đã bị vô hiệu hóa");
      }
      if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) {
        throw new BadRequestException("Mã đã hết lượt sử dụng");
      }
      if (promo.usageLimitPerUser != null) {
        const usedByUser = await manager.count(PromotionUsageEntity, {
          where: { promotionId, consumerId: usage.consumerId },
        });
        if (usedByUser >= promo.usageLimitPerUser) {
          throw new BadRequestException("Bạn đã hết lượt dùng mã này");
        }
      }

      await manager.save(usage);
      promo.usedCount = (promo.usedCount ?? 0) + 1;
      await manager.save(promo);
    });
  }

  async deletePromotion(promo: PromotionEntity): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(PromotionUsageEntity, { promotionId: promo.id });
      await manager.delete(PromotionEntity, { id: promo.id });
    });
  }

  async statsByPromotion(promotionId: string): Promise<{
    usedCount: number;
    totalDiscount: number;
    totalOrders: number;
  }> {
    const promo = await this.promoRepo.findOne({ where: { id: promotionId } });
    const rows = await this.usageRepo
      .createQueryBuilder("u")
      .select("COALESCE(SUM(u.discountAmount), 0)", "totalDiscount")
      .addSelect("COUNT(*)", "totalOrders")
      .where("u.promotionId = :promotionId", { promotionId })
      .getRawOne();
    return {
      usedCount: Number(promo?.usedCount ?? 0),
      totalDiscount: Number(rows?.totalDiscount ?? 0),
      totalOrders: Number(rows?.totalOrders ?? 0),
    };
  }

  async statsByMerchant(merchantId: string): Promise<{
    totalPromotions: number;
    activePromotions: number;
    totalUsedCount: number;
    totalDiscount: number;
    totalOrders: number;
  }> {
    const promos = await this.findByMerchantId(merchantId);
    if (promos.length === 0) {
      return {
        totalPromotions: 0,
        activePromotions: 0,
        totalUsedCount: 0,
        totalDiscount: 0,
        totalOrders: 0,
      };
    }
    const ids = promos.map((p) => p.id);
    const rows = await this.usageRepo
      .createQueryBuilder("u")
      .select("COALESCE(SUM(u.discountAmount), 0)", "totalDiscount")
      .addSelect("COUNT(*)", "totalOrders")
      .where("u.promotionId IN (:...ids)", { ids })
      .getRawOne();
    return {
      totalPromotions: promos.length,
      activePromotions: promos.filter((p) => p.isActive).length,
      totalUsedCount: promos.reduce((s, p) => s + Number(p.usedCount ?? 0), 0),
      totalDiscount: Number(rows?.totalDiscount ?? 0),
      totalOrders: Number(rows?.totalOrders ?? 0),
    };
  }

  // ---- Compensation voucher (voucher bồi thường) ----

  async getCompensationConfig(): Promise<CompensationConfigEntity | null> {
    return this.configRepo.findOne({ where: { id: COMPENSATION_CONFIG_ID } });
  }

  async saveCompensationConfig(
    config: CompensationConfigEntity,
  ): Promise<CompensationConfigEntity> {
    return this.configRepo.save(config);
  }

  async findVoucherBySourceOrder(
    sourceOrderId: string,
  ): Promise<CompensationVoucherEntity | null> {
    return this.voucherRepo.findOne({ where: { sourceOrderId } });
  }

  async findVoucherById(id: string): Promise<CompensationVoucherEntity | null> {
    return this.voucherRepo.findOne({ where: { id } });
  }

  async findUnusedVouchers(
    consumerId: string,
  ): Promise<CompensationVoucherEntity[]> {
    return this.voucherRepo.find({
      where: { consumerId, isUsed: false },
      order: { issuedAt: "ASC" },
    });
  }

  async saveVoucher(
    voucher: CompensationVoucherEntity,
  ): Promise<CompensationVoucherEntity> {
    return this.voucherRepo.save(voucher);
  }

  // ---- Flash Sale ----

  async saveFlashSale(sale: FlashSaleEntity): Promise<FlashSaleEntity> {
    return this.flashSaleRepo.save(sale);
  }

  async saveFlashSaleItem(
    item: FlashSaleItemEntity,
  ): Promise<FlashSaleItemEntity> {
    return this.flashSaleItemRepo.save(item);
  }

  async findFlashSaleById(id: string): Promise<FlashSaleEntity | null> {
    return this.flashSaleRepo.findOne({ where: { id } });
  }

  async findFlashSaleItemById(id: string): Promise<FlashSaleItemEntity | null> {
    return this.flashSaleItemRepo.findOne({ where: { id } });
  }

  async findFlashSaleItemsBySaleIds(
    flashSaleIds: string[],
  ): Promise<FlashSaleItemEntity[]> {
    if (!flashSaleIds.length) return [];
    return this.flashSaleItemRepo
      .createQueryBuilder("i")
      .where("i.flashSaleId IN (:...ids)", { ids: flashSaleIds })
      .getMany();
  }

  async findFlashSalesByMerchant(
    merchantId: string,
  ): Promise<FlashSaleEntity[]> {
    return this.flashSaleRepo.find({
      where: { merchantId },
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Đếm số flash sale chưa hủy/kết thúc của một nhà hàng có cửa sổ thời gian
   * giao nhau với [startAt, endAt] — dùng cho quy tắc "tối đa 5 flash sale cùng lúc".
   */
  async countOverlappingFlashSales(
    merchantId: string,
    startAt: Date,
    endAt: Date,
  ): Promise<number> {
    return this.flashSaleRepo
      .createQueryBuilder("f")
      .where("f.merchantId = :merchantId", { merchantId })
      .andWhere("f.cancelledAt IS NULL")
      .andWhere("f.endAt > :startAt", { startAt })
      .andWhere("f.startAt < :endAt", { endAt })
      .getCount();
  }

  async listFlashSales(filter: {
    merchantId?: string;
    status?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: FlashSaleEntity[]; total: number }> {
    const qb = this.flashSaleRepo
      .createQueryBuilder("f")
      .orderBy("f.createdAt", "DESC");
    if (filter.merchantId) {
      qb.andWhere("f.merchantId = :merchantId", {
        merchantId: filter.merchantId,
      });
    }
    if (filter.status) {
      qb.andWhere("f.status = :status", { status: filter.status });
    }
    qb.skip(filter.skip ?? 0).take(filter.take ?? 50);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  /**
   * Tìm flash sale item đang "mở" (chưa hủy, chưa kết thúc) cho một món,
   * dùng để chặn trùng khi tạo flash sale mới cho cùng món.
   */
  async findOpenFlashSaleItemByMenuItem(
    menuItemId: string,
    merchantId: string,
  ): Promise<{ sale: FlashSaleEntity; item: FlashSaleItemEntity } | null> {
    const rows = await this.flashSaleItemRepo
      .createQueryBuilder("i")
      .innerJoinAndSelect(
        FlashSaleEntity,
        "f",
        "f.id = i.flashSaleId AND f.merchantId = :merchantId",
        { merchantId },
      )
      .where("i.menuItemId = :menuItemId", { menuItemId })
      .andWhere("f.cancelledAt IS NULL")
      .andWhere("f.endAt > :now", { now: new Date() })
      .getMany();
    if (!rows.length) return null;
    const item = rows[0];
    if (!item) return null;
    const sale = await this.findFlashSaleById(item.flashSaleId);
    if (!sale) return null;
    return { sale, item };
  }

  async findFlashSaleUsageByOrderId(
    orderId: string,
  ): Promise<FlashSaleUsageEntity[]> {
    return this.flashSaleUsageRepo.find({ where: { orderId } });
  }

  async countFlashSaleUsageQuantity(
    flashSaleItemId: string,
    consumerId: string,
  ): Promise<number> {
    const row = await this.flashSaleUsageRepo
      .createQueryBuilder("u")
      .select("COALESCE(SUM(u.quantity), 0)", "total")
      .where("u.flashSaleItemId = :flashSaleItemId", { flashSaleItemId })
      .andWhere("u.consumerId = :consumerId", { consumerId })
      .andWhere("u.refundedAt IS NULL")
      .getRawOne();
    return Number(row?.total ?? 0);
  }

  /**
   * Áp flash sale cho một món một cách nguyên tử:
   * khóa dòng item (pessimistic_write), re-check giờ/stock/limit, trừ stock,
   * ghi usage. Trả về salePrice áp dụng.
   */
  async applyFlashSaleItemAtomic(params: {
    flashSaleItemId: string;
    salePrice: number;
    originalPrice: number;
    quantity: number;
    limitPerUser: number;
    consumerId: string;
    orderId: string;
  }): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(FlashSaleItemEntity, {
        where: { id: params.flashSaleItemId },
        lock: { mode: "pessimistic_write" },
      });
      if (!item) {
        throw new BadRequestException("Flash sale không hợp lệ");
      }
      const sale = await manager.findOne(FlashSaleEntity, {
        where: { id: item.flashSaleId },
      });
      if (!sale || sale.cancelledAt) {
        throw new BadRequestException("Flash sale đã bị hủy");
      }
      const now = new Date();
      if (now < sale.startAt) {
        throw new BadRequestException("Flash sale chưa bắt đầu");
      }
      if (now > sale.endAt) {
        throw new BadRequestException("Flash sale đã kết thúc");
      }
      if (item.soldQuantity + params.quantity > item.totalQuantity) {
        throw new BadRequestException("Flash sale đã hết suất");
      }
      const usedQty = await manager
        .getRepository(FlashSaleUsageEntity)
        .createQueryBuilder("u")
        .select("COALESCE(SUM(u.quantity), 0)", "total")
        .where("u.flashSaleItemId = :flashSaleItemId", {
          flashSaleItemId: item.id,
        })
        .andWhere("u.consumerId = :consumerId", {
          consumerId: params.consumerId,
        })
        .andWhere("u.refundedAt IS NULL")
        .getRawOne();
      const used = Number(usedQty?.total ?? 0);
      if (used + params.quantity > params.limitPerUser) {
        throw new BadRequestException("Bạn đã đạt giới hạn số suất flash sale");
      }

      const usage = new FlashSaleUsageEntity();
      usage.id = uuidv4();
      usage.flashSaleId = sale.id;
      usage.flashSaleItemId = item.id;
      usage.orderId = params.orderId;
      usage.consumerId = params.consumerId;
      usage.quantity = params.quantity;
      usage.unitPrice = params.salePrice;
      usage.discountAmount =
        (Number(params.originalPrice) - Number(params.salePrice)) *
        params.quantity;
      usage.refundedAt = null;
      await manager.save(usage);

      item.soldQuantity = (item.soldQuantity ?? 0) + params.quantity;
      await manager.save(item);

      return Number(params.salePrice);
    });
  }

  /**
   * Hoàn stock + đánh dấu usage đã hoàn (idempotent).
   */
  async refundFlashSaleByOrderId(orderId: string): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const usages = await manager.find(FlashSaleUsageEntity, {
        where: { orderId },
      });
      if (!usages.length) return false;
      let changed = false;
      for (const usage of usages) {
        if (usage.refundedAt) continue;
        const item = await manager.findOne(FlashSaleItemEntity, {
          where: { id: usage.flashSaleItemId },
          lock: { mode: "pessimistic_write" },
        });
        if (item) {
          item.soldQuantity = Math.max(
            0,
            (item.soldQuantity ?? 0) - usage.quantity,
          );
          await manager.save(item);
        }
        usage.refundedAt = new Date();
        await manager.save(usage);
        changed = true;
      }
      return changed;
    });
  }

  async statsFlashSale(flashSaleId: string): Promise<{
    totalOrders: number;
    totalSoldQuantity: number;
    totalDiscount: number;
    totalRevenue: number;
  }> {
    const usages = await this.flashSaleUsageRepo.find({
      where: { flashSaleId, refundedAt: IsNull() },
    });
    const totalOrders = new Set(usages.map((u) => u.orderId)).size;
    const totalSoldQuantity = usages.reduce((s, u) => s + u.quantity, 0);
    const totalDiscount = usages.reduce(
      (s, u) => s + Number(u.discountAmount),
      0,
    );
    const totalRevenue = usages.reduce(
      (s, u) => s + Number(u.unitPrice) * u.quantity,
      0,
    );
    return { totalOrders, totalSoldQuantity, totalDiscount, totalRevenue };
  }
}
