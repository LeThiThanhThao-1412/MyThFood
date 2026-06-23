import { BaseDomainEvent } from '@mythfood/shared-kernel';
import { InventoryId } from '../inventory-id';

export interface InventoryReservedPayload {
  inventoryId: string;
  menuItemId: string;
  merchantId: string;
  orderId: string;
  quantity: number;
  availableQuantity: number;
  reservedQuantity: number;
}

export const INVENTORY_RESERVED_EVENT_TYPE = 'com.mythfood.inventory.reserved';

export class InventoryReservedEvent extends BaseDomainEvent {
  public readonly payload: InventoryReservedPayload;

  constructor(
    aggregateId: InventoryId,
    payload: InventoryReservedPayload,
    correlationId?: string,
  ) {
    super(aggregateId, INVENTORY_RESERVED_EVENT_TYPE, 1, correlationId);
    this.payload = payload;
  }

  public override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), payload: this.payload };
  }
}