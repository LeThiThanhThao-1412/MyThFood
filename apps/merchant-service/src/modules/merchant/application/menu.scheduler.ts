import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { MerchantService } from "./merchant.service";

@Injectable()
export class MenuScheduler {
  private readonly logger = new Logger(MenuScheduler.name);

  constructor(private readonly merchantService: MerchantService) {}

  /**
   * Tự mở lại các món "hết hàng trong ngày" (OUT_OF_STOCK_TODAY) khi đã qua
   * mốc ngày hôm sau.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async reopenOutOfStockToday(): Promise<void> {
    try {
      const count = await this.merchantService.reopenDueMenuItems(new Date());
      if (count > 0) {
        this.logger.log(`Reopened ${count} out-of-stock-today menu item(s)`);
      }
    } catch (err: any) {
      this.logger.error(`reopenOutOfStockToday failed: ${err.message}`);
    }
  }
}
