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
}
