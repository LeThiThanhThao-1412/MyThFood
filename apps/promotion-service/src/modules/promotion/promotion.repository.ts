import { Injectable, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository as TypeOrmRepo } from "typeorm";
import {
  PromotionEntity,
  PromotionUsageEntity,
  CompensationConfigEntity,
  CompensationVoucherEntity,
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
}
