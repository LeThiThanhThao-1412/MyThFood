import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Roles, RolesGuard } from "@mythfood/common";
import { ServiceKeyOrJwtGuard } from "../../auth/service-key-or-jwt.guard";
import { MerchantService } from "../application/merchant.service";
import {
  RegisterMerchantDto,
  UpdateMerchantDto,
  UpdateRatingDto,
  MerchantQueryDto,
  MerchantResponseDto,
} from "../application/dtos/merchant.dto";
import {
  CreateMenuItemDto,
  UpdateMenuItemDto,
  MenuItemResponseDto,
} from "../application/dtos/menu.dto";
import {
  CreateMenuCategoryDto,
  UpdateMenuCategoryDto,
  MenuCategoryResponseDto,
} from "../application/dtos/menu-category.dto";
import {
  SetOperatingHoursDto,
  OperatingHoursResponseDto,
} from "../application/dtos/operating-hours.dto";
import {
  UpdateCapacityDto,
  CapacityResponseDto,
  CapacityStatusResponseDto,
} from "../application/dtos/capacity.dto";
import { Merchant } from "../domain/merchant.aggregate";
import { MenuItem } from "../domain/menu-item.entity";
import { MenuCategory } from "../domain/menu-category.entity";

@Controller("merchants")
@UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
export class MerchantController {
  constructor(private readonly merchantService: MerchantService) {}

  // ===================== Merchant CRUD =====================

  @Post()
  @Roles("MERCHANT_OWNER", "ADMIN")
  async register(
    @Body() dto: RegisterMerchantDto,
  ): Promise<MerchantResponseDto> {
    const merchant = await this.merchantService.register(dto);
    return this.toMerchantResponse(merchant);
  }

  @Get()
  async findAll(@Query() query: MerchantQueryDto) {
    const result = await this.merchantService.findAll(query);
    return {
      items: result.items.map((m) => this.toMerchantResponse(m)),
      total: result.total,
    };
  }

  @Get(":id")
  async findById(@Param("id") id: string): Promise<MerchantResponseDto> {
    const merchant = await this.merchantService.findById(id);
    return this.toMerchantResponse(merchant);
  }

