import { BaseDomainEvent } from '@mythfood/shared-kernel';
import { InventoryId } from '../inventory-id';

export interface InventoryReleasedPayload {
  inventoryId: string;
  menuItemId: string;
  merchantId: string;
  orderId: string;
  quantity: number;
  reason: string;
  availableQuantity: number;
  reservedQuantity: number;
}

export const INVENTORY_RELEASED_EVENT_TYPE = 'com.mythfood.inventory.released';

export class InventoryReleasedEvent extends BaseDomainEvent {
  public readonly payload: InventoryReleasedPayload;

  constructor(aggregateId: InventoryId, payload: InventoryReleasedPayload, correlationId?: string) {
    super(aggregateId, INVENTORY_RELEASED_EVENT_TYPE, 1, correlationId);
    this.payload = payload;
  }

  public override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), payload: this.payload };
  }
}