import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { v4 as uuid } from "uuid";
import { MerchantWarningEntity } from "./merchant-warning.entity";

export interface UpsertMerchantWarningInput {
  merchantId: string;
  level: "WARNING" | "LOCK";
  periodKey: string;
  windowDays: number;
  windowStart: Date;
  windowEnd: Date;
  totalOrders: number;
  cancelledOrders: number;
  totalComplaints: number;
  validComplaints: number;
  complaintRate: number;
  title: string;
  message: string;
}

const WARNING_TYPE = "COMPLAINT_RATE";

@Injectable()
export class MerchantWarningRepository {
  constructor(
    @InjectRepository(MerchantWarningEntity)
    private readonly repo: Repository<MerchantWarningEntity>,
  ) {}

  async findById(id: string): Promise<MerchantWarningEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** Cảnh báo còn hiệu lực của một nhà hàng (chưa ẩn, trong cửa sổ gần nhất). */
  async findActive(
    merchantId: string,
    since: Date,
  ): Promise<MerchantWarningEntity[]> {
    return this.repo
      .createQueryBuilder("w")
      .where("w.merchantId = :merchantId", { merchantId })
      .andWhere("w.dismissedAt IS NULL")
      .andWhere("w.createdAt >= :since", { since })
      .orderBy("w.createdAt", "DESC")
      .getMany();
  }

  async findForPeriod(
    merchantId: string,
    periodKey: string,
  ): Promise<MerchantWarningEntity | null> {
    return this.repo.findOne({
      where: { merchantId, type: WARNING_TYPE, periodKey },
    });
  }

  /**
   * Đã khóa nhà hàng trong `days` ngày gần đây chưa?
   *
   * Dùng để tránh mỗi tuần cron lại gọi `suspendMerchant` một lần, vô tình kéo
   * dài thời gian khóa quá 1 tháng.
   */
  async hasRecentLock(merchantId: string, since: Date): Promise<boolean> {
    const count = await this.repo
      .createQueryBuilder("w")
      .where("w.merchantId = :merchantId", { merchantId })
      .andWhere("w.level = :level", { level: "LOCK" })
      .andWhere("w.createdAt >= :since", { since })
      .getCount();
    return count > 0;
  }

  /**
   * Ghi nhận cảnh báo của tuần (idempotent theo `merchantId + periodKey`).
   *
   * - Chưa có ⇒ tạo mới.
   * - Đã có ⇒ cập nhật số liệu; nếu nâng lên `LOCK` thì xóa trạng thái ẩn để
   *   cảnh báo khóa luôn hiển thị. Cảnh báo `WARNING` đã ẩn giữ nguyên
   *   `dismissedAt` (người dùng đã bấm "Đã hiểu").
   */
  async upsertForPeriod(
    input: UpsertMerchantWarningInput,
  ): Promise<MerchantWarningEntity> {
    let entity = await this.findForPeriod(input.merchantId, input.periodKey);
    // Đã khóa trong tuần thì không hạ xuống WARNING (tỉ lệ có thể giảm sau khi
    // bị khóa vì không còn đơn mới, nhưng quyết định khóa vẫn phải giữ).
    const keepLock = entity?.level === "LOCK" && input.level !== "LOCK";
    const becameLock = input.level === "LOCK" && entity?.level !== "LOCK";

    if (!entity) {
      entity = this.repo.create({
        id: uuid(),
        merchantId: input.merchantId,
        type: WARNING_TYPE,
        periodKey: input.periodKey,
        level: input.level,
        dismissedAt: null,
        dismissedBy: null,
      });
    }

    entity.level = keepLock ? "LOCK" : input.level;
    entity.windowDays = input.windowDays;
    entity.windowStart = input.windowStart;
    entity.windowEnd = input.windowEnd;
    entity.totalOrders = input.totalOrders;
    entity.cancelledOrders = input.cancelledOrders;
    entity.totalComplaints = input.totalComplaints;
    entity.validComplaints = input.validComplaints;
    entity.complaintRate = input.complaintRate.toFixed(4);
    if (!keepLock) {
      entity.title = input.title;
      entity.message = input.message;
    }

    if (becameLock) {
      entity.dismissedAt = null;
      entity.dismissedBy = null;
    }

    return this.repo.save(entity);
  }

  async dismiss(
    entity: MerchantWarningEntity,
    actorId: string,
  ): Promise<MerchantWarningEntity> {
    entity.dismissedAt = new Date();
    entity.dismissedBy = actorId;
    return this.repo.save(entity);
  }
}
