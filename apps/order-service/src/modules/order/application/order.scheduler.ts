import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { OrderRepository } from "../infrastructure/order.repository";
import { OrderService } from "./order.service";

@Injectable()
export class OrderScheduler {
  private readonly logger = new Logger(OrderScheduler.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly orderService: OrderService,
  ) {}

  /** Thời gian chờ merchant xác nhận (mặc định 15 phút, cấu hình qua env). */
  private get merchantResponseTimeoutMinutes(): number {
    const v = Number(process.env.ORDER_MERCHANT_RESPONSE_TIMEOUT_MINUTES || 15);
    return Number.isFinite(v) && v > 0 ? v : 15;
  }

  /** Thời gian chờ tài xế tối đa (mặc định 5 phút, cấu hình qua env). */
  private get noDriverTimeoutMinutes(): number {
    const v = Number(process.env.ORDER_NO_DRIVER_TIMEOUT_MINUTES || 5);
    return Number.isFinite(v) && v > 0 ? v : 5;
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async autoRejectExpiredPendingOrders() {
    try {
      const cutoff = new Date(
        Date.now() - this.merchantResponseTimeoutMinutes * 60 * 1000,
      );
      const expiredOrders =
        await this.orderRepository.findPendingOlderThan(cutoff);

      for (const order of expiredOrders) {
        try {
          await this.orderService.reject(order.id.toString(), {
            reason: `Nhà hàng không phản hồi trong ${this.merchantResponseTimeoutMinutes} phút`,
          });
          this.logger.log(`Auto-rejected order ${order.id.toString()}`);
        } catch (err: any) {
          this.logger.warn(`Failed to auto-reject: ${err.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Scheduler error: ${err.message}`);
    }
  }

  /**
   * Case 3: đơn READY_FOR_PICKUP quá lâu mà không có tài xế nhận → tự hủy.
   * Bao phủ cả trường hợp không có bản ghi dispatch (tạo dispatch thất bại).
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async autoCancelNoDriverReadyOrders() {
    try {
      const cutoff = new Date(
        Date.now() - this.noDriverTimeoutMinutes * 60 * 1000,
      );
      const staleOrders =
        await this.orderRepository.findReadyForPickupOlderThan(cutoff);

      for (const order of staleOrders) {
        // Đơn đã có tài xế → bỏ qua, không hủy.
        if (order.orderDriverId) {
          continue;
        }
        try {
          await this.orderService.cancelNoDriver(
            order.id.toString(),
            "Không có tài xế nhận đơn",
          );
          this.logger.log(
            `Auto-cancelled no-driver order ${order.id.toString()}`,
          );
        } catch (err: any) {
          this.logger.warn(`Failed to auto-cancel no-driver: ${err.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Scheduler error: ${err.message}`);
    }
  }
}
