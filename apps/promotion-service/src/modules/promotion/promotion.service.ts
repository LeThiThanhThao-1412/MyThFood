import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { PromotionRepository } from "./promotion.repository";
import {
  PromotionEntity,
  PromotionUsageEntity,
  CompensationConfigEntity,
  CompensationVoucherEntity,
  COMPENSATION_CONFIG_ID,
} from "./promotion.entity";
import {
  CreatePromotionDto,
  UpdatePromotionDto,
  ValidatePromotionDto,
  ApplyPromotionDto,
  UpdateCompensationConfigDto,
  IssueCompensationVoucherDto,
  ApplyCompensationVoucherDto,
} from "./promotion.dto";

@Injectable()
export class PromotionService {
  constructor(private readonly promoRepo: PromotionRepository) {}

  async create(
    dto: CreatePromotionDto,
    fundedBy: "MERCHANT" | "PLATFORM",
  ): Promise<PromotionEntity> {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.promoRepo.findByCode(code);
    if (existing) {
      throw new BadRequestException("Mã khuyến mãi đã tồn tại");
    }
    const target = dto.target ?? "FOOD";
    if (target === "ITEM" && !dto.menuItemId) {
      throw new BadRequestException(
        "Mã giảm cho món cụ thể cần chọn món áp dụng",
      );
    }
    const promo = new PromotionEntity();
    promo.id = uuidv4();
    promo.merchantId = dto.merchantId;
    promo.code = code;
    promo.type = dto.type;
    promo.target = target;
    promo.fundedBy = fundedBy;
    promo.menuItemId = dto.menuItemId ?? null;
    promo.menuItemName = dto.menuItemName ?? null;
    promo.value = dto.value;
    promo.minOrderValue = dto.minOrderValue ?? null;
    promo.maxDiscount = dto.maxDiscount ?? null;
    promo.startAt = dto.startAt ? new Date(dto.startAt) : null;
    promo.endAt = dto.endAt ? new Date(dto.endAt) : null;
    promo.usageLimit = dto.usageLimit ?? null;
    promo.usageLimitPerUser = dto.usageLimitPerUser ?? null;
    promo.usedCount = 0;
    promo.isActive = true;
    return this.promoRepo.savePromotion(promo);
  }

  async getById(id: string): Promise<PromotionEntity> {
    const promo = await this.promoRepo.findById(id);
    if (!promo) {
      throw new NotFoundException("Không tìm thấy mã khuyến mãi");
    }
    return promo;
  }

  async getByMerchantId(merchantId: string): Promise<PromotionEntity[]> {
    return this.promoRepo.findByMerchantId(merchantId);
  }

  async getAll(filter: {
    merchantId?: string;
    isActive?: boolean;
    skip?: number;
    take?: number;
  }) {
    return this.promoRepo.findAll(filter);
  }

  async update(id: string, dto: UpdatePromotionDto): Promise<PromotionEntity> {
    const promo = await this.getById(id);
    if (dto.menuItemId !== undefined) promo.menuItemId = dto.menuItemId;
    if (dto.menuItemName !== undefined) promo.menuItemName = dto.menuItemName;
    if (dto.value !== undefined) promo.value = dto.value;
    if (dto.minOrderValue !== undefined)
      promo.minOrderValue = dto.minOrderValue;
    if (dto.maxDiscount !== undefined) promo.maxDiscount = dto.maxDiscount;
    if (dto.startAt !== undefined) {
      promo.startAt = dto.startAt ? new Date(dto.startAt) : null;
    }
    if (dto.endAt !== undefined) {
      promo.endAt = dto.endAt ? new Date(dto.endAt) : null;
    }
    if (dto.usageLimit !== undefined) promo.usageLimit = dto.usageLimit;
    if (dto.usageLimitPerUser !== undefined) {
      promo.usageLimitPerUser = dto.usageLimitPerUser;
    }
    return this.promoRepo.savePromotion(promo);
  }

  async setActive(id: string, isActive: boolean): Promise<PromotionEntity> {
    const promo = await this.getById(id);
    promo.isActive = isActive;
    return this.promoRepo.savePromotion(promo);
  }

