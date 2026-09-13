import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { OrderRepository } from "../infrastructure/order.repository";
import { OrderService } from "./order.service";

@Injectable()
export class OrderScheduler {
  private readonly logger = new Logger(OrderScheduler.name);
  private readonly AUTO_REJECT_MINUTES = 3;

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly orderService: OrderService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async autoRejectExpiredPendingOrders() {
    try {
      const cutoff = new Date(
        Date.now() - this.AUTO_REJECT_MINUTES * 60 * 1000,
      );
      const expiredOrders =
        await this.orderRepository.findPendingOlderThan(cutoff);

      for (const order of expiredOrders) {
        try {
          await this.orderService.reject(order.id.toString(), {
            reason: "Nha hang khong phan hoi trong 3 phut",
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
}
