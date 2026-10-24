import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { OrderWarningEntity } from "./order-warning.entity";

@Injectable()
export class OrderWarningRepository {
  constructor(
    @InjectRepository(OrderWarningEntity)
    private readonly repo: Repository<OrderWarningEntity>,
  ) {}

  /**
   * Tạo cảnh báo nếu đơn chưa có cảnh báo cùng loại.
   * Trả `null` khi đã tồn tại ⇒ giữ idempotency cho settleFailureMoney (được
   * gọi từ nhiều call-site fire-and-forget).
   */
  async createIfAbsent(entry: {
    id: string;
    orderId: string;
    merchantId: string | null;
    type: string;
    severity: string;
    title: string;
    message: string;
    detail?: Record<string, any> | null;
  }): Promise<OrderWarningEntity | null> {
    const existing = await this.repo.findOne({
      where: { orderId: entry.orderId, type: entry.type },
    });
    if (existing) return null;

    try {
      return await this.repo.save({
        id: entry.id,
        orderId: entry.orderId,
        merchantId: entry.merchantId,
        type: entry.type,
        severity: entry.severity,
        title: entry.title,
        message: entry.message,
        detail: entry.detail ?? null,
        dismissedAt: null,
        dismissedBy: null,
      } as OrderWarningEntity);
    } catch (err: any) {
      // Đua nhau giữa 2 request: unique index (orderId, type) là chốt chặn cuối.
      if (String(err?.code) === "23505") return null;
      throw err;
    }
  }

  async findByOrderId(orderId: string): Promise<OrderWarningEntity[]> {
    return this.repo.find({
      where: { orderId },
      order: { createdAt: "ASC" },
    });
  }

  /** Cảnh báo còn hiệu lực (chưa bấm "Đã hiểu") của nhiều đơn. */
  async findActiveByOrderIds(
    orderIds: string[],
  ): Promise<OrderWarningEntity[]> {
    if (!orderIds.length) return [];
    return this.repo.find({
      where: orderIds.map((orderId) => ({
        orderId,
        dismissedAt: IsNull(),
      })),
      order: { createdAt: "ASC" },
    });
  }

  async findActiveByMerchant(
    merchantId: string,
  ): Promise<OrderWarningEntity[]> {
    return this.repo.find({
      where: { merchantId, dismissedAt: IsNull() },
      order: { createdAt: "DESC" },
    });
  }

  async findById(id: string): Promise<OrderWarningEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** Đánh dấu đã đọc — trả số dòng cập nhật (0 nếu đã đọc trước đó). */
  async dismiss(id: string, dismissedBy: string): Promise<number> {
    const res = await this.repo
      .createQueryBuilder()
      .update(OrderWarningEntity)
      .set({ dismissedAt: new Date(), dismissedBy })
      .where("id = :id", { id })
      .andWhere('"dismissedAt" IS NULL')
      .execute();
    return res.affected ?? 0;
  }
}