  async remove(id: string): Promise<void> {
    const promo = await this.getById(id);
    await this.promoRepo.deletePromotion(promo);
  }

  async validate(
    dto: ValidatePromotionDto,
  ): Promise<{ discount: number; fundedBy: string; target: string }> {
    const promo = await this.findValid(
      dto.code,
      dto.merchantId,
      dto.foodTotal,
      dto.consumerId,
    );
    const itemTotal =
      promo.target === "ITEM"
        ? this.computeItemTotal(dto.items, promo.menuItemId) ||
          (dto.itemTotal ?? 0)
        : 0;
    const { discount } = this.computeDiscount(
      promo,
      dto.foodTotal,
      dto.shippingFee ?? 0,
      itemTotal,
    );
    return { discount, fundedBy: promo.fundedBy, target: promo.target };
  }

  async apply(dto: ApplyPromotionDto): Promise<{
    discount: number;
    promotionId: string;
    fundedBy: string;
    target: string;
  }> {
    // Idempotent fast path: 1 đơn chỉ áp 1 voucher
    const existing = await this.promoRepo.findUsageByOrderId(dto.orderId);
    if (existing) {
      const existingPromo = await this.promoRepo.findById(existing.promotionId);
      return {
        discount: Number(existing.discountAmount),
        promotionId: existing.promotionId,
        fundedBy: existingPromo?.fundedBy ?? "MERCHANT",
        target: existingPromo?.target ?? "FOOD",
      };
    }

    const promo = await this.findValid(
      dto.code,
      dto.merchantId,
      dto.foodTotal,
      dto.consumerId,
    );
    const itemTotal =
      promo.target === "ITEM"
        ? this.computeItemTotal(dto.items, promo.menuItemId) ||
          (dto.itemTotal ?? 0)
        : 0;
    const { discount } = this.computeDiscount(
      promo,
      dto.foodTotal,
      dto.shippingFee ?? 0,
      itemTotal,
    );

    const usage = new PromotionUsageEntity();
    usage.id = uuidv4();
    usage.promotionId = promo.id;
    usage.orderId = dto.orderId;
    usage.consumerId = dto.consumerId;
    usage.discountAmount = discount;

    try {
      await this.promoRepo.applyAtomic(promo.id, usage);
    } catch (err: any) {
      const code = err?.code ?? err?.driverError?.code;
      if (code === "23505") {
        const dup = await this.promoRepo.findUsageByOrderId(dto.orderId);
        if (dup) {
          const dupPromo = await this.promoRepo.findById(dup.promotionId);
          return {
            discount: Number(dup.discountAmount),
            promotionId: dup.promotionId,
            fundedBy: dupPromo?.fundedBy ?? "MERCHANT",
            target: dupPromo?.target ?? "FOOD",
          };
        }
      }
      throw err;
    }

    return {
      discount,
      promotionId: promo.id,
      fundedBy: promo.fundedBy,
      target: promo.target,
    };
  }

  async getStats(id: string) {
    await this.getById(id);
    return this.promoRepo.statsByPromotion(id);
  }

  async getMerchantStats(merchantId: string) {
    return this.promoRepo.statsByMerchant(merchantId);
  }

