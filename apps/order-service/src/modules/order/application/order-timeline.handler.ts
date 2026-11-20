import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { OrderPlacedEvent } from "../domain/events/order-placed.event";
import { OrderStatusChangedEvent } from "../domain/events/order-status-changed.event";
import { OrderTimelineRepository } from "../infrastructure/order-timeline.repository";

@EventsHandler(OrderPlacedEvent, OrderStatusChangedEvent)
export class OrderTimelineHandler implements IEventHandler<
  OrderPlacedEvent | OrderStatusChangedEvent
> {
  private readonly logger = new Logger(OrderTimelineHandler.name);

  constructor(private readonly timelineRepo: OrderTimelineRepository) {}

  async handle(
    event: OrderPlacedEvent | OrderStatusChangedEvent,
  ): Promise<void> {
    try {
      if (event instanceof OrderPlacedEvent) {
        await this.timelineRepo.record({
          id: randomUUID(),
          orderId: event.payload.orderId,
          previousStatus: null,
          newStatus: "PENDING",
          reason: null,
          occurredAt: event.occurredAt,
        });
        return;
      }

      if (event instanceof OrderStatusChangedEvent) {
        await this.timelineRepo.record({
          id: randomUUID(),
          orderId: event.payload.orderId,
          previousStatus: event.payload.previousStatus,
          newStatus: event.payload.newStatus,
          reason: event.payload.reason ?? null,
          occurredAt: event.occurredAt,
        });
        return;
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to record order timeline: ${err?.message ?? err}`,
      );
    }
  }
}
