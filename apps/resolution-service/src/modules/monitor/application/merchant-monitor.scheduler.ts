import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { MerchantMonitorService } from "./merchant-monitor.service";

@Injectable()
export class MerchantMonitorScheduler {
  private readonly logger = new Logger(MerchantMonitorScheduler.name);

  constructor(private readonly monitorService: MerchantMonitorService) {}

  /**
   * Đánh giá tỉ lệ khiếu nại mỗi 6 giờ.
   *
   * Đánh giá idempotent theo tuần ISO nên chạy dày không tạo cảnh báo trùng;
   * chạy 6 giờ/lần giúp cảnh báo xuất hiện sớm thay vì chờ đến cuối tuần.
   */
  @Cron("0 */6 * * *", { timeZone: "Asia/Ho_Chi_Minh" })
  async evaluateComplaintRates(): Promise<void> {
    try {
      const result = await this.monitorService.evaluateAll();
      if (result.warned > 0 || result.locked > 0) {
        this.logger.log(
          `Đánh giá khiếu nại: ${result.evaluated} nhà hàng, ` +
            `${result.warned} cảnh báo, ${result.locked} khóa`,
        );
      }
    } catch (err: any) {
      this.logger.warn(`Đánh giá tỉ lệ khiếu nại thất bại: ${err?.message}`);
    }
  }
}
