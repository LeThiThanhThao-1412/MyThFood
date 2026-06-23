import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as TypeOrmRepo } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { IRepository } from '@mythfood/shared-kernel';
import { Inventory } from '../domain/inventory.aggregate';
import { InventoryId } from '../domain/inventory-id';
import { InventoryEntity } from './inventory.entity';
import { InventoryReservationEntity } from './inventory-reservation.entity';
import { InventoryMapper } from './inventory.mapper';

@Injectable()
export class InventoryRepository implements IRepository<Inventory, InventoryId> {
  constructor(
    @InjectRepository(InventoryEntity)
    private readonly repository: TypeOrmRepo<InventoryEntity>,
    @InjectRepository(InventoryReservationEntity)
    private readonly reservationRepo: TypeOrmRepo<InventoryReservationEntity>,
  ) {}

  async save(aggregate: Inventory): Promise<void> {
    const entity = InventoryMapper.toPersistence(aggregate);
    await this.repository.save(entity);

    // Sync reservations: delete old, insert current
    await this.reservationRepo.delete({ inventory_id: aggregate.id.toString() });
    const reservationEntities = aggregate.inventoryReservations.map((r) => {
      const e = new InventoryReservationEntity();
      e.id = uuid();
      e.inventory_id = aggregate.id.toString();
      e.order_id = r.orderId;
      e.quantity = r.quantity;
      e.reserved_at = r.reservedAt;
      e.expires_at = r.expiresAt;
      return e;
    });
    if (reservationEntities.length > 0) {
      await this.reservationRepo.save(reservationEntities);
    }
  }

  async findById(id: InventoryId): Promise<Inventory | null> {
    const entity = await this.repository.findOne({ where: { id: id.toString() } });
    if (!entity) return null;
    return this.loadRelatedAndMap(entity);
  }

  async findByIdOrFail(id: InventoryId): Promise<Inventory> {
    const inv = await this.findById(id);
    if (!inv) throw new Error(`Inventory with id ${id.toString()} not found`);
    return inv;
  }

  async findByMenuItemId(menuItemId: string): Promise<Inventory | null> {
    const entity = await this.repository.findOne({ where: { menu_item_id: menuItemId } });
    if (!entity) return null;
    return this.loadRelatedAndMap(entity);
  }

  async findByMerchantId(merchantId: string): Promise<Inventory[]> {
    const entities = await this.repository.find({ where: { merchant_id: merchantId } });
    return Promise.all(entities.map((e) => this.loadRelatedAndMap(e)));
  }

  async findAll(): Promise<Inventory[]> {
    const entities = await this.repository.find();
    return Promise.all(entities.map((e) => this.loadRelatedAndMap(e)));
  }

  async exists(id: InventoryId): Promise<boolean> {
    const count = await this.repository.count({ where: { id: id.toString() } });
    return count > 0;
  }

  async delete(aggregate: Inventory): Promise<void> {
    await this.reservationRepo.delete({ inventory_id: aggregate.id.toString() });
    await this.repository.delete(aggregate.id.toString());
  }

  async deleteById(id: InventoryId): Promise<void> {
    await this.reservationRepo.delete({ inventory_id: id.toString() });
    await this.repository.delete(id.toString());
  }

  async findExpiredReservations(): Promise<{ inventory: Inventory; expiredOrderIds: string[] }[]> {
    const now = new Date();
    const expiredReservations = await this.reservationRepo
      .createQueryBuilder('r')
      .where('r.expires_at <= :now', { now })
      .getMany();

    const grouped = new Map<string, string[]>();
    for (const r of expiredReservations) {
      const list = grouped.get(r.inventory_id) ?? [];
      list.push(r.order_id);
      grouped.set(r.inventory_id, list);
    }

    const result: { inventory: Inventory; expiredOrderIds: string[] }[] = [];
    for (const [inventoryId, orderIds] of grouped) {
      const entity = await this.repository.findOne({ where: { id: inventoryId } });
      if (entity) {
        const inventory = await this.loadRelatedAndMap(entity);
        result.push({ inventory, expiredOrderIds: orderIds });
      }
    }
    return result;
  }

  private async loadRelatedAndMap(entity: InventoryEntity): Promise<Inventory> {
    const reservations = await this.reservationRepo.find({
      where: { inventory_id: entity.id },
    });
    return InventoryMapper.toDomain(entity, reservations);
  }
}