import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { CaseService } from "./case.service";

@Injectable()
export class CaseScheduler {
  private readonly logger = new Logger(CaseScheduler.name);

  constructor(private readonly caseService: CaseService) {}

  /** SLA escalation: auto-escalate cases stuck OPEN/UNDER_REVIEW > 72h. */
  @Cron("0 * * * *")
  async escalateStaleCases(): Promise<void> {
    try {
      const count = await this.caseService.escalateStaleCases(72);
      if (count > 0) {
        this.logger.log(`Auto-escalated ${count} stale cases`);
      }
    } catch (err: any) {
      this.logger.warn(`SLA escalation run failed: ${err?.message}`);
    }
  }

  /** Auto-resolve: khách không phản hồi trong 72h → tự chốt lỗi khách. */
  @Cron("0 * * * *")
  async autoResolveExpired(): Promise<void> {
    try {
      const count = await this.caseService.autoResolveExpiredResponse();
      if (count > 0) {
        this.logger.log(`Auto-resolved ${count} cases (no response)`);
      }
    } catch (err: any) {
      this.logger.warn(`Auto-resolve run failed: ${err?.message}`);
    }
  }

  /**
   * Read-repair escrow: mở khoá lại doanh thu của các case đã kết thúc nhưng lần
   * gọi sang wallet-service lúc phán quyết bị lỗi.
   *
   * Chạy mỗi 30 phút, nhìn lại 72h gần nhất. Idempotent — ví chỉ đổi các dòng
   * đang HELD_BY_DISPUTE thành PENDING và đóng dấu `settleOn` = ngày phán quyết,
   * nên gọi lặp không thể trả tiền hai lần.
   *
   * Vì sao phải có: trước đây nếu `releaseSettlement` thất bại thì chỉ có một
   * dòng warn, doanh thu nằm HELD_BY_DISPUTE vĩnh viễn và không bao giờ vào lô
   * 23:00 — khách đã được bồi thường mà nhà hàng/tài xế không bao giờ nhận tiền.
   */
  @Cron("*/30 * * * *")
  async repairHeldEscrows(): Promise<void> {
    try {
      const repaired = await this.caseService.repairHeldEscrows(72, 200);
      if (repaired > 0) {
        this.logger.log(`Read-repair released escrow for ${repaired} cases`);
      }
    } catch (err: any) {
      this.logger.warn(`Escrow read-repair run failed: ${err?.message}`);
    }
  }
}
