import { BaseDomainEvent } from '@mythfood/shared-kernel';
import { InventoryId } from '../inventory-id';

export interface InventoryConsumedPayload {
  inventoryId: string;
  menuItemId: string;
  merchantId: string;
  orderId: string;
  quantity: number;
  availableQuantity: number;
  reservedQuantity: number;
}

export const INVENTORY_CONSUMED_EVENT_TYPE = 'com.mythfood.inventory.consumed';

export class InventoryConsumedEvent extends BaseDomainEvent {
  public readonly payload: InventoryConsumedPayload;

  constructor(
    aggregateId: InventoryId,
    payload: InventoryConsumedPayload,
    correlationId?: string,
  ) {
    super(aggregateId, INVENTORY_CONSUMED_EVENT_TYPE, 1, correlationId);
    this.payload = payload;
  }

  public override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), payload: this.payload };
  }
}