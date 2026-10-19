import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { OrderRepository } from "../infrastructure/order.repository";
import { MerchantComplianceRepository } from "../infrastructure/merchant-compliance.repository";
import {
  decideComplianceEscalation,
  CompliancePenaltyType,
} from "./merchant-compliance.policy";

export interface ComplianceViewItem {
  merchantId: string;
  totalOrders: number;
  rejectedOrders: number;
  noResponseOrders: number;
  badRate: number;
  penaltyLevel: number;
  lastPenaltyAt: Date | null;
}

@Injectable()
export class MerchantComplianceService {
  private readonly logger = new Logger(MerchantComplianceService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly complianceRepository: MerchantComplianceRepository,
    private readonly httpService: HttpService,
  ) {}

  private get config() {
    return {
      days: this.positiveInt("MERCHANT_COMPLIANCE_WINDOW_DAYS", 30),
      minOrders: this.positiveInt("MERCHANT_COMPLIANCE_MIN_ORDERS", 10),
      warnRate: this.rate("MERCHANT_COMPLIANCE_WARN_RATE", 0.3),
      fineRate: this.rate("MERCHANT_COMPLIANCE_FINE_RATE", 0.5),
      suspendRate: this.rate("MERCHANT_COMPLIANCE_SUSPEND_RATE", 0.7),
      fineAmount: this.positiveInt("MERCHANT_COMPLIANCE_FINE_AMOUNT", 200000),
      cooldownHours: this.positiveInt("MERCHANT_COMPLIANCE_COOLDOWN_HOURS", 24),
    };
  }

  private positiveInt(key: string, fallback: number): number {
    const v = Number(process.env[key]);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  }

  private rate(key: string, fallback: number): number {
    const v = Number(process.env[key]);
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : fallback;
  }

  private get serviceKey(): string {
    return process.env.SERVICE_API_KEY || "mythfood-service-key";
  }

  /** Đánh giá toàn bộ nhà hàng và leo thang 1 bậc cho những nhà hàng vi phạm. */
  async evaluateAll(): Promise<number> {
    const cfg = this.config;
    const since = new Date(Date.now() - cfg.days * 86400000);
    const stats = await this.orderRepository.getMerchantComplianceStats(since);

    let escalated = 0;
    for (const s of stats) {
      const state = await this.complianceRepository.getState(s.merchantId);
      const currentLevel = state?.penalty_level ?? 0;

      if (
        state?.last_penalty_at &&
        Date.now() - state.last_penalty_at.getTime() <
          cfg.cooldownHours * 3600000
      ) {
        continue;
      }

      const decision = decideComplianceEscalation({
        total: s.total,
        rejected: s.rejected,
        noResponse: s.noResponse,
        currentLevel,
        minOrders: cfg.minOrders,
        warnRate: cfg.warnRate,
        fineRate: cfg.fineRate,
        suspendRate: cfg.suspendRate,
      });
      if (!decision) continue;

      await this.applyEscalation(
        s.merchantId,
        decision,
        s,
        cfg.fineAmount,
        cfg.days,
      );
      escalated++;
    }
    return escalated;
  }

  /** Xem tỉ lệ + trạng thái phạt của các nhà hàng (cho admin). */
  async getComplianceView(days?: number): Promise<ComplianceViewItem[]> {
    const windowDays = days && days > 0 ? days : this.config.days;
    const since = new Date(Date.now() - windowDays * 86400000);
    const stats = await this.orderRepository.getMerchantComplianceStats(since);

    return Promise.all(
      stats.map(async (s) => {
        const state = await this.complianceRepository.getState(s.merchantId);
        const bad = s.rejected + s.noResponse;
        return {
          merchantId: s.merchantId,
          totalOrders: s.total,
          rejectedOrders: s.rejected,
          noResponseOrders: s.noResponse,
          badRate: s.total > 0 ? Number((bad / s.total).toFixed(4)) : 0,
          penaltyLevel: state?.penalty_level ?? 0,
          lastPenaltyAt: state?.last_penalty_at ?? null,
        };
      }),
    );
  }

  // ===================== Thực thi hình phạt =====================

  private async applyEscalation(
    merchantId: string,
    decision: { level: number; type: CompliancePenaltyType },
    stats: { total: number; rejected: number; noResponse: number },
    fineAmount: number,
    windowDays: number,
  ): Promise<void> {
    const amount = decision.type === "FINE" ? fineAmount : null;
    const reason = this.buildReason(decision.type, stats, windowDays);

    await this.complianceRepository.recordPenalty({
      merchantId,
      level: decision.level,
      type: decision.type,
      amount,
      reason,
    });
    await this.complianceRepository.saveState({
      merchantId,
      penaltyLevel: decision.level,
      lastPenaltyAt: new Date(),
    });

    await this.openCase(merchantId, decision.type, reason);

    if (decision.type === "FINE" && amount) {
      await this.debitMerchant(merchantId, amount, reason);
    }
    if (decision.type === "SUSPEND") {
      await this.suspendMerchant(merchantId);
    }
    await this.notifyMerchant(merchantId, decision.type, reason);

    this.logger.log(
      `Escalated merchant ${merchantId} to level ${decision.level} (${decision.type}): ${reason}`,
    );
  }

  private buildReason(
    type: CompliancePenaltyType,
    stats: { total: number; rejected: number; noResponse: number },
    windowDays: number,
  ): string {
    return (
      `Tự động xử lý vi phạm tỉ lệ đơn (${type}): ` +
      `${stats.rejected} từ chối + ${stats.noResponse} không phản hồi ` +
      `trên ${stats.total} đơn trong ${windowDays} ngày`
    );
  }

  private async openCase(
    merchantId: string,
    type: CompliancePenaltyType,
    reason: string,
  ): Promise<void> {
    const url =
      process.env.RESOLUTION_SERVICE_URL || "http://resolution-service:3014";
    try {
      await firstValueFrom(
        this.httpService.post(
          `${url}/api/v1/cases`,
          {
            type: "COMPLAINT",
            category: "MERCHANT_BEHAVIOR",
            respondentId: merchantId,
            respondentType: "MERCHANT",
            subject: `Nhà hàng vi phạm tỉ lệ từ chối/không phản hồi (${type})`,
            description: reason,
            reporterId: "system",
            reporterType: "SYSTEM",
            severity:
              type === "SUSPEND" ? "HIGH" : type === "FINE" ? "MEDIUM" : "LOW",
          },
          { headers: { "x-service-key": this.serviceKey } },
        ),
      );
    } catch (err: any) {
      this.logger.warn(`openCase failed for ${merchantId}: ${err?.message}`);
    }
  }

  private async debitMerchant(
    merchantId: string,
    amount: number,
    reason: string,
  ): Promise<void> {
    const url = process.env.WALLET_SERVICE_URL || "http://wallet-service:3009";
    try {
      await firstValueFrom(
        this.httpService.post(
          `${url}/api/v1/wallets/penalty/debit`,
          {
            ownerId: merchantId,
            ownerType: "MERCHANT",
            amount,
            description: reason,
          },
          { headers: { "x-service-key": this.serviceKey } },
        ),
      );
    } catch (err: any) {
      this.logger.warn(
        `debitMerchant failed for ${merchantId}: ${err?.message}`,
      );
    }
  }

  private async suspendMerchant(merchantId: string): Promise<void> {
    for (const base of this.candidates(
      "MERCHANT_SERVICE_URL",
      "http://merchant-service:3003",
    )) {
      try {
        await firstValueFrom(
          this.httpService.patch(
            `${base}/api/v1/merchants/${merchantId}/status`,
            { status: "SUSPENDED" },
            { headers: { "x-service-key": this.serviceKey } },
          ),
        );
        return;
      } catch (err: any) {
        this.logger.warn(
          `suspendMerchant failed against ${base}: ${err?.message}`,
        );
      }
    }
  }

  private async notifyMerchant(
    merchantId: string,
    type: CompliancePenaltyType,
    reason: string,
  ): Promise<void> {
    const url =
      process.env.NOTIFICATION_SERVICE_URL ||
      "http://notification-service:3013";
    try {
      await firstValueFrom(
        this.httpService.post(
          `${url}/api/v1/notifications`,
          {
            userId: merchantId,
            title: `Nhà hàng bị xử phạt: ${type}`,
            body: reason,
          },
          { headers: { "x-service-key": this.serviceKey } },
        ),
      );
    } catch (err: any) {
      this.logger.warn(
        `notifyMerchant failed for ${merchantId}: ${err?.message}`,
      );
    }
  }

  private candidates(envKey: string, dockerUrl: string): string[] {
    const urls = [
      process.env[envKey],
      dockerUrl,
      dockerUrl.replace("merchant-service", "localhost"),
    ].filter((u): u is string => !!u);
    return [...new Set(urls)];
  }
}
