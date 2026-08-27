import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { OrderRepository } from "../infrastructure/order.repository";
import { OrderGateway } from "../gateway/order.gateway";

@Injectable()
export class OrderScheduler {
  private readonly logger = new Logger(OrderScheduler.name);
  private readonly AUTO_REJECT_MINUTES = 3;

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly orderGateway: OrderGateway,
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
          order.reject("Nha hang khong phan hoi trong 3 phut");
          await this.orderRepository.save(order);
          this.logger.log(`Auto-rejected order ${order.id.toString()}`);
          try {
            this.orderGateway.emitOrderUpdate(
              order.orderMerchantId,
              "order:rejected",
              {
                id: order.id.toString(),
                status: "REJECTED",
                rejectionReason: "Nha hang khong phan hoi trong 3 phut",
              },
            );
          } catch {}
        } catch (err: any) {
          this.logger.warn(`Failed to auto-reject: ${err.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Scheduler error: ${err.message}`);
    }
  }
}
