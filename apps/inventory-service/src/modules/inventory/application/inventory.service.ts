import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventBus } from '@nestjs/cqrs';
import { Inventory } from '../domain/inventory.aggregate';
import { InventoryId } from '../domain/inventory-id';
import { InventoryRepository } from '../infrastructure/inventory.repository';
import {
  CreateInventoryDto,
  ReserveDto,
  ReleaseDto,
  ConsumeDto,
  UpdateTotalDto,
} from './dtos/inventory.dto';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly inventoryRepository: InventoryRepository,
    private readonly eventBus: EventBus,
  ) {}

  // ===================== CRUD =====================

  async create(dto: CreateInventoryDto): Promise<Inventory> {
    const result = Inventory.create({
      menuItemId: dto.menuItemId,
      merchantId: dto.merchantId,
      totalQuantity: dto.totalQuantity,
      lowStockThreshold: dto.lowStockThreshold,
    });
    if (result.isFailure) throw result.error;
    const inv = result.value;
    await this.inventoryRepository.save(inv);
    return inv;
  }

  async findById(id: string): Promise<Inventory> {
    return this.inventoryRepository.findByIdOrFail(InventoryId.from(id));
  }

  async findByMenuItemId(menuItemId: string): Promise<Inventory> {
    const inv = await this.inventoryRepository.findByMenuItemId(menuItemId);
    if (!inv) throw new Error(`Inventory for menu item ${menuItemId} not found`);
    return inv;
  }

  async findByMerchantId(merchantId: string): Promise<Inventory[]> {
    return this.inventoryRepository.findByMerchantId(merchantId);
  }

  async findAll(): Promise<Inventory[]> {
    return this.inventoryRepository.findAll();
  }

  async updateTotal(id: string, dto: UpdateTotalDto): Promise<Inventory> {
    const inv = await this.inventoryRepository.findByIdOrFail(InventoryId.from(id));
    inv.updateTotal(dto.totalQuantity);
    await this.inventoryRepository.save(inv);
    return inv;
  }

  // ===================== Core Operations =====================

  async reserve(id: string, dto: ReserveDto): Promise<Inventory> {
    const inv = await this.inventoryRepository.findByIdOrFail(InventoryId.from(id));
    inv.reserve(dto.orderId, dto.quantity, dto.timeoutMinutes ?? 5);
    await this.inventoryRepository.save(inv);

    const events = inv.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }
    return inv;
  }

  async release(id: string, dto: ReleaseDto): Promise<Inventory> {
    const inv = await this.inventoryRepository.findByIdOrFail(InventoryId.from(id));
    inv.release(dto.orderId, dto.reason);
    await this.inventoryRepository.save(inv);

    const events = inv.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }
    return inv;
  }

  async consume(id: string, dto: ConsumeDto): Promise<Inventory> {
    const inv = await this.inventoryRepository.findByIdOrFail(InventoryId.from(id));
    inv.consume(dto.orderId);
    await this.inventoryRepository.save(inv);

    const events = inv.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }
    return inv;
  }

  // ===================== Reservation Timeout (Cron) =====================

  /**
   * Chạy mỗi phút để release các reservation đã quá hạn 5 phút.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleReservationTimeout(): Promise<void> {
    this.logger.log('Checking for expired reservations...');
    try {
      const expired = await this.inventoryRepository.findExpiredReservations();
      let releasedCount = 0;

      for (const { inventory, expiredOrderIds } of expired) {
        for (const orderId of expiredOrderIds) {
          inventory.release(orderId, 'Reservation timeout (5 minutes)');
          const events = inventory.pullDomainEvents();
          for (const event of events) {
            this.eventBus.publish(event);
          }
          releasedCount++;
          this.logger.log(`Released reservation for order ${orderId} on inventory ${inventory.id}`);
        }
        await this.inventoryRepository.save(inventory);
      }

      if (releasedCount > 0) {
        this.logger.log(`Released ${releasedCount} expired reservations`);
      }
    } catch (error) {
      this.logger.error('Error processing reservation timeouts', error);
    }
  }
}