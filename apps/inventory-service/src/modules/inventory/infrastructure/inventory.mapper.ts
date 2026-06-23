import { Inventory, Reservation } from '../domain/inventory.aggregate';
import { InventoryId } from '../domain/inventory-id';
import { InventoryEntity } from './inventory.entity';
import { InventoryReservationEntity } from './inventory-reservation.entity';

export class InventoryMapper {
  static toPersistence(aggregate: Inventory): InventoryEntity {
    const entity = new InventoryEntity();
    entity.id = aggregate.id.toString();
    entity.menu_item_id = aggregate.inventoryMenuItemId;
    entity.merchant_id = aggregate.inventoryMerchantId;
    entity.total_quantity = aggregate.inventoryTotalQuantity;
    entity.available_quantity = aggregate.inventoryAvailableQuantity;
    entity.reserved_quantity = aggregate.inventoryReservedQuantity;
    entity.low_stock_threshold = aggregate.inventoryLowStockThreshold;
    return entity;
  }

  static toDomain(
    entity: InventoryEntity,
    reservationEntities: InventoryReservationEntity[],
  ): Inventory {
    const reservations: Reservation[] = reservationEntities.map((r) => ({
      orderId: r.order_id,
      quantity: r.quantity,
      reservedAt: r.reserved_at,
      expiresAt: r.expires_at,
    }));

    return Inventory.rehydrate(InventoryId.from(entity.id), {
      menuItemId: entity.menu_item_id,
      merchantId: entity.merchant_id,
      totalQuantity: entity.total_quantity,
      availableQuantity: entity.available_quantity,
      reservedQuantity: entity.reserved_quantity,
      reservations,
      lowStockThreshold: entity.low_stock_threshold,
    });
  }
}