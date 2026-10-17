import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  OrderChangeRequestEntity,
  OrderChangeRequestStatus,
} from "./order-change-request.entity";
import { OrderEntity } from "./order.entity";

const ACTIVE_STATUSES: OrderChangeRequestStatus[] = [
  "PENDING",
  "AWAITING_PAYMENT",
];

@Injectable()
export class OrderChangeRequestRepository {
  constructor(
    @InjectRepository(OrderChangeRequestEntity)
    private readonly repo: Repository<OrderChangeRequestEntity>,
  ) {}

  async create(
    entity: Partial<OrderChangeRequestEntity>,
  ): Promise<OrderChangeRequestEntity> {
    return this.repo.save(this.repo.create(entity));
  }

  async save(
    entity: OrderChangeRequestEntity,
  ): Promise<OrderChangeRequestEntity> {
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<OrderChangeRequestEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByOrderId(orderId: string): Promise<OrderChangeRequestEntity[]> {
    return this.repo.find({
      where: { order_id: orderId },
      order: { created_at: "DESC" },
    });
  }

  async findActiveByOrderId(
    orderId: string,
  ): Promise<OrderChangeRequestEntity | null> {
    return this.repo
      .createQueryBuilder("request")
      .where("request.order_id = :orderId", { orderId })
      .andWhere("request.status IN (:...statuses)", {
        statuses: ACTIVE_STATUSES,
      })
      .orderBy("request.created_at", "DESC")
      .getOne();
  }

  async findActiveByOrderIds(
    orderIds: string[],
  ): Promise<OrderChangeRequestEntity[]> {
    if (orderIds.length === 0) return [];
    return this.repo
      .createQueryBuilder("request")
      .where("request.order_id IN (:...orderIds)", { orderIds })
      .andWhere("request.status IN (:...statuses)", {
        statuses: ACTIVE_STATUSES,
      })
      .getMany();
  }

  /**
   * Hủy yêu cầu đang hoạt động của đơn (dùng khi tạo yêu cầu mới ghi đè,
   * đơn bị hủy/từ chối hoặc đã chuyển sang trạng thái không cho sửa).
   */
  async cancelActiveByOrderId(
    orderId: string,
    reason: string,
  ): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .update(OrderChangeRequestEntity)
      .set({
        status: "CANCELLED",
        reject_reason: reason,
        updated_at: new Date(),
      })
      .where("order_id = :orderId", { orderId })
      .andWhere("status IN (:...statuses)", { statuses: ACTIVE_STATUSES })
      .execute();
    return result.affected ?? 0;
  }

  async findExpired(now: Date): Promise<OrderChangeRequestEntity[]> {
    return this.repo
      .createQueryBuilder("request")
      .where("request.status IN (:...statuses)", {
        statuses: ACTIVE_STATUSES,
      })
      .andWhere("request.expires_at IS NOT NULL")
      .andWhere("request.expires_at <= :now", { now })
      .getMany();
  }

  async findActiveForOrdersNotInStatuses(
    allowedStatuses: string[],
  ): Promise<OrderChangeRequestEntity[]> {
    return this.repo
      .createQueryBuilder("request")
      .innerJoin(
        OrderEntity,
        "orders_alias",
        "orders_alias.id = request.order_id",
      )
      .where("request.status IN (:...activeStatuses)", {
        activeStatuses: ACTIVE_STATUSES,
      })
      .andWhere("orders_alias.status NOT IN (:...allowedStatuses)", {
        allowedStatuses,
      })
      .getMany();
  }
}
