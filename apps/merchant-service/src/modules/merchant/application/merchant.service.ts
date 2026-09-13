import { Injectable, Logger } from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { Merchant } from "../domain/merchant.aggregate";
import { MerchantId } from "../domain/merchant-id";
import { MenuItemId } from "../domain/menu-item-id";
import { MenuItem } from "../domain/menu-item.entity";
import { MenuCategory } from "../domain/menu-category.entity";
import { OperatingHoursProps } from "../domain/operating-hours.vo";
import { MerchantRepository } from "../infrastructure/merchant.repository";
import { MenuCategoryRepository } from "../infrastructure/menu-category.repository";
import {
  RegisterMerchantDto,
  UpdateMerchantDto,
  UpdateRatingDto,
  MerchantQueryDto,
  MenuSearchQueryDto,
  MatchedMenuItemDto,
  MenuSearchItemDto,
} from "./dtos/merchant.dto";
import { CreateMenuItemDto, UpdateMenuItemDto } from "./dtos/menu.dto";
import {
  CreateMenuCategoryDto,
  UpdateMenuCategoryDto,
} from "./dtos/menu-category.dto";
import { SetOperatingHoursDto } from "./dtos/operating-hours.dto";
import { UpdateCapacityDto } from "./dtos/capacity.dto";

@Injectable()
export class MerchantService {
  private readonly logger = new Logger(MerchantService.name);

  constructor(
    private readonly merchantRepository: MerchantRepository,
    private readonly menuCategoryRepository: MenuCategoryRepository,
    private readonly eventBus: EventBus,
    private readonly httpService: HttpService,
  ) {}

  // ===================== Merchant CRUD =====================

  async register(dto: RegisterMerchantDto): Promise<Merchant> {
    const result = Merchant.register({
      userId: dto.userId,
      name: dto.name,
      phone: dto.phone,
      address: dto.address,
      email: dto.email,
      description: dto.description,
      latitude: dto.latitude,
      longitude: dto.longitude,
      primaryCategory: dto.primaryCategory,
      secondaryCategories: dto.secondaryCategories,
    });

    if (result.isFailure) {
      throw result.error;
    }

    const merchant = result.value;
    await this.merchantRepository.save(merchant);

    const events = merchant.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }

