import { BaseDomainEvent } from "@mythfood/shared-kernel";
import { OrderId } from "../order-id";

export interface OrderPlacedPayload {
  orderId: string;
  consumerId: string;
  merchantId: string;
  totalAmount: number;
  deliveryAddress: string;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  notes: string | null;
  estimatedDeliveryTime: Date;
  items: Array<{
    menuItemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
}

export const ORDER_PLACED_EVENT_TYPE = "com.mythfood.order.placed";

export class OrderPlacedEvent extends BaseDomainEvent {
  public readonly payload: OrderPlacedPayload;

  constructor(
    aggregateId: OrderId,
    payload: OrderPlacedPayload,
    correlationId?: string,
  ) {
    super(aggregateId, ORDER_PLACED_EVENT_TYPE, 1, correlationId);
    this.payload = payload;
  }

  public override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      payload: this.payload,
    };
  }
}
