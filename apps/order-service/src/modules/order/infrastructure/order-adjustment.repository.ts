import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { OrderAdjustmentEntity } from "./order-adjustment.entity";

@Injectable()
export class OrderAdjustmentRepository {
  constructor(
    @InjectRepository(OrderAdjustmentEntity)
    private readonly repo: Repository<OrderAdjustmentEntity>,
  ) {}

  async create(
    entity: Partial<OrderAdjustmentEntity>,
  ): Promise<OrderAdjustmentEntity> {
    return this.repo.save(this.repo.create(entity));
  }

  async findByOrderId(orderId: string): Promise<OrderAdjustmentEntity[]> {
    return this.repo.find({
      where: { order_id: orderId },
      order: { created_at: "ASC" },
    });
  }

  async findByAdjustmentRequestId(
    changeRequestId: string,
  ): Promise<OrderAdjustmentEntity | null> {
    return this.repo.findOne({ where: { change_request_id: changeRequestId } });
  }

  /** Đánh dấu các điều chỉnh của đơn đã được accrual khi đơn DELIVERED. */
  async markSettlementStatusByOrderId(
    orderId: string,
    status: string,
  ): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .update(OrderAdjustmentEntity)
      .set({ settlement_status: status })
      .where("order_id = :orderId", { orderId })
      .execute();
    return result.affected ?? 0;
  }

  async findByMerchant(
    merchantId: string,
    options?: { startDate?: string; endDate?: string },
  ): Promise<OrderAdjustmentEntity[]> {
    const qb = this.repo
      .createQueryBuilder("adjustment")
      .where("adjustment.merchant_id = :merchantId", { merchantId })
      .orderBy("adjustment.created_at", "DESC");

    if (options?.startDate) {
      qb.andWhere("adjustment.created_at >= :startDate", {
        startDate: new Date(options.startDate),
      });
    }
    if (options?.endDate) {
      qb.andWhere("adjustment.created_at <= :endDate", {
        endDate: new Date(options.endDate),
      });
    }
    return qb.getMany();
  }
}
