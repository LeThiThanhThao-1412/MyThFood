import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { WalletService } from "./wallet.service";

@Injectable()
export class WalletScheduler {
  private readonly logger = new Logger(WalletScheduler.name);

  constructor(private readonly walletService: WalletService) {}

  /**
   * Quyết toán cuối ngày 23:00 (Asia/Ho_Chi_Minh).
   * Cửa sổ quyết toán: [23h ngày A, 23h ngày A+1).
   */
  @Cron("0 23 * * *", { timeZone: "Asia/Ho_Chi_Minh" })
  async settleDailyCron(): Promise<void> {
    try {
      this.logger.log("Bắt đầu quyết toán cuối ngày...");
      const result = await this.walletService.settleDaily({
        triggeredBy: "CRON",
      });
      this.logger.log(`Quyết toán hoàn tất: ${JSON.stringify(result.summary)}`);
    } catch (err: any) {
      this.logger.error(`Quyết toán cuối ngày thất bại: ${err.message}`);
    }
  }

  /**
   * Quét nợ COD quá hạn (01:00) — đánh dấu chuyển bộ phận thu hồi.
   * Không tự xóa nợ; giữ khoá TK, chờ admin quyết định.
   */
  @Cron("0 1 * * *", { timeZone: "Asia/Ho_Chi_Minh" })
  async debtCollectionCron(): Promise<void> {
    try {
      const debts = await this.walletService.listOverdueDebts(14);
      if (debts.length > 0) {
        this.logger.log(
          `Phát hiện ${debts.length} khoản nợ COD quá hạn >14 ngày — chuyển bộ phận thu hồi`,
        );
        for (const d of debts) {
          this.logger.warn(
            `Nợ quá hạn: consumer ${d.consumerId} — ${d.balance} VND (${d.daysOverdue} ngày)`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(`Quét nợ quá hạn thất bại: ${err.message}`);
    }
  }
}
