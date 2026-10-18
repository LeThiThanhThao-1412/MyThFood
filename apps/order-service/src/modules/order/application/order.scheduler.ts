import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { OrderRepository } from "../infrastructure/order.repository";
import { OrderService } from "./order.service";
import { MerchantComplianceService } from "./merchant-compliance.service";
import { ShippingService } from "../../shipping/shipping.service";

@Injectable()
export class OrderScheduler {
  private readonly logger = new Logger(OrderScheduler.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly orderService: OrderService,
    private readonly merchantComplianceService: MerchantComplianceService,
    private readonly shippingService: ShippingService,
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

  /**
   * Thời gian chờ tài xế theo phương thức giao hàng — đồng bộ với timeout
   * của dispatch-service để SAVER không bị hủy sớm hơn thời gian chờ tài xế.
   */
  private async noDriverTimeoutMinutesFor(order: {
    orderDeliveryOption?: string;
  }): Promise<number> {
    const option = order.orderDeliveryOption ?? "FAST";
    try {
      const policy = await this.shippingService.getPolicy(option as any);
      const minutes = policy.dispatchTimeoutSeconds / 60;
      if (option === "PRIORITY") {
        return Math.min(this.noDriverTimeoutMinutes, minutes);
      }
      if (option === "SAVER") {
        return Math.max(this.noDriverTimeoutMinutes, minutes);
      }
      return minutes;
    } catch {
      return this.noDriverTimeoutMinutes;
    }
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
            noResponse: true,
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
      // Lấy theo ngưỡng nhỏ nhất (PRIORITY 3 phút) rồi lọc timeout riêng
      // của từng phương thức (FAST 5', SAVER 10').
      const minTimeoutMinutes = Math.max(
        1,
        Math.min(3, this.noDriverTimeoutMinutes),
      );
      const cutoff = new Date(Date.now() - minTimeoutMinutes * 60 * 1000);
      const staleOrders =
        await this.orderRepository.findReadyForPickupOlderThan(cutoff);

      for (const order of staleOrders) {
        // Đơn đã có tài xế → bỏ qua, không hủy.
        if (order.orderDriverId) {
          continue;
        }

        const timeoutMinutes = await this.noDriverTimeoutMinutesFor(order);
        const updatedAt = order.updatedAt?.getTime() ?? 0;
        if (Date.now() - updatedAt < timeoutMinutes * 60 * 1000) {
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

  /**
   * Đánh giá tỉ lệ từ chối + không phản hồi của nhà hàng (cửa sổ 30 ngày)
   * và tự động leo thang hình phạt: WARNING -> FINE -> SUSPEND.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async evaluateMerchantCompliance() {
    try {
      const count = await this.merchantComplianceService.evaluateAll();
      if (count > 0) {
        this.logger.log(`Merchant compliance: escalated ${count} merchant(s)`);
      }
    } catch (err: any) {
      this.logger.error(`Merchant compliance evaluation error: ${err.message}`);
    }
  }
}