  private async findValid(
    code: string,
    merchantId: string,
    foodTotal: number,
    consumerId?: string,
  ): Promise<PromotionEntity> {
    const promo = await this.promoRepo.findByCode(code.toUpperCase());
    if (!promo || !promo.isActive || promo.merchantId !== merchantId) {
      throw new BadRequestException("Mã khuyến mãi không hợp lệ");
    }
    const now = new Date();
    if (promo.startAt && now < promo.startAt) {
      throw new BadRequestException("Mã chưa đến thời gian áp dụng");
    }
    if (promo.endAt && now > promo.endAt) {
      throw new BadRequestException("Mã đã hết hạn");
    }
    if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) {
      throw new BadRequestException("Mã đã hết lượt sử dụng");
    }
    if (consumerId && promo.usageLimitPerUser != null) {
      const used = await this.promoRepo.countUsagesByUser(promo.id, consumerId);
      if (used >= promo.usageLimitPerUser) {
        throw new BadRequestException("Bạn đã hết lượt dùng mã này");
      }
    }
    if (
      promo.minOrderValue != null &&
      foodTotal < Number(promo.minOrderValue)
    ) {
      throw new BadRequestException("Đơn chưa đạt giá trị tối thiểu");
    }
    return promo;
  }

  private computeDiscount(
    promo: PromotionEntity,
    foodTotal: number,
    shippingFee: number,
    itemTotal: number,
  ): { discount: number } {
    const base =
      promo.target === "SHIPPING"
        ? shippingFee
        : promo.target === "ITEM"
          ? itemTotal
          : foodTotal;
    let discount =
      promo.type === "PERCENT"
        ? (base * Number(promo.value)) / 100
        : Number(promo.value);
    if (promo.maxDiscount != null && discount > Number(promo.maxDiscount)) {
      discount = Number(promo.maxDiscount);
    }
    discount = Math.max(0, Math.min(discount, base));
    return { discount };
  }

  private computeItemTotal(
    items:
      | { menuItemId: string; quantity: number; unitPrice: number }[]
      | undefined,
    menuItemId: string | null,
  ): number {
    if (!menuItemId || !items?.length) return 0;
    return items
      .filter((i) => i.menuItemId === menuItemId)
      .reduce((sum, i) => sum + (i.unitPrice ?? 0) * (i.quantity ?? 0), 0);
  }

  // ---- Compensation voucher (voucher bồi thường) ----

  async getCompensationConfig(): Promise<CompensationConfigEntity> {
    let config = await this.promoRepo.getCompensationConfig();
    if (!config) {
      config = new CompensationConfigEntity();
      config.id = COMPENSATION_CONFIG_ID;
      config.value = 15000;
      config.isActive = true;
      config = await this.promoRepo.saveCompensationConfig(config);
    }
    return config;
  }

  async updateCompensationConfig(
    dto: UpdateCompensationConfigDto,
  ): Promise<CompensationConfigEntity> {
    const config = await this.getCompensationConfig();
    if (dto.value !== undefined) config.value = dto.value;
    if (dto.isActive !== undefined) config.isActive = dto.isActive;
    return this.promoRepo.saveCompensationConfig(config);
  }

  async issueCompensationVoucher(
    dto: IssueCompensationVoucherDto,
  ): Promise<CompensationVoucherEntity | null> {
    const config = await this.getCompensationConfig();
    if (!config.isActive) {
      return null; // tính năng đang tắt
    }
    const existing = await this.promoRepo.findVoucherBySourceOrder(
      dto.sourceOrderId,
    );
    if (existing) {
      return existing; // idempotent
    }
    const voucher = new CompensationVoucherEntity();
    voucher.id = uuidv4();
    voucher.name = `Bồi thường #${dto.sourceOrderId.slice(0, 8)}`;
    voucher.consumerId = dto.consumerId;
    voucher.value = Number(config.value);
    voucher.sourceOrderId = dto.sourceOrderId;
    voucher.isUsed = false;
    voucher.usedOrderId = null;
    voucher.issuedAt = new Date();
    voucher.usedAt = null;
    return this.promoRepo.saveVoucher(voucher);
  }

  async listCompensationVouchers(
    consumerId: string,
  ): Promise<CompensationVoucherEntity[]> {
    return this.promoRepo.findUnusedVouchers(consumerId);
  }

  async applyCompensationVoucher(
    dto: ApplyCompensationVoucherDto,
  ): Promise<{ discount: number }> {
    const voucher = await this.promoRepo.findVoucherById(dto.voucherId);
    if (!voucher || voucher.consumerId !== dto.consumerId) {
      throw new BadRequestException("Voucher bồi thường không hợp lệ");
    }
    if (voucher.isUsed) {
      if (voucher.usedOrderId === dto.orderId) {
        return { discount: Number(voucher.value) }; // idempotent
      }
      throw new BadRequestException("Voucher bồi thường đã được sử dụng");
    }
    voucher.isUsed = true;
    voucher.usedOrderId = dto.orderId;
    voucher.usedAt = new Date();
    await this.promoRepo.saveVoucher(voucher);
    return { discount: Number(voucher.value) };
  }
}
