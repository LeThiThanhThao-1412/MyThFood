import { BaseDomainEvent } from "@mythfood/shared-kernel";
import { OrderId } from "../order-id";

export interface OrderItemsChangedPayload {
  orderId: string;
  previousItemsVersion: number;
  newItemsVersion: number;
  previousSubtotal: number;
  newSubtotal: number;
  previousDiscount: number;
  newDiscount: number;
  previousTotalAmount: number;
  newTotalAmount: number;
  deltaAmount: number;
  reason?: string;
}

export const ORDER_ITEMS_CHANGED_EVENT_TYPE =
  "com.mythfood.order.items_changed";

/**
 * Phát ra khi một yêu cầu chỉnh sửa đơn đã được khách xác nhận và áp dụng
 * vào aggregate Order.
 */
export class OrderItemsChangedEvent extends BaseDomainEvent {
  public readonly payload: OrderItemsChangedPayload;

  constructor(
    aggregateId: OrderId,
    payload: OrderItemsChangedPayload,
    correlationId?: string,
  ) {
    super(aggregateId, ORDER_ITEMS_CHANGED_EVENT_TYPE, 1, correlationId);
    this.payload = payload;
  }

  public override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      payload: this.payload,
    };
  }
}