    return merchant;
  }

  async update(id: string, dto: UpdateMerchantDto): Promise<Merchant> {
    const merchant = await this.merchantRepository.findByIdOrFail(
      MerchantId.from(id),
    );

    merchant.updateInfo({
      name: dto.name,
      description: dto.description,
      phone: dto.phone,
      email: dto.email,
      address: dto.address,
      logoUrl: dto.logoUrl,
      coverImageUrl: dto.coverImageUrl,
      latitude: dto.latitude,
      longitude: dto.longitude,
      primaryCategory: dto.primaryCategory,
      secondaryCategories: dto.secondaryCategories,
    });

    await this.merchantRepository.save(merchant);
    return merchant;
  }

  async updateRating(id: string, dto: UpdateRatingDto): Promise<Merchant> {
    const merchant = await this.merchantRepository.findByIdOrFail(
      MerchantId.from(id),
    );
    merchant.updateRating(dto.rating, dto.totalRatings);
    await this.merchantRepository.save(merchant);
    return merchant;
  }

  async findById(id: string): Promise<Merchant> {
    return this.merchantRepository.findByIdOrFail(MerchantId.from(id));
  }

  async findAll(query: MerchantQueryDto): Promise<{
    items: Merchant[];
    total: number;
    matchedMenuItems: Map<string, MatchedMenuItemDto[]>;
  }> {
    const result = await this.merchantRepository.findAll({
      status: query.status,
      search: query.search,
      category: query.category,
      categories: query.categories,
      minRating: query.minRating,
      openNow: query.openNow,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      skip: query.skip,
      take: query.take,
    });

    // When searching, tell the client which dishes matched (feature: search by dish)
    const matchedMenuItems = new Map<string, MatchedMenuItemDto[]>();
    if (query.search && result.items.length > 0) {
      const grouped = await this.merchantRepository.findMatchedMenuItems(
        result.items.map((m) => m.id.toString()),
        query.search,
      );
      for (const [merchantId, rows] of grouped) {
        matchedMenuItems.set(
          merchantId,
          rows.map((row) => ({
            id: row.id,
            name: row.name,
            price: Number(row.price),
            imageUrl: row.image_url,
          })),
        );
      }
    }

    return { items: result.items, total: result.total, matchedMenuItems };
  }

  /** Global dish search across all APPROVED merchants. */
  async searchMenuItems(
    dto: MenuSearchQueryDto,
  ): Promise<{ items: MenuSearchItemDto[]; total: number }> {
    const { rows, total } = await this.merchantRepository.searchMenuItems({
      q: dto.q,
      category: dto.category,
      skip: dto.skip ?? 0,
      take: dto.take ?? 20,
    });

    if (rows.length === 0) {
      return { items: [], total };
    }

    const merchantIds = Array.from(new Set(rows.map((r) => r.merchantId)));
    const merchants = await this.merchantRepository.findManyByIds(merchantIds);
    const merchantById = new Map(merchants.map((m) => [m.id.toString(), m]));

    const items: MenuSearchItemDto[] = [];
    for (const row of rows) {
      const merchant = merchantById.get(row.merchantId);
      if (!merchant) {
        continue;
      }
      const menuItem = merchant.menuItemList.find(
        (mi) => mi.id.toString() === row.menuItemId,
      );
      if (!menuItem) {
        continue;
      }
      items.push({
        id: menuItem.id.toString(),
        merchantId: row.merchantId,
        name: menuItem.itemName,
        description: menuItem.itemDescription,
        price: menuItem.itemPrice,
        imageUrl: menuItem.itemImageUrl,
        category: menuItem.itemCategory,
        isAvailable: menuItem.available,
        merchant: {
          id: merchant.id.toString(),
          name: merchant.merchantName,
          rating: merchant.merchantRating,
          address: merchant.merchantAddress,
          latitude: merchant.merchantLatitude,
          longitude: merchant.merchantLongitude,
          isOpen: merchant.merchantIsOpen,
          isOpenNow: merchant.isOpen(),
        },
      });
    }

    return { items, total };
  }

  /**
   * Resolve menu items (with merchant info) by a list of ids — used by the
   * favourite-dishes feature to display names even across devices/sessions.
   */
  async getMenuItemsByIds(ids: string[]): Promise<MenuSearchItemDto[]> {
    const uniqueIds = Array.from(
      new Set((ids ?? []).map((s) => String(s).trim()).filter(Boolean)),
    );
    if (uniqueIds.length === 0) {
      return [];
    }

    const menuItemEntities =
      await this.merchantRepository.findMenuItemsByIds(uniqueIds);
    if (menuItemEntities.length === 0) {
      return [];
    }

    const merchantIds = Array.from(
      new Set(menuItemEntities.map((e) => e.merchant_id)),
    );
    const merchants = await this.merchantRepository.findManyByIds(merchantIds);
    const merchantById = new Map(merchants.map((m) => [m.id.toString(), m]));

    const items: MenuSearchItemDto[] = [];
    for (const entity of menuItemEntities) {
      const merchant = merchantById.get(entity.merchant_id);
      if (!merchant) {
        continue;
      }
      const menuItem = merchant.menuItemList.find(
        (mi) => mi.id.toString() === entity.id,
      );
      if (!menuItem) {
        continue;
      }
      items.push({
        id: menuItem.id.toString(),
        merchantId: entity.merchant_id,
        name: menuItem.itemName,
        description: menuItem.itemDescription,
        price: menuItem.itemPrice,
        imageUrl: menuItem.itemImageUrl,
        category: menuItem.itemCategory,
        isAvailable: menuItem.available,
        merchant: {
          id: merchant.id.toString(),
          name: merchant.merchantName,
          rating: merchant.merchantRating,
          address: merchant.merchantAddress,
          latitude: merchant.merchantLatitude,
          longitude: merchant.merchantLongitude,
          isOpen: merchant.merchantIsOpen,
          isOpenNow: merchant.isOpen(),
        },
      });
    }

    return items;
  }

  async softDelete(id: string): Promise<void> {
    const merchant = await this.merchantRepository.findByIdOrFail(
      MerchantId.from(id),
    );
    await this.merchantRepository.delete(merchant);
  }

  // ===================== Admin Actions =====================

  async approve(id: string): Promise<Merchant> {
    const merchant = await this.merchantRepository.findByIdOrFail(
      MerchantId.from(id),
    );
    merchant.approve();
    await this.merchantRepository.save(merchant);
    return merchant;
  }

  async reject(id: string): Promise<Merchant> {
    const merchant = await this.merchantRepository.findByIdOrFail(
      MerchantId.from(id),
    );
    merchant.reject();
    await this.merchantRepository.save(merchant);
    return merchant;
  }

  // ===================== Menu Management =====================

  async addMenuItem(
    merchantId: string,
    dto: CreateMenuItemDto,
  ): Promise<MenuItem> {
    const merchant = await this.merchantRepository.findByIdOrFail(
      MerchantId.from(merchantId),
    );

    const menuItem = merchant.addMenuItem({
      category: dto.category,
      categoryId: dto.categoryId,
      name: dto.name,
      description: dto.description,
      price: dto.price,
      imageUrl: dto.imageUrl,
      isFeatured: dto.isFeatured,
      preparationTime: dto.preparationTime,
      optionGroups: dto.optionGroups as any,
    });

    await this.merchantRepository.save(merchant);

    const events = merchant.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }

    return menuItem;
  }

  async getMenuItems(
    merchantId: string,
    includeUnavailable = false,
  ): Promise<MenuItem[]> {
    const merchant = await this.merchantRepository.findByIdOrFail(
      MerchantId.from(merchantId),
    );
    return includeUnavailable
      ? [...merchant.menuItemList]
      : [...merchant.activeMenuItems];
  }

  async getMenuItem(merchantId: string, itemId: string): Promise<MenuItem> {
    const merchant = await this.merchantRepository.findByIdOrFail(
      MerchantId.from(merchantId),
    );
    const menuItem = merchant.menuItemList.find(
      (mi) => mi.id.toString() === itemId,
    );
    if (!menuItem) {
      throw new Error(`Menu item ${itemId} not found`);
    }
    return menuItem;
  }

  async updateMenuItem(
    merchantId: string,
    itemId: string,
    dto: UpdateMenuItemDto,
  ): Promise<MenuItem> {
    const merchant = await this.merchantRepository.findByIdOrFail(
      MerchantId.from(merchantId),
    );

    const menuItem = merchant.updateMenuItem(MenuItemId.from(itemId), {
      category: dto.category,
      categoryId: dto.categoryId,
      name: dto.name,
      description: dto.description,
      price: dto.price,
      imageUrl: dto.imageUrl,
      isFeatured: dto.isFeatured,
      preparationTime: dto.preparationTime,
      optionGroups: dto.optionGroups as any,
    });

    await this.merchantRepository.save(merchant);

    const events = merchant.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }

    return menuItem;
  }

  async deleteMenuItem(merchantId: string, itemId: string): Promise<void> {
    const merchant = await this.merchantRepository.findByIdOrFail(
      MerchantId.from(merchantId),
    );
    merchant.removeMenuItem(MenuItemId.from(itemId));
    await this.merchantRepository.save(merchant);

    const events = merchant.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }
  }

  async toggleMenuItem(merchantId: string, itemId: string): Promise<MenuItem> {
    const merchant = await this.merchantRepository.findByIdOrFail(
      MerchantId.from(merchantId),
    );
    const menuItem = merchant.toggleMenuItem(MenuItemId.from(itemId));
    await this.merchantRepository.save(merchant);

    const events = merchant.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }

    return menuItem;
  }

  // ===================== Menu Categories =====================

  async getMenuCategories(merchantId: string): Promise<MenuCategory[]> {
    await this.merchantRepository.findByIdOrFail(MerchantId.from(merchantId));
    return this.menuCategoryRepository.findByMerchantId(merchantId);
  }

  async addMenuCategory(
    merchantId: string,
    dto: CreateMenuCategoryDto,
  ): Promise<MenuCategory> {
    await this.merchantRepository.findByIdOrFail(MerchantId.from(merchantId));
    const category = MenuCategory.create({
      merchantId,
      name: dto.name,
      sortOrder: dto.sortOrder,
    });
    await this.menuCategoryRepository.save(merchantId, category);
    return category;
  }

  async updateMenuCategory(
    merchantId: string,
    categoryId: string,
    dto: UpdateMenuCategoryDto,
  ): Promise<MenuCategory> {
    await this.merchantRepository.findByIdOrFail(MerchantId.from(merchantId));
    const category = await this.menuCategoryRepository.findById(
      merchantId,
      categoryId,
    );
    if (!category) {
      throw new Error(`Menu category ${categoryId} not found`);
    }
    if (dto.name !== undefined) category.updateName(dto.name);
    if (dto.sortOrder !== undefined) category.updateSortOrder(dto.sortOrder);
    await this.menuCategoryRepository.save(merchantId, category);
    return category;
  }

  async deleteMenuCategory(
    merchantId: string,
    categoryId: string,
  ): Promise<void> {
    await this.merchantRepository.findByIdOrFail(MerchantId.from(merchantId));
    await this.menuCategoryRepository.delete(merchantId, categoryId);
  }

  // ===================== Operating Hours =====================

  async setOperatingHours(
    merchantId: string,
    dto: SetOperatingHoursDto,
  ): Promise<void> {
    const merchant = await this.merchantRepository.findByIdOrFail(
      MerchantId.from(merchantId),
    );

    const hours: OperatingHoursProps[] = dto.hours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      openTime: h.openTime,
      closeTime: h.closeTime,
      isClosed: h.isClosed,
      specialDate: h.specialDate,
    }));

    merchant.setOperatingHours(hours);
    await this.merchantRepository.save(merchant);
  }

  async getOperatingHours(merchantId: string) {
    const merchant = await this.merchantRepository.findByIdOrFail(
      MerchantId.from(merchantId),
    );
    return merchant.operatingHoursList.map((oh) => ({
      dayOfWeek: oh.dayOfWeek,
      openTime: oh.openTime,
      closeTime: oh.closeTime,
      isClosed: oh.isClosed,
      specialDate: oh.specialDate,
    }));
  }

  async isOpen(merchantId: string): Promise<{ isOpen: boolean }> {
    const merchant = await this.merchantRepository.findByIdOrFail(
      MerchantId.from(merchantId),
    );
    return { isOpen: merchant.isOpen() };
  }

  async toggleOpen(merchantId: string): Promise<Merchant> {
    const merchant = await this.merchantRepository.findByIdOrFail(
      MerchantId.from(merchantId),
    );
    merchant.setOpen(!merchant.merchantIsOpen);
    await this.merchantRepository.save(merchant);

    const events = merchant.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }
    return merchant;
  }

  // ===================== Capacity Management =====================

  async updateCapacity(merchantId: string, dto: UpdateCapacityDto) {
    const merchant = await this.merchantRepository.findByIdOrFail(
      MerchantId.from(merchantId),
    );
    merchant.updateCapacityConfig({
      maxConcurrentOrders: dto.maxConcurrentOrders,
      prepTimePerOrder: dto.prepTimePerOrder,
    });
    await this.merchantRepository.save(merchant);
    return this.getCapacityInfo(merchant);
  }

  async getCapacity(merchantId: string) {
    const merchant = await this.merchantRepository.findByIdOrFail(
      MerchantId.from(merchantId),
    );
    return this.getCapacityInfo(merchant);
  }

  async getCapacityStatus(merchantId: string) {
    const merchant = await this.merchantRepository.findByIdOrFail(
      MerchantId.from(merchantId),
    );
    return {
      status: merchant.merchantCapacityStatus,
      currentOrderCount: merchant.merchantCurrentOrderCount,
      maxConcurrentOrders: merchant.merchantCapacityConfig.maxConcurrentOrders,
      prepTimePerOrder: merchant.merchantCapacityConfig.prepTimePerOrder,
    };
  }

  // ---- Stats (B7): orchestrate order-service + review-service ----
  async getStats(id: string, period: string): Promise<any> {
    const merchant = await this.merchantRepository.findByIdOrFail(
      MerchantId.from(id),
    );
    const { startDate, endDate } = this.periodToRange(period);

    const orderStats = await this.fetchOrderStats(id, startDate, endDate);
    const reviewSummary = await this.fetchReviewSummary(id);

    return {
      merchantId: id,
      period,
      totalOrders: orderStats?.totalOrders ?? merchant.merchantTotalOrders ?? 0,
      totalRevenue: orderStats?.totalRevenue ?? 0,
      averageRating:
        reviewSummary?.averageRating ?? merchant.merchantRating ?? 0,
      pendingOrders: orderStats?.pendingOrders ?? 0,
      revenueByDay: orderStats?.revenueByDay ?? [],
      topItems: orderStats?.topItems ?? [],
    };
  }

  // ---- Reviews (B7): delegate to review-service ----
  async getReviews(
    id: string,
    params: { skip: number; take: number; rating?: number },
  ): Promise<any> {
    await this.merchantRepository.findByIdOrFail(MerchantId.from(id));

    const url = process.env.REVIEW_SERVICE_URL || "http://review-service:3011";
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    const res = await firstValueFrom(
      this.httpService.get(`${url}/api/v1/reviews/merchant/${id}`, {
        params: { skip: params.skip, take: params.take, rating: params.rating },
        headers: { "x-service-key": serviceKey },
      }),
    );

    const data: any = res.data ?? {};
    return {
      items: data.data ?? [],
      total: data.total ?? 0,
      averageRating: data.averageRating ?? 0,
      ratingDistribution: data.ratingDistribution ?? {},
    };
  }

  private periodToRange(period: string): {
    startDate?: string;
    endDate?: string;
  } {
    const endDate = new Date().toISOString();
    let startDate: string | undefined;
    switch (period) {
      case "7days":
      case "week":
        startDate = new Date(Date.now() - 7 * 86400000).toISOString();
        break;
      case "30days":
      case "month":
        startDate = new Date(Date.now() - 30 * 86400000).toISOString();
        break;
      case "today":
      default:
        startDate = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
        break;
    }
    return { startDate, endDate };
  }

  private async fetchOrderStats(
    merchantId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<any | null> {
    const url = process.env.ORDER_SERVICE_URL || "http://order-service:3004";
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      const res = await firstValueFrom(
        this.httpService.get(
          `${url}/api/v1/orders/stats/merchant/${merchantId}`,
          {
            params: { startDate, endDate },
            headers: { "x-service-key": serviceKey },
          },
        ),
      );
      return res.data;
    } catch (err: any) {
      this.logger.warn(
        `Failed to fetch order stats for ${merchantId}: ${err?.message}`,
      );
      return null;
    }
  }

  private async fetchReviewSummary(merchantId: string): Promise<any | null> {
    const url = process.env.REVIEW_SERVICE_URL || "http://review-service:3011";
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      const res = await firstValueFrom(
        this.httpService.get(`${url}/api/v1/reviews/merchant/${merchantId}`, {
          params: { skip: 0, take: 1 },
          headers: { "x-service-key": serviceKey },
        }),
      );
      return res.data;
    } catch (err: any) {
      this.logger.warn(
        `Failed to fetch review summary for ${merchantId}: ${err?.message}`,
      );
      return null;
    }
  }

  private getCapacityInfo(merchant: Merchant) {
    return {
      maxConcurrentOrders: merchant.merchantCapacityConfig.maxConcurrentOrders,
      prepTimePerOrder: merchant.merchantCapacityConfig.prepTimePerOrder,
      capacityStatus: merchant.merchantCapacityStatus,
      currentOrderCount: merchant.merchantCurrentOrderCount,
    };
  }
}
