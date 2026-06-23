import { v4 as uuid } from "uuid";
import { Order } from "../domain/order.aggregate";
import { OrderId } from "../domain/order-id";
import { OrderItemProps } from "../domain/order.aggregate";
import { OrderEntity } from "./order.entity";
import { OrderItemEntity } from "./order-item.entity";

export class OrderMapper {
  /**
   * Convert a domain Order aggregate to a persistence OrderEntity.
   */
  static toPersistence(order: Order): OrderEntity {
    const entity = new OrderEntity();
    entity.id = order.id.toString();
    entity.consumer_id = order.orderConsumerId;
    entity.merchant_id = order.orderMerchantId;
    entity.order_type = order.orderTypeValue;
    entity.status = order.orderStatus;
    entity.subtotal = order.orderSubtotal;
    entity.delivery_fee = order.orderDeliveryFee;
    entity.service_fee = order.orderServiceFee;
    entity.discount = order.orderDiscount;
    entity.total_amount = order.orderTotalAmount;
    entity.delivery_address = order.orderDeliveryAddress;
    entity.delivery_latitude = order.orderDeliveryLatitude;
    entity.delivery_longitude = order.orderDeliveryLongitude;
    entity.estimated_delivery_time = order.orderEstimatedDeliveryTime;
    entity.notes = order.orderNotes;
    entity.driver_id = order.orderDriverId;
    entity.cancel_reason = order.orderCancelReason;
    entity.rejection_reason = order.orderRejectionReason;
    return entity;
  }

  /**
   * Convert order items from the domain Order to persistence OrderItemEntity array.
   */
  static itemsToPersistence(order: Order): OrderItemEntity[] {
    return order.orderItems.map((item) => {
      const entity = new OrderItemEntity();
      entity.id = uuid();
      entity.order_id = order.id.toString();
      entity.menu_item_id = item.menuItemId;
      entity.name = item.name;
      entity.quantity = item.quantity;
      entity.unit_price = item.unitPrice;
      entity.subtotal = item.subtotal;
      entity.special_instructions = item.specialInstructions;
      return entity;
    });
  }

  /**
   * Convert persistence entities back to a domain Order aggregate.
   */
  static toDomain(
    orderEntity: OrderEntity,
    itemEntities: OrderItemEntity[],
  ): Order {
    const items: OrderItemProps[] = itemEntities.map((item) => ({
      menuItemId: item.menu_item_id,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      subtotal: item.subtotal,
      specialInstructions: item.special_instructions,
    }));

    return Order.rehydrate(OrderId.from(orderEntity.id), {
      consumerId: orderEntity.consumer_id,
      merchantId: orderEntity.merchant_id,
      orderType: orderEntity.order_type as "DELIVERY" | "PICKUP",
      status: orderEntity.status as Order["orderStatus"],
      items,
      subtotal: orderEntity.subtotal,
      deliveryFee: orderEntity.delivery_fee,
      serviceFee: orderEntity.service_fee,
      discount: orderEntity.discount,
      totalAmount: orderEntity.total_amount,
      deliveryAddress: orderEntity.delivery_address,
      deliveryLatitude: orderEntity.delivery_latitude,
      deliveryLongitude: orderEntity.delivery_longitude,
      estimatedDeliveryTime: orderEntity.estimated_delivery_time,
      notes: orderEntity.notes,
      driverId: orderEntity.driver_id,
      cancelReason: orderEntity.cancel_reason,
      rejectionReason: orderEntity.rejection_reason,
    });
  }
}