  @Put(":id")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateMerchantDto,
  ): Promise<MerchantResponseDto> {
    const merchant = await this.merchantService.update(id, dto);
    return this.toMerchantResponse(merchant);
  }

  @Delete(":id")
  @Roles("ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param("id") id: string): Promise<void> {
    await this.merchantService.softDelete(id);
  }

  @Patch(":id/rating")
  @Roles("ADMIN", "MERCHANT_OWNER")
  async updateRating(
    @Param("id") id: string,
    @Body() dto: UpdateRatingDto,
  ): Promise<MerchantResponseDto> {
    const merchant = await this.merchantService.updateRating(id, dto);
    return this.toMerchantResponse(merchant);
  }

  // ===================== Admin APIs =====================

  @Put(":id/approve")
  @Roles("ADMIN")
  async approve(@Param("id") id: string): Promise<MerchantResponseDto> {
    const merchant = await this.merchantService.approve(id);
    return this.toMerchantResponse(merchant);
  }

  @Put(":id/reject")
  @Roles("ADMIN")
  async reject(@Param("id") id: string): Promise<MerchantResponseDto> {
    const merchant = await this.merchantService.reject(id);
    return this.toMerchantResponse(merchant);
  }

  // ===================== Menu Management =====================

  @Post(":id/menu/items")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async addMenuItem(
    @Param("id") id: string,
    @Body() dto: CreateMenuItemDto,
  ): Promise<MenuItemResponseDto> {
    const menuItem = await this.merchantService.addMenuItem(id, dto);
    return this.toMenuItemResponse(menuItem);
  }

  @Get(":id/menu")
  async getMenuItems(
    @Param("id") id: string,
    @Query("includeUnavailable") includeUnavailable?: string,
  ): Promise<MenuItemResponseDto[]> {
    const menuItems = await this.merchantService.getMenuItems(
      id,
      includeUnavailable === "true",
    );
    return menuItems.map((mi) => this.toMenuItemResponse(mi));
  }

  @Get(":id/menu/:itemId")
  async getMenuItem(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
  ): Promise<MenuItemResponseDto> {
    const menuItem = await this.merchantService.getMenuItem(id, itemId);
    return this.toMenuItemResponse(menuItem);
  }

  @Put(":id/menu/:itemId")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async updateMenuItem(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() dto: UpdateMenuItemDto,
  ): Promise<MenuItemResponseDto> {
    const menuItem = await this.merchantService.updateMenuItem(id, itemId, dto);
    return this.toMenuItemResponse(menuItem);
  }

  @Delete(":id/menu/:itemId")
  @Roles("MERCHANT_OWNER", "ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMenuItem(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
  ): Promise<void> {
    await this.merchantService.deleteMenuItem(id, itemId);
  }

  @Patch(":id/menu/:itemId/available")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async toggleMenuItem(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
  ): Promise<MenuItemResponseDto> {
    const menuItem = await this.merchantService.toggleMenuItem(id, itemId);
    return this.toMenuItemResponse(menuItem);
  }

  // ===================== Menu Categories =====================

  @Get(":id/menu-categories")
  async getMenuCategories(
    @Param("id") id: string,
  ): Promise<MenuCategoryResponseDto[]> {
    const categories = await this.merchantService.getMenuCategories(id);
    return categories.map((c) => this.toMenuCategoryResponse(c));
  }

  @Post(":id/menu-categories")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async addMenuCategory(
    @Param("id") id: string,
    @Body() dto: CreateMenuCategoryDto,
  ): Promise<MenuCategoryResponseDto> {
    const category = await this.merchantService.addMenuCategory(id, dto);
    return this.toMenuCategoryResponse(category);
  }

  @Put(":id/menu-categories/:categoryId")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async updateMenuCategory(
    @Param("id") id: string,
    @Param("categoryId") categoryId: string,
    @Body() dto: UpdateMenuCategoryDto,
  ): Promise<MenuCategoryResponseDto> {
    const category = await this.merchantService.updateMenuCategory(
      id,
      categoryId,
      dto,
    );
    return this.toMenuCategoryResponse(category);
  }

  @Delete(":id/menu-categories/:categoryId")
  @Roles("MERCHANT_OWNER", "ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMenuCategory(
    @Param("id") id: string,
    @Param("categoryId") categoryId: string,
  ): Promise<void> {
    await this.merchantService.deleteMenuCategory(id, categoryId);
  }

  // ===================== Operating Hours =====================

  @Put(":id/operating-hours")
  @Roles("MERCHANT_OWNER", "ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setOperatingHours(
    @Param("id") id: string,
    @Body() dto: SetOperatingHoursDto,
  ): Promise<void> {
    await this.merchantService.setOperatingHours(id, dto);
  }

  @Get(":id/operating-hours")
  async getOperatingHours(
    @Param("id") id: string,
  ): Promise<OperatingHoursResponseDto[]> {
    return this.merchantService.getOperatingHours(id);
  }

  @Get(":id/is-open")
  async isOpen(@Param("id") id: string): Promise<{ isOpen: boolean }> {
    return this.merchantService.isOpen(id);
  }

  @Patch(":id/toggle-open")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async toggleOpen(@Param("id") id: string): Promise<MerchantResponseDto> {
    const merchant = await this.merchantService.toggleOpen(id);
    return this.toMerchantResponse(merchant);
  }

  // ===================== Capacity Management =====================

  @Put(":id/capacity")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async updateCapacity(
    @Param("id") id: string,
    @Body() dto: UpdateCapacityDto,
  ): Promise<CapacityResponseDto> {
    return this.merchantService.updateCapacity(id, dto);
  }

  @Get(":id/capacity")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async getCapacity(@Param("id") id: string): Promise<CapacityResponseDto> {
    return this.merchantService.getCapacity(id);
  }

  @Get(":id/capacity/status")
  async getCapacityStatus(
    @Param("id") id: string,
  ): Promise<CapacityStatusResponseDto> {
    return this.merchantService.getCapacityStatus(id);
  }

  // ===================== Stats & Reviews (B7) =====================

  @Get(":id/stats")
  @Roles("MERCHANT_OWNER", "ADMIN")
  async getMerchantStats(
    @Param("id") id: string,
    @Query("period") period?: string,
  ) {
    return this.merchantService.getStats(id, period || "today");
  }

  @Get(":id/reviews")
  async getMerchantReviews(
    @Param("id") id: string,
    @Query("skip") skip?: string,
    @Query("take") take?: string,
    @Query("rating") rating?: string,
  ) {
    return this.merchantService.getReviews(id, {
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 20,
      rating: rating ? parseInt(rating, 10) : undefined,
    });
  }

  // ===================== Mapping Helpers =====================

  private toMerchantResponse(merchant: Merchant): MerchantResponseDto {
    return {
      id: merchant.id.toString(),
      userId: merchant.ownerId,
      name: merchant.merchantName,
      description: merchant.merchantDescription,
      logoUrl: merchant.merchantLogoUrl,
      coverImageUrl: merchant.merchantCoverImageUrl,
      phone: merchant.merchantPhone,
      email: merchant.merchantEmail,
      address: merchant.merchantAddress,
      latitude: merchant.merchantLatitude,
      longitude: merchant.merchantLongitude,
      status: merchant.merchantStatus,
      rating: merchant.merchantRating,
      totalRatings: merchant.merchantTotalRatings,
      totalOrders: merchant.merchantTotalOrders,
      capacityStatus: merchant.merchantCapacityStatus,
      currentOrderCount: merchant.merchantCurrentOrderCount,
      primaryCategory: merchant.merchantPrimaryCategory,
      secondaryCategories: merchant.merchantSecondaryCategories,
      isOpen: merchant.merchantIsOpen,
      isOpenNow: merchant.isOpen(),
      createdAt: merchant.createdAt,
      updatedAt: merchant.updatedAt,
    };
  }

  private toMenuItemResponse(menuItem: MenuItem): MenuItemResponseDto {
    return {
      id: menuItem.id.toString(),
      merchantId: menuItem.merchant.toString(),
      category: menuItem.itemCategory,
      categoryId: menuItem.itemCategoryId,
      name: menuItem.itemName,
      description: menuItem.itemDescription,
      price: menuItem.itemPrice,
      originalPrice: menuItem.itemOriginalPrice,
      imageUrl: menuItem.itemImageUrl,
      isAvailable: menuItem.available,
      isFeatured: menuItem.featured,
      preparationTime: menuItem.prepTime,
      sortOrder: menuItem.order,
      optionGroups: menuItem.itemOptionGroups as any,
      createdAt: menuItem.createdAt,
      updatedAt: menuItem.updatedAt,
    };
  }

  private toMenuCategoryResponse(
    category: MenuCategory,
  ): MenuCategoryResponseDto {
    return {
      id: category.id,
      merchantId: category.merchantId,
      name: category.name,
      sortOrder: category.sortOrder,
    };
  }
}
