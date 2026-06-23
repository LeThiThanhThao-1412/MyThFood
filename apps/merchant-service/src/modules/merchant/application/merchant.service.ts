import { Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { Merchant } from '../domain/merchant.aggregate';
import { MerchantId } from '../domain/merchant-id';
import { MenuItemId } from '../domain/menu-item-id';
import { MenuItem, MenuItemCategory } from '../domain/menu-item.entity';
import { OperatingHoursProps } from '../domain/operating-hours.vo';
import { MerchantRepository } from '../infrastructure/merchant.repository';
import {
  RegisterMerchantDto,
  UpdateMerchantDto,
  MerchantQueryDto,
} from './dtos/merchant.dto';
import { CreateMenuItemDto, UpdateMenuItemDto } from './dtos/menu.dto';
import { SetOperatingHoursDto } from './dtos/operating-hours.dto';
import { UpdateCapacityDto } from './dtos/capacity.dto';

@Injectable()
export class MerchantService {
  constructor(
    private readonly merchantRepository: MerchantRepository,
    private readonly eventBus: EventBus,
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
    });

    if (result.isFailure) {
      throw result.error;
    }

    const merchant = result.value;
    await this.merchantRepository.save(merchant);

    // Publish events
    const events = merchant.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }

    return merchant;
  }

  async update(id: string, dto: UpdateMerchantDto): Promise<Merchant> {
    const merchant = await this.merchantRepository.findByIdOrFail(MerchantId.from(id));

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
    });

    await this.merchantRepository.save(merchant);
    return merchant;
  }

  async findById(id: string): Promise<Merchant> {
    return this.merchantRepository.findByIdOrFail(MerchantId.from(id));
  }

  async findAll(query: MerchantQueryDto): Promise<{ items: Merchant[]; total: number }> {
    return this.merchantRepository.findAll({
      status: query.status,
      search: query.search,
      skip: query.skip,
      take: query.take,
    });
  }

  async softDelete(id: string): Promise<void> {
    const merchant = await this.merchantRepository.findByIdOrFail(MerchantId.from(id));
    await this.merchantRepository.delete(merchant);
  }

  // ===================== Admin Actions =====================

  async approve(id: string): Promise<Merchant> {
    const merchant = await this.merchantRepository.findByIdOrFail(MerchantId.from(id));
    merchant.approve();
    await this.merchantRepository.save(merchant);
    return merchant;
  }

  async reject(id: string): Promise<Merchant> {
    const merchant = await this.merchantRepository.findByIdOrFail(MerchantId.from(id));
    merchant.reject();
    await this.merchantRepository.save(merchant);
    return merchant;
  }

  // ===================== Menu Management =====================

  async addMenuItem(merchantId: string, dto: CreateMenuItemDto): Promise<MenuItem> {
    const merchant = await this.merchantRepository.findByIdOrFail(MerchantId.from(merchantId));

    const menuItem = merchant.addMenuItem({
      category: dto.category as MenuItemCategory,
      name: dto.name,
      description: dto.description,
      price: dto.price,
      imageUrl: dto.imageUrl,
      isFeatured: dto.isFeatured,
      preparationTime: dto.preparationTime,
    });

    await this.merchantRepository.save(merchant);

    // Publish domain events
    const events = merchant.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }

    return menuItem;
  }

  async getMenuItems(merchantId: string): Promise<MenuItem[]> {
    const merchant = await this.merchantRepository.findByIdOrFail(MerchantId.from(merchantId));
    return [...merchant.activeMenuItems];
  }

  async getMenuItem(merchantId: string, itemId: string): Promise<MenuItem> {
    const merchant = await this.merchantRepository.findByIdOrFail(MerchantId.from(merchantId));
    const menuItem = merchant.menuItemList.find((mi) => mi.id.toString() === itemId);
    if (!menuItem) {
      throw new Error(`Menu item ${itemId} not found`);
    }
    return menuItem;
  }

  async updateMenuItem(merchantId: string, itemId: string, dto: UpdateMenuItemDto): Promise<MenuItem> {
    const merchant = await this.merchantRepository.findByIdOrFail(MerchantId.from(merchantId));

    const menuItem = merchant.updateMenuItem(MenuItemId.from(itemId), {
      category: dto.category as MenuItemCategory,
      name: dto.name,
      description: dto.description,
      price: dto.price,
      imageUrl: dto.imageUrl,
      isFeatured: dto.isFeatured,
      preparationTime: dto.preparationTime,
    });

    await this.merchantRepository.save(merchant);

    const events = merchant.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }

    return menuItem;
  }

  async deleteMenuItem(merchantId: string, itemId: string): Promise<void> {
    const merchant = await this.merchantRepository.findByIdOrFail(MerchantId.from(merchantId));
    merchant.removeMenuItem(MenuItemId.from(itemId));
    await this.merchantRepository.save(merchant);

    const events = merchant.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }
  }

  async toggleMenuItem(merchantId: string, itemId: string): Promise<MenuItem> {
    const merchant = await this.merchantRepository.findByIdOrFail(MerchantId.from(merchantId));
    const menuItem = merchant.toggleMenuItem(MenuItemId.from(itemId));
    await this.merchantRepository.save(merchant);

    const events = merchant.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }

    return menuItem;
  }

  // ===================== Operating Hours =====================

  async setOperatingHours(merchantId: string, dto: SetOperatingHoursDto): Promise<void> {
    const merchant = await this.merchantRepository.findByIdOrFail(MerchantId.from(merchantId));

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
    const merchant = await this.merchantRepository.findByIdOrFail(MerchantId.from(merchantId));
    return merchant.operatingHoursList.map((oh) => ({
      dayOfWeek: oh.dayOfWeek,
      openTime: oh.openTime,
      closeTime: oh.closeTime,
      isClosed: oh.isClosed,
      specialDate: oh.specialDate,
    }));
  }

  async isOpen(merchantId: string): Promise<{ isOpen: boolean }> {
    const merchant = await this.merchantRepository.findByIdOrFail(MerchantId.from(merchantId));
    return { isOpen: merchant.isOpen() };
  }

  // ===================== Capacity Management =====================

  async updateCapacity(merchantId: string, dto: UpdateCapacityDto) {
    const merchant = await this.merchantRepository.findByIdOrFail(MerchantId.from(merchantId));
    merchant.updateCapacityConfig({
      maxConcurrentOrders: dto.maxConcurrentOrders,
      prepTimePerOrder: dto.prepTimePerOrder,
    });
    await this.merchantRepository.save(merchant);
    return this.getCapacityInfo(merchant);
  }

  async getCapacity(merchantId: string) {
    const merchant = await this.merchantRepository.findByIdOrFail(MerchantId.from(merchantId));
    return this.getCapacityInfo(merchant);
  }

  async getCapacityStatus(merchantId: string) {
    const merchant = await this.merchantRepository.findByIdOrFail(MerchantId.from(merchantId));
    return {
      status: merchant.merchantCapacityStatus,
      currentOrderCount: merchant.merchantCurrentOrderCount,
      maxConcurrentOrders: merchant.merchantCapacityConfig.maxConcurrentOrders,
      prepTimePerOrder: merchant.merchantCapacityConfig.prepTimePerOrder,
    };
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