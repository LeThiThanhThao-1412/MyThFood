import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { v4 as uuidv4 } from "uuid";
import { PromotionRepository } from "./promotion.repository";
import {
  PromotionEntity,
  PromotionUsageEntity,
  CompensationConfigEntity,
  CompensationVoucherEntity,
  FlashSaleEntity,
  FlashSaleItemEntity,
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
  CreateFlashSaleDto,
  UpdateFlashSaleDto,
  ValidateFlashSaleDto,
  ApplyFlashSaleDto,
  RefundFlashSaleDto,
  RefundFlashSaleItemsDto,
  RecalculateUsageDto,
  CreateFlashSaleItemDto,
} from "./promotion.dto";

@Injectable()
export class PromotionService {
  private readonly logger = new Logger(PromotionService.name);

  constructor(
    private readonly promoRepo: PromotionRepository,
    private readonly httpService: HttpService,
  ) {}

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

  // ---- Flash Sale ----

  async createFlashSale(
    dto: CreateFlashSaleDto,
    fundedBy: "MERCHANT" | "PLATFORM",
  ): Promise<any> {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) {
      throw new BadRequestException(
        "Thời gian kết thúc phải sau thời gian bắt đầu",
      );
    }
    if (endAt <= new Date()) {
      throw new BadRequestException("Thời gian kết thúc phải ở tương lai");
    }

    // Quy tắc: thời lượng tối thiểu 1 giờ, tối đa 24 giờ.
    const durationMs = endAt.getTime() - startAt.getTime();
    if (durationMs < 60 * 60 * 1000) {
      throw new BadRequestException("Flash sale tối thiểu 1 giờ");
    }
    if (durationMs > 24 * 60 * 60 * 1000) {
      throw new BadRequestException("Flash sale tối đa 24 giờ");
    }

    // Quy tắc: mỗi nhà hàng tối đa 5 flash sale có thời gian giao nhau.
    const overlapping = await this.promoRepo.countOverlappingFlashSales(
      dto.merchantId,
      startAt,
      endAt,
    );
    if (overlapping >= 5) {
      throw new BadRequestException(
        "Mỗi nhà hàng tối đa 5 flash sale cùng lúc",
      );
    }

    // Validate + tính salePrice cho từng món; chặn trùng món đang có flash sale.
    const computed: {
      dto: CreateFlashSaleItemDto;
      salePrice: number;
      discountPercent: number | null;
    }[] = [];
    const seen = new Set<string>();
    for (const itemDto of dto.items) {
      if (seen.has(itemDto.menuItemId)) {
        throw new BadRequestException(
          "Có món bị trùng trong danh sách flash sale",
        );
      }
      seen.add(itemDto.menuItemId);
      const open = await this.promoRepo.findOpenFlashSaleItemByMenuItem(
        itemDto.menuItemId,
        dto.merchantId,
      );
      if (open) {
        throw new BadRequestException(
          `Món "${itemDto.menuItemName ?? itemDto.menuItemId}" đang có flash sale đang diễn ra`,
        );
      }
      const { salePrice, discountPercent } =
        this.computeFlashSaleItemPrice(itemDto);
      computed.push({ dto: itemDto, salePrice, discountPercent });
    }

    const sale = new FlashSaleEntity();
    sale.id = uuidv4();
    sale.merchantId = dto.merchantId;
    sale.title = dto.title?.trim() || "Flash Sale";
    sale.fundedBy = fundedBy;
    sale.status = "SCHEDULED";
    sale.startAt = startAt;
    sale.endAt = endAt;
    sale.cancelledAt = null;
    await this.promoRepo.saveFlashSale(sale);

    const items: FlashSaleItemEntity[] = [];
    for (const c of computed) {
      const item = new FlashSaleItemEntity();
      item.id = uuidv4();
      item.flashSaleId = sale.id;
      item.menuItemId = c.dto.menuItemId;
      item.menuItemName = c.dto.menuItemName ?? null;
      item.imageUrl = c.dto.imageUrl ?? null;
      item.originalPrice = Number(c.dto.originalPrice);
      item.discountType = c.dto.discountType;
      item.discountPercent = c.discountPercent;
      item.salePrice = c.salePrice;
      item.totalQuantity = c.dto.totalQuantity;
      item.soldQuantity = 0;
      item.limitPerUser = c.dto.limitPerUser ?? 1;
      await this.promoRepo.saveFlashSaleItem(item);
      items.push(item);
    }

    await this.notifyMerchantPriceHistory(sale, items);

    return { ...sale, items };
  }

  private async notifyMerchantPriceHistory(
    sale: FlashSaleEntity,
    items: FlashSaleItemEntity[],
  ): Promise<void> {
    try {
      const url =
        process.env.MERCHANT_SERVICE_URL || "http://merchant-service:3003";
      const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
      await firstValueFrom(
        this.httpService.post(
          `${url}/api/v1/merchants/price-history/flash-sale`,
          {
            merchantId: sale.merchantId,
            title: sale.title,
            items: items.map((it) => ({
              menuItemId: it.menuItemId,
              menuItemName: it.menuItemName,
              originalPrice: Number(it.originalPrice),
              salePrice: Number(it.salePrice),
            })),
          },
          { headers: { "x-service-key": serviceKey } },
        ),
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to record flash sale price history: ${err?.message}`,
      );
    }
  }

  async getFlashSaleById(id: string): Promise<any> {
    const sale = await this.promoRepo.findFlashSaleById(id);
    if (!sale) {
      throw new NotFoundException("Không tìm thấy flash sale");
    }
    const items = await this.promoRepo.findFlashSaleItemsBySaleIds([id]);
    if (items.length) {
      await this.syncFlashSaleStatus(sale, items);
    }
    return { ...sale, items };
  }

  async listFlashSales(filter: {
    merchantId?: string;
    status?: string;
    skip?: number;
    take?: number;
  }): Promise<{ items: any[]; total: number }> {
    const { items, total } = await this.promoRepo.listFlashSales(filter);
    const saleIds = items.map((s) => s.id);
    const allItems = await this.promoRepo.findFlashSaleItemsBySaleIds(saleIds);
    const itemsBySale = new Map<string, FlashSaleItemEntity[]>();
    for (const it of allItems) {
      const list = itemsBySale.get(it.flashSaleId) ?? [];
      list.push(it);
      itemsBySale.set(it.flashSaleId, list);
    }
    const views = [];
    for (const sale of items) {
      const saleItems = itemsBySale.get(sale.id) ?? [];
      if (saleItems.length) {
        await this.syncFlashSaleStatus(sale, saleItems);
      }
      views.push({ ...sale, items: saleItems });
    }
    return { items: views, total };
  }

  async listActiveFlashSales(): Promise<any[]> {
    const { items } = await this.promoRepo.listFlashSales({
      skip: 0,
      take: 500,
    });
    const saleIds = items.map((s) => s.id);
    const allItems = await this.promoRepo.findFlashSaleItemsBySaleIds(saleIds);
    const itemsBySale = new Map<string, FlashSaleItemEntity[]>();
    for (const it of allItems) {
      const list = itemsBySale.get(it.flashSaleId) ?? [];
      list.push(it);
      itemsBySale.set(it.flashSaleId, list);
    }
    const views = [];
    for (const sale of items) {
      const saleItems = itemsBySale.get(sale.id) ?? [];
      if (!saleItems.length) continue;
      const status = await this.syncFlashSaleStatus(sale, saleItems);
      if (status === "ACTIVE") {
        views.push({ ...sale, items: saleItems });
      }
    }
    return views;
  }

  async updateFlashSale(id: string, dto: UpdateFlashSaleDto): Promise<any> {
    const sale = await this.promoRepo.findFlashSaleById(id);
    if (!sale) {
      throw new NotFoundException("Không tìm thấy flash sale");
    }
    const items = await this.promoRepo.findFlashSaleItemsBySaleIds([id]);
    if (!items.length) {
      throw new NotFoundException("Không tìm thấy món của flash sale");
    }
    const status = await this.syncFlashSaleStatus(sale, items);
    const isRunning = ["ACTIVE", "ENDED", "SOLD_OUT"].includes(status);

    // Sale-level fields.
    if (dto.title !== undefined) sale.title = dto.title;
    if (dto.endAt) sale.endAt = new Date(dto.endAt);
    if (!isRunning && dto.startAt) sale.startAt = new Date(dto.startAt);

    // Per-item stock/limit (khi đang chạy không cho giảm stock dưới sold).
    if (dto.items) {
      const itemById = new Map(items.map((i) => [i.id, i]));
      for (const upd of dto.items) {
        const item = itemById.get(upd.id);
        if (!item) continue;
        if (upd.totalQuantity !== undefined) {
          if (isRunning && upd.totalQuantity < item.soldQuantity) {
            throw new BadRequestException(
              "Số lượng không được nhỏ hơn số đã bán",
            );
          }
          item.totalQuantity = upd.totalQuantity;
        }
        if (upd.limitPerUser !== undefined) {
          item.limitPerUser = upd.limitPerUser;
        }
        await this.promoRepo.saveFlashSaleItem(item);
      }
    }

    await this.promoRepo.saveFlashSale(sale);
    await this.syncFlashSaleStatus(sale, items);
    return { ...sale, items };
  }

  async cancelFlashSale(id: string): Promise<any> {
    const sale = await this.promoRepo.findFlashSaleById(id);
    if (!sale) {
      throw new NotFoundException("Không tìm thấy flash sale");
    }
    sale.cancelledAt = new Date();
    sale.status = "CANCELLED";
    await this.promoRepo.saveFlashSale(sale);
    const items = await this.promoRepo.findFlashSaleItemsBySaleIds([id]);
    return { ...sale, items };
  }

  async pauseFlashSale(id: string): Promise<any> {
    const sale = await this.promoRepo.findFlashSaleById(id);
    if (!sale) {
      throw new NotFoundException("Không tìm thấy flash sale");
    }
    if (sale.status !== "ACTIVE") {
      throw new BadRequestException(
        "Chỉ có thể tạm dừng flash sale đang diễn ra",
      );
    }
    sale.status = "PAUSED";
    await this.promoRepo.saveFlashSale(sale);
    const items = await this.promoRepo.findFlashSaleItemsBySaleIds([id]);
    return { ...sale, items };
  }

  async resumeFlashSale(id: string): Promise<any> {
    const sale = await this.promoRepo.findFlashSaleById(id);
    if (!sale) {
      throw new NotFoundException("Không tìm thấy flash sale");
    }
    if (sale.status !== "PAUSED") {
      throw new BadRequestException(
        "Chỉ có thể tiếp tục flash sale đang tạm dừng",
      );
    }
    const now = new Date();
    sale.status = now > sale.endAt ? "ENDED" : "ACTIVE";
    await this.promoRepo.saveFlashSale(sale);
    const items = await this.promoRepo.findFlashSaleItemsBySaleIds([id]);
    return { ...sale, items };
  }

  async getFlashSaleStats(id: string): Promise<any> {
    await this.getFlashSaleById(id);
    return this.promoRepo.statsFlashSale(id);
  }

  /**
   * Tính trạng thái hiệu quả theo thời gian thực và ghi lại (lazy-eval).
   * Với nhiều món: SOLD_OUT khi toàn bộ món đều bán hết.
   */
  private async syncFlashSaleStatus(
    sale: FlashSaleEntity,
    items: FlashSaleItemEntity[],
  ): Promise<string> {
    let status: string;
    const now = new Date();
    if (sale.cancelledAt) {
      status = "CANCELLED";
    } else if (
      sale.status === "PAUSED" &&
      now >= sale.startAt &&
      now <= sale.endAt
    ) {
      status = "PAUSED";
    } else if (now < sale.startAt) {
      status = "SCHEDULED";
    } else if (now > sale.endAt) {
      status = "ENDED";
    } else if (
      items.length > 0 &&
      items.every((i) => i.soldQuantity >= i.totalQuantity)
    ) {
      status = "SOLD_OUT";
    } else {
      status = "ACTIVE";
    }
    if (sale.status !== status) {
      sale.status = status;
      await this.promoRepo.saveFlashSale(sale);
    }
    return status;
  }

  /**
   * Tính giá sale cho một món (PERCENT hoặc FIXED_PRICE).
   */
  private computeFlashSaleItemPrice(item: {
    originalPrice: number;
    discountType: string;
    discountPercent?: number | null;
    salePrice?: number | null;
  }): { salePrice: number; discountPercent: number | null } {
    const originalPrice = Number(item.originalPrice);
    if (originalPrice <= 0) {
      throw new BadRequestException("Giá gốc phải lớn hơn 0");
    }
    let salePrice: number;
    let discountPercent: number | null = null;
    if (item.discountType === "PERCENT") {
      const pct = Number(item.discountPercent ?? 0);
      if (pct <= 0 || pct >= 100) {
        throw new BadRequestException(
          "Phần trăm giảm phải trong khoảng (0, 100)",
        );
      }
      discountPercent = pct;
      salePrice = Math.round((originalPrice * (100 - pct)) / 100);
    } else {
      salePrice = Number(item.salePrice ?? 0);
      if (salePrice < 0) {
        throw new BadRequestException("Giá sale không được âm");
      }
    }
    if (salePrice >= originalPrice) {
      throw new BadRequestException("Giá sale phải thấp hơn giá gốc");
    }
    // Quy tắc: mức giảm tối đa 70% (áp dụng cho cả FIXED_PRICE).
    const effectiveDiscount =
      ((originalPrice - salePrice) / originalPrice) * 100;
    if (effectiveDiscount > 70) {
      throw new BadRequestException("Mức giảm tối đa là 70%");
    }
    return { salePrice, discountPercent };
  }

  /**
   * Tìm flash sale item đang ACTIVE cho một món (đã check giờ + chưa hủy).
   */
  private async findActiveFlashSaleItem(
    merchantId: string,
    menuItemId: string,
  ): Promise<{ sale: FlashSaleEntity; item: FlashSaleItemEntity } | null> {
    const open = await this.promoRepo.findOpenFlashSaleItemByMenuItem(
      menuItemId,
      merchantId,
    );
    if (!open) return null;
    const now = new Date();
    if (now < open.sale.startAt || now > open.sale.endAt) return null;
    if (open.sale.status === "PAUSED" || open.sale.status === "CANCELLED") {
      return null;
    }
    if (open.item.soldQuantity >= open.item.totalQuantity) return null;
    return open;
  }

  async validateFlashSale(dto: ValidateFlashSaleDto): Promise<any> {
    const items = [];
    let discountAmount = 0;
    for (const input of dto.items) {
      const active = await this.findActiveFlashSaleItem(
        dto.merchantId,
        input.menuItemId,
      );
      if (!active) {
        items.push({
          menuItemId: input.menuItemId,
          originalPrice: input.unitPrice ?? 0,
          salePrice: input.unitPrice ?? 0,
          quantity: input.quantity ?? 1,
          saleQuantity: 0,
          hasFlashSale: false,
          remainingStock: null,
          limitPerUser: null,
        });
        continue;
      }
      const originalPrice = Number(active.item.originalPrice);
      const salePrice = Number(active.item.salePrice);
      const remainingStock = Math.max(
        0,
        active.item.totalQuantity - active.item.soldQuantity,
      );
      // Số suất còn lại của riêng khách này (nếu đã xác định được khách).
      const usedByUser = dto.consumerId
        ? await this.promoRepo.countFlashSaleUsageQuantity(
            active.item.id,
            dto.consumerId,
          )
        : 0;
      const remainingUserQuota = Math.max(
        0,
        Number(active.item.limitPerUser) - usedByUser,
      );
      // Số phần được hưởng giá sale; phần còn lại khách trả giá thường.
      const saleQuantity = Math.max(
        0,
        Math.min(input.quantity ?? 1, remainingStock, remainingUserQuota),
      );
      discountAmount += (originalPrice - salePrice) * saleQuantity;
      items.push({
        menuItemId: input.menuItemId,
        originalPrice,
        salePrice,
        quantity: input.quantity ?? 1,
        saleQuantity,
        hasFlashSale: saleQuantity > 0,
        remainingStock,
        limitPerUser: active.item.limitPerUser,
        remainingUserQuota,
      });
    }
    return { items, discountAmount };
  }

  async applyFlashSale(dto: ApplyFlashSaleDto): Promise<any> {
    // Idempotent fast path: đơn đã áp flash sale trước đó.
    const existing = await this.promoRepo.findFlashSaleUsageByOrderId(
      dto.orderId,
    );
    if (existing.length) {
      const items = [];
      let discountAmount = 0;
      for (const usage of existing) {
        const item = await this.promoRepo.findFlashSaleItemById(
          usage.flashSaleItemId,
        );
        const sale = await this.promoRepo.findFlashSaleById(usage.flashSaleId);
        const originalPrice = item
          ? Number(item.originalPrice)
          : Number(usage.unitPrice);
        const salePrice = Number(usage.unitPrice);
        const perItemDiscount = (originalPrice - salePrice) * usage.quantity;
        discountAmount += perItemDiscount;
        items.push({
          menuItemId: item?.menuItemId ?? usage.flashSaleItemId,
          originalPrice,
          salePrice,
          quantity: usage.quantity,
          saleQuantity: usage.quantity,
          fundedBy: sale?.fundedBy ?? "MERCHANT",
        });
      }
      return { items, discountAmount };
    }

    const items = [];
    let discountAmount = 0;
    for (const input of dto.items) {
      const active = await this.findActiveFlashSaleItem(
        dto.merchantId,
        input.menuItemId,
      );
      if (!active) {
        // Không áp được suất sale. Nếu món vẫn đang trong khung giờ của một
        // flash sale (hết suất / tạm dừng) thì tính theo giá gốc của flash sale
        // thay vì tin giá sale client gửi lên.
        const open = await this.promoRepo.findOpenFlashSaleItemByMenuItem(
          input.menuItemId,
          dto.merchantId,
        );
        const now = new Date();
        const openInWindow =
          open && now >= open.sale.startAt && now <= open.sale.endAt
            ? open
            : null;
        const price = openInWindow
          ? Number(openInWindow.item.originalPrice)
          : (input.unitPrice ?? 0);
        items.push({
          menuItemId: input.menuItemId,
          originalPrice: price,
          salePrice: price,
          quantity: input.quantity,
          saleQuantity: 0,
          hasFlashSale: false,
          fundedBy: null,
        });
        continue;
      }
      const applied = await this.promoRepo.applyFlashSaleItemAtomic({
        flashSaleItemId: active.item.id,
        salePrice: Number(active.item.salePrice),
        originalPrice: Number(active.item.originalPrice),
        quantity: input.quantity,
        limitPerUser: active.item.limitPerUser,
        consumerId: dto.consumerId,
        orderId: dto.orderId,
      });
      const originalPrice = Number(active.item.originalPrice);
      const salePrice = Number(active.item.salePrice);
      // Chỉ phần được hưởng suất flash sale mới được giảm giá.
      discountAmount += (originalPrice - salePrice) * applied.saleQuantity;
      items.push({
        menuItemId: input.menuItemId,
        originalPrice,
        salePrice,
        quantity: input.quantity,
        saleQuantity: applied.saleQuantity,
        // Phần vượt giới hạn / hết suất khách trả giá thường.
        hasFlashSale: applied.saleQuantity > 0,
        fundedBy: applied.saleQuantity > 0 ? active.sale.fundedBy : null,
      });
    }
    return { items, discountAmount };
  }

  async refundFlashSale(dto: RefundFlashSaleDto): Promise<any> {
    const restored = await this.promoRepo.refundFlashSaleByOrderId(dto.orderId);
    return { orderId: dto.orderId, restored };
  }

  /**
   * Tính lại discount của promotion usage sau khi đơn được chỉnh sửa món.
   *
   * - Không có usage → trả về hasUsage=false để order-service dùng giảm giá
   *   thủ công hiện tại (nếu có).
   * - Không đạt minOrderValue → discount = 0 (mã không còn hợp lệ).
   * - `dryRun=true`: chỉ xem trước (dùng lúc tạo yêu cầu chỉnh sửa để khách
   *   thấy đúng số tiền trước khi xác nhận).
   */
  async recalculateUsage(dto: RecalculateUsageDto): Promise<{
    orderId: string;
    hasUsage: boolean;
    promotionId?: string;
    fundedBy?: string;
    target?: string;
    discount: number;
    minOrderValue?: number | null;
    dryRun: boolean;
  }> {
    const dryRun = !!dto.dryRun;
    const usage = await this.promoRepo.findUsageByOrderId(dto.orderId);
    if (!usage) {
      return { orderId: dto.orderId, hasUsage: false, discount: 0, dryRun };
    }

    const promo = await this.promoRepo.findById(usage.promotionId);
    if (!promo) {
      return {
        orderId: dto.orderId,
        hasUsage: true,
        promotionId: usage.promotionId,
        discount: 0,
        dryRun,
      };
    }

    const foodTotal = Math.max(0, Number(dto.foodTotal) || 0);
    const shippingFee = Math.max(0, Number(dto.shippingFee) || 0);
    const minOrderValue =
      promo.minOrderValue != null ? Number(promo.minOrderValue) : null;

    let discount = 0;
    if (minOrderValue == null || foodTotal >= minOrderValue) {
      const itemTotal =
        promo.target === "ITEM"
          ? this.computeItemTotal(dto.items, promo.menuItemId)
          : 0;
      discount = this.computeDiscount(
        promo,
        foodTotal,
        shippingFee,
        itemTotal,
      ).discount;
    }

    discount = Math.max(0, Math.min(discount, foodTotal));

    if (!dryRun) {
      usage.discountAmount = discount;
      await this.promoRepo.saveUsage(usage);
      this.logger.log(
        `Recalculated promotion usage for order ${dto.orderId}: ${discount} VND`,
      );
    }

    return {
      orderId: dto.orderId,
      hasUsage: true,
      promotionId: promo.id,
      fundedBy: promo.fundedBy,
      target: promo.target,
      discount,
      minOrderValue,
      dryRun,
    };
  }

  /** Hoàn suất flash sale cho phần số lượng món bị giảm/xóa. */
  async refundFlashSaleItems(dto: RefundFlashSaleItemsDto): Promise<{
    orderId: string;
    refundedQuantity: number;
  }> {
    const result = await this.promoRepo.refundFlashSaleItemsByOrderId(
      dto.orderId,
      dto.items,
    );
    return { orderId: dto.orderId, ...result };
  }
}
