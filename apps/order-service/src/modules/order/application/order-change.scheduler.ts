import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { OrderChangeService } from "./order-change.service";
import { OrderChangeRequestRepository } from "../infrastructure/order-change-request.repository";
import { getItemEditableStatuses } from "../domain/order-change.policy";

@Injectable()
export class OrderChangeScheduler {
  private readonly logger = new Logger(OrderChangeScheduler.name);

  constructor(
    private readonly orderChangeService: OrderChangeService,
    private readonly changeRequestRepository: OrderChangeRequestRepository,
  ) {}

  /** Yêu cầu quá hạn xác nhận → EXPIRED, đơn giữ nguyên. */
  @Cron(CronExpression.EVERY_MINUTE)
  async expireChangeRequests(): Promise<void> {
    try {
      const count = await this.orderChangeService.expireRequests();
      if (count > 0) {
        this.logger.log(`Expired ${count} order change request(s)`);
      }
    } catch (err: any) {
      this.logger.error(
        `Expire change requests failed: ${err?.message ?? err}`,
      );
    }
  }

  /**
   * Đơn đã chuyển sang trạng thái không thể chỉnh sửa (READY_FOR_PICKUP,
   * DELIVERED, CANCELLED...) → hủy các yêu cầu đang chờ để tránh áp dụng nhầm.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async cancelStaleChangeRequests(): Promise<void> {
    try {
      const stale =
        await this.changeRequestRepository.findActiveForOrdersNotInStatuses(
          getItemEditableStatuses(),
        );
      for (const request of stale) {
        await this.orderChangeService.cancelActiveForOrder(
          request.order_id,
          "Đơn đã chuyển trạng thái không thể chỉnh sửa món",
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Cancel stale change requests failed: ${err?.message ?? err}`,
      );
    }
  }
}
