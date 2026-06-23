import { Injectable } from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";
import { Order } from "../domain/order.aggregate";
import { OrderId } from "../domain/order-id";
import { OrderRepository } from "../infrastructure/order.repository";
import {
  PlaceOrderDto,
  UpdateOrderDto,
  StatusTransitionDto,
  OrderQueryDto,
} from "./dtos/order.dto";

@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly eventBus: EventBus,
  ) {}

  // ===================== Order Placement =====================

  async placeOrder(dto: PlaceOrderDto): Promise<Order> {
    const result = Order.place({
      consumerId: dto.consumerId,
      merchantId: dto.merchantId,
      orderType: dto.orderType as "DELIVERY" | "PICKUP",
      items: dto.items.map((item) => ({
        menuItemId: item.menuItemId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        specialInstructions: item.specialInstructions,
      })),
      deliveryAddress: dto.deliveryAddress ?? null,
      deliveryLatitude: dto.deliveryLatitude ?? null,
      deliveryLongitude: dto.deliveryLongitude ?? null,
      deliveryFee: dto.deliveryFee,
      serviceFee: dto.serviceFee,
      discount: dto.discount,
      estimatedDeliveryTime: dto.estimatedDeliveryTime
        ? new Date(dto.estimatedDeliveryTime)
        : undefined,
      notes: dto.notes,
    });

    if (result.isFailure) {
      throw result.error;
    }

    const order = result.value;
    await this.orderRepository.save(order);

    // Publish domain events
    const events = order.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }

    return order;
  }

  // ===================== Order Queries =====================

  async findById(id: string): Promise<Order> {
    return this.orderRepository.findByIdOrFail(OrderId.from(id));
  }

  async findAll(
    query: OrderQueryDto,
  ): Promise<{ items: Order[]; total: number }> {
    return this.orderRepository.findAll({
      status: query.status,
      merchantId: query.merchantId,
      consumerId: query.consumerId,
      skip: query.skip,
      take: query.take,
    });
  }

  async findByConsumer(consumerId: string): Promise<Order[]> {
    return this.orderRepository.findByConsumerId(consumerId);
  }

  async findByMerchant(merchantId: string): Promise<Order[]> {
    return this.orderRepository.findByMerchantId(merchantId);
  }

  async findByDriver(driverId: string): Promise<Order[]> {
    return this.orderRepository.findByDriverId(driverId);
  }

  // ===================== Order Update =====================

  async updateOrder(id: string, dto: UpdateOrderDto): Promise<Order> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));

    if (dto.estimatedDeliveryTime) {
      order.updateEstimatedDeliveryTime(new Date(dto.estimatedDeliveryTime));
    }
    if (dto.notes !== undefined) {
      order.updateNotes(dto.notes);
    }
    if (dto.driverId) {
      order.assignDriver(dto.driverId);
    }

    await this.orderRepository.save(order);
    return order;
  }

  // ===================== Status Transitions =====================

  async confirm(id: string): Promise<Order> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));
    order.confirm();
    await this.orderRepository.save(order);

    const events = order.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }

    return order;
  }

  async startPreparing(id: string): Promise<Order> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));
    order.startPreparing();
    await this.orderRepository.save(order);

    const events = order.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }

    return order;
  }

  async markReadyForPickup(id: string): Promise<Order> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));
    order.markReadyForPickup();
    await this.orderRepository.save(order);

    const events = order.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }

    return order;
  }

  async markOutForDelivery(
    id: string,
    dto: StatusTransitionDto,
  ): Promise<Order> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));

    if (!dto.driverId) {
      throw new Error("Driver ID is required for out-for-delivery transition");
    }

    order.markOutForDelivery(dto.driverId);
    await this.orderRepository.save(order);

    const events = order.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }

    return order;
  }

  async markDelivered(id: string): Promise<Order> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));
    order.markDelivered();
    await this.orderRepository.save(order);

    const events = order.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }

    return order;
  }

  async cancel(id: string, dto: StatusTransitionDto): Promise<Order> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));

    if (!dto.reason) {
      throw new Error("Cancellation reason is required");
    }

    order.cancel(dto.reason);
    await this.orderRepository.save(order);

    const events = order.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }

    return order;
  }

  async reject(id: string, dto: StatusTransitionDto): Promise<Order> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));

    if (!dto.reason) {
      throw new Error("Rejection reason is required");
    }

    order.reject(dto.reason);
    await this.orderRepository.save(order);

    const events = order.pullDomainEvents();
    for (const event of events) {
      this.eventBus.publish(event);
    }

    return order;
  }

  // ===================== Delete =====================

  async softDelete(id: string): Promise<void> {
    const order = await this.orderRepository.findByIdOrFail(OrderId.from(id));
    await this.orderRepository.delete(order);
  }
}
