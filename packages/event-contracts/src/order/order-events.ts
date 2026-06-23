import { CloudEvent } from "../base/cloud-event";

/** Order placed event contract */
export interface OrderPlacedEventData {
  orderId: string;
  consumerId: string;
  merchantId: string;
  totalAmount: number;
  deliveryAddress: string;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  notes: string | null;
  estimatedDeliveryTime: string;
  items: Array<{
    menuItemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
}

export interface OrderStatusChangedEventData {
  orderId: string;
  previousStatus: string;
  newStatus: string;
  reason?: string;
}

export type OrderEventData = OrderPlacedEventData | OrderStatusChangedEventData;

export type OrderCloudEvent = CloudEvent<OrderEventData>;

export const ORDER_PLACED_EVENT_TYPE = "com.mythfood.order.placed";

export const ORDER_STATUS_CHANGED_EVENT_TYPE =
  "com.mythfood.order.status_changed";
