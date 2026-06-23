import { BaseDomainEvent } from "@mythfood/shared-kernel";
import { OrderId } from "../order-id";
import { OrderStatus } from "../order.aggregate";

export interface OrderStatusChangedPayload {
  orderId: string;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  reason?: string;
}

export const ORDER_STATUS_CHANGED_EVENT_TYPE =
  "com.mythfood.order.status_changed";

export class OrderStatusChangedEvent extends BaseDomainEvent {
  public readonly payload: OrderStatusChangedPayload;

  constructor(
    aggregateId: OrderId,
    payload: OrderStatusChangedPayload,
    correlationId?: string,
  ) {
    super(aggregateId, ORDER_STATUS_CHANGED_EVENT_TYPE, 1, correlationId);
    this.payload = payload;
  }

  public override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      payload: this.payload,
    };
  }
}
