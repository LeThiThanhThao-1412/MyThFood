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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MerchantService } from '../application/merchant.service';
import {
  RegisterMerchantDto,
  UpdateMerchantDto,
  MerchantQueryDto,
  MerchantResponseDto,
} from '../application/dtos/merchant.dto';
import {
  CreateMenuItemDto,
  UpdateMenuItemDto,
  MenuItemResponseDto,
} from '../application/dtos/menu.dto';
import { SetOperatingHoursDto, OperatingHoursResponseDto } from '../application/dtos/operating-hours.dto';
import { UpdateCapacityDto, CapacityResponseDto, CapacityStatusResponseDto } from '../application/dtos/capacity.dto';
import { Merchant } from '../domain/merchant.aggregate';
import { MenuItem } from '../domain/menu-item.entity';

@Controller('merchants')
@UseGuards(AuthGuard('jwt'))
export class MerchantController {
  constructor(private readonly merchantService: MerchantService) {}

  // ===================== Merchant CRUD =====================

  @Post()
  async register(@Body() dto: RegisterMerchantDto): Promise<MerchantResponseDto> {
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

  @Get(':id')
  async findById(@Param('id') id: string): Promise<MerchantResponseDto> {
    const merchant = await this.merchantService.findById(id);
    return this.toMerchantResponse(merchant);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMerchantDto,
  ): Promise<MerchantResponseDto> {
    const merchant = await this.merchantService.update(id, dto);
    return this.toMerchantResponse(merchant);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    await this.merchantService.softDelete(id);
  }

  // ===================== Admin APIs =====================

  @Put(':id/approve')
  async approve(@Param('id') id: string): Promise<MerchantResponseDto> {
    const merchant = await this.merchantService.approve(id);
    return this.toMerchantResponse(merchant);
  }

  @Put(':id/reject')
  async reject(
    @Param('id') id: string,
  ): Promise<MerchantResponseDto> {
    const merchant = await this.merchantService.reject(id);
    return this.toMerchantResponse(merchant);
  }

  // ===================== Menu Management =====================

  @Post(':id/menu/items')
  async addMenuItem(
    @Param('id') id: string,
    @Body() dto: CreateMenuItemDto,
  ): Promise<MenuItemResponseDto> {
    const menuItem = await this.merchantService.addMenuItem(id, dto);
    return this.toMenuItemResponse(menuItem);
  }

  @Get(':id/menu')
  async getMenuItems(@Param('id') id: string): Promise<MenuItemResponseDto[]> {
    const menuItems = await this.merchantService.getMenuItems(id);
    return menuItems.map((mi) => this.toMenuItemResponse(mi));
  }

  @Get(':id/menu/:itemId')
  async getMenuItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ): Promise<MenuItemResponseDto> {
    const menuItem = await this.merchantService.getMenuItem(id, itemId);
    return this.toMenuItemResponse(menuItem);
  }

  @Put(':id/menu/:itemId')
  async updateMenuItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateMenuItemDto,
  ): Promise<MenuItemResponseDto> {
    const menuItem = await this.merchantService.updateMenuItem(id, itemId, dto);
    return this.toMenuItemResponse(menuItem);
  }

  @Delete(':id/menu/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMenuItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    await this.merchantService.deleteMenuItem(id, itemId);
  }

  @Patch(':id/menu/:itemId/available')
  async toggleMenuItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ): Promise<MenuItemResponseDto> {
    const menuItem = await this.merchantService.toggleMenuItem(id, itemId);
    return this.toMenuItemResponse(menuItem);
  }

  // ===================== Operating Hours =====================

  @Put(':id/operating-hours')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setOperatingHours(
    @Param('id') id: string,
    @Body() dto: SetOperatingHoursDto,
  ): Promise<void> {
    await this.merchantService.setOperatingHours(id, dto);
  }

  @Get(':id/operating-hours')
  async getOperatingHours(@Param('id') id: string): Promise<OperatingHoursResponseDto[]> {
    return this.merchantService.getOperatingHours(id);
  }

  @Get(':id/is-open')
  async isOpen(@Param('id') id: string): Promise<{ isOpen: boolean }> {
    return this.merchantService.isOpen(id);
  }

  // ===================== Capacity Management =====================

  @Put(':id/capacity')
  async updateCapacity(
    @Param('id') id: string,
    @Body() dto: UpdateCapacityDto,
  ): Promise<CapacityResponseDto> {
    return this.merchantService.updateCapacity(id, dto);
  }

  @Get(':id/capacity')
  async getCapacity(@Param('id') id: string): Promise<CapacityResponseDto> {
    return this.merchantService.getCapacity(id);
  }

  @Get(':id/capacity/status')
  async getCapacityStatus(@Param('id') id: string): Promise<CapacityStatusResponseDto> {
    return this.merchantService.getCapacityStatus(id);
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
      totalOrders: merchant.merchantTotalOrders,
      capacityStatus: merchant.merchantCapacityStatus,
      currentOrderCount: merchant.merchantCurrentOrderCount,
      createdAt: merchant.createdAt,
      updatedAt: merchant.updatedAt,
    };
  }

  private toMenuItemResponse(menuItem: MenuItem): MenuItemResponseDto {
    return {
      id: menuItem.id.toString(),
      merchantId: menuItem.merchant.toString(),
      category: menuItem.itemCategory,
      name: menuItem.itemName,
      description: menuItem.itemDescription,
      price: menuItem.itemPrice,
      originalPrice: menuItem.itemOriginalPrice,
      imageUrl: menuItem.itemImageUrl,
      isAvailable: menuItem.available,
      isFeatured: menuItem.featured,
      preparationTime: menuItem.prepTime,
      sortOrder: menuItem.order,
      createdAt: menuItem.createdAt,
      updatedAt: menuItem.updatedAt,
    };
  }
}