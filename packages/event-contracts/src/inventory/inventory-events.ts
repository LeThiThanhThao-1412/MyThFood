export interface InventoryReservedEventData {
  inventoryId: string;
  menuItemId: string;
  merchantId: string;
  orderId: string;
  quantity: number;
  availableQuantity: number;
  reservedQuantity: number;
}

export interface InventoryReleasedEventData {
  inventoryId: string;
  menuItemId: string;
  merchantId: string;
  orderId: string;
  quantity: number;
  reason: string;
  availableQuantity: number;
  reservedQuantity: number;
}

export interface InventoryConsumedEventData {
  inventoryId: string;
  menuItemId: string;
  merchantId: string;
  orderId: string;
  quantity: number;
  availableQuantity: number;
  reservedQuantity: number;
}

export const INVENTORY_RESERVED_EVENT_TYPE = 'com.mythfood.inventory.reserved';
export const INVENTORY_RELEASED_EVENT_TYPE = 'com.mythfood.inventory.released';
export const INVENTORY_CONSUMED_EVENT_TYPE = 'com.mythfood.inventory.consumed';