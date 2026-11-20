import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { OrderTimelineEntity } from "./order-timeline.entity";

@Injectable()
export class OrderTimelineRepository {
  constructor(
    @InjectRepository(OrderTimelineEntity)
    private readonly repo: Repository<OrderTimelineEntity>,
  ) {}

  async record(entry: {
    id: string;
    orderId: string;
    previousStatus: string | null;
    newStatus: string;
    reason?: string | null;
    occurredAt: Date;
  }): Promise<void> {
    await this.repo.save({
      id: entry.id,
      order_id: entry.orderId,
      previous_status: entry.previousStatus,
      new_status: entry.newStatus,
      reason: entry.reason ?? null,
      occurred_at: entry.occurredAt,
    } as OrderTimelineEntity);
  }

  async findByOrderId(orderId: string): Promise<OrderTimelineEntity[]> {
    return this.repo.find({
      where: { order_id: orderId },
      order: { occurred_at: "ASC" },
    });
  }
}
