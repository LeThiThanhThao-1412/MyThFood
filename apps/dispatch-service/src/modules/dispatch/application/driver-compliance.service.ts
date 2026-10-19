import { Injectable, Logger } from "@nestjs/common";
import {
  DriverComplianceRepository,
  DriverOfferStats,
} from "../infrastructure/driver-compliance.repository";
import {
  decideDriverComplianceEscalation,
  DriverCompliancePenaltyType,
} from "./driver-compliance.policy";

export interface DriverComplianceViewItem {
  driverId: string;
  totalOffers: number;
  declinedOffers: number;
  noResponseOffers: number;
  /** Tỉ lệ vi phạm = (declined + noResponse) / totalOffers. */
  badRate: number;
  complaintLevel: number;
  lastComplaintAt: Date | null;
  windowDays: number;
  warnRate: number;
  fineRate: number;
  suspendRate: number;
}

/**
 * Ghi nhận & đánh giá tỉ lệ từ chối / không phản hồi của tài xế.
 *
 * Nguyên tắc nghiệp vụ:
 * - Mỗi lượt giao đơn chỉ được ghi vào bảng offer, KHÔNG tạo case khiếu nại.
 * - Chỉ khi tỉ lệ trong cửa sổ (mặc định 30 ngày) vượt ngưỡng cho phép thì
 *   mới mở 1 case COMPLAINT/DRIVER_BEHAVIOR cho admin xử lý.
 * - Có cooldown + leo thang bậc để không mở case lặp lại liên tục.
 */
@Injectable()
export class DriverComplianceService {
  private readonly logger = new Logger(DriverComplianceService.name);

  constructor(private readonly repository: DriverComplianceRepository) {}

  private get config() {
    return {
      days: this.positiveInt("DRIVER_COMPLIANCE_WINDOW_DAYS", 30),
      minOffers: this.positiveInt("DRIVER_COMPLIANCE_MIN_OFFERS", 10),
      warnRate: this.rate("DRIVER_COMPLIANCE_WARN_RATE", 0.3),
      fineRate: this.rate("DRIVER_COMPLIANCE_FINE_RATE", 0.5),
      suspendRate: this.rate("DRIVER_COMPLIANCE_SUSPEND_RATE", 0.7),
      cooldownHours: this.positiveInt(
        "DRIVER_COMPLIANCE_COOLDOWN_HOURS",
        24,
      ),
    };
  }

  private positiveInt(key: string, fallback: number): number {
    const value = Number(process.env[key]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private rate(key: string, fallback: number): number {
    const value = Number(process.env[key]);
    return Number.isFinite(value) && value >= 0 && value <= 1
      ? value
      : fallback;
  }

  private get serviceKey(): string {
    return process.env.SERVICE_API_KEY || "mythfood-service-key";
  }

  // ===================== Ghi nhận offer =====================

  async recordOffer(
    driverId: string,
    dispatchId: string,
    orderId: string,
  ): Promise<void> {
    try {
      await this.repository.recordOffer(driverId, dispatchId, orderId);
    } catch (err: any) {
      this.logger.warn(
        `recordOffer failed for driver ${driverId}, dispatch ${dispatchId}: ${err?.message}`,
      );
    }
  }

  async markAccepted(
    driverId: string,
    dispatchId: string,
    orderId: string,
  ): Promise<void> {
    try {
      await this.repository.markAccepted(driverId, dispatchId, orderId);
    } catch (err: any) {
      this.logger.warn(
        `markAccepted failed for driver ${driverId}, dispatch ${dispatchId}: ${err?.message}`,
      );
    }
  }

  async markDeclined(input: {
    driverId: string;
    dispatchId: string;
    orderId: string;
    noResponse?: boolean;
    reason?: string | null;
  }): Promise<void> {
    try {
      await this.repository.markDeclined(
        input.driverId,
        input.dispatchId,
        input.orderId,
        input.noResponse ? "NO_RESPONSE" : "DECLINED",
        input.reason,
      );
    } catch (err: any) {
      this.logger.warn(
        `markDeclined failed for driver ${input.driverId}, dispatch ${input.dispatchId}: ${err?.message}`,
      );
    }
  }

  // ===================== Đánh giá & khiếu nại =====================

  /**
   * Đánh giá toàn bộ tài xế và mở case khiếu nại khi vượt ngưỡng.
   * Trả về số tài xế vừa bị khiếu nại/leo thang.
   */
  async evaluateAll(): Promise<number> {
    const cfg = this.config;
    const since = new Date(Date.now() - cfg.days * 86400000);
    const stats = await this.repository.getStats(since);

    let escalated = 0;
    for (const s of stats) {
      if (s.total < cfg.minOffers) continue;

      try {
        const state = await this.repository.getState(s.driverId);
        const currentLevel = state?.complaint_level ?? 0;

        if (
          state?.last_complaint_at &&
          Date.now() - state.last_complaint_at.getTime() <
            cfg.cooldownHours * 3600000
        ) {
          continue;
        }

        const decision = decideDriverComplianceEscalation({
          total: s.total,
          declined: s.declined,
          noResponse: s.noResponse,
          currentLevel,
          minOffers: cfg.minOffers,
          warnRate: cfg.warnRate,
          fineRate: cfg.fineRate,
          suspendRate: cfg.suspendRate,
        });
        if (!decision) continue;

        const opened = await this.openCase(s, decision, cfg.days);
        if (!opened) continue;

        await this.repository.saveState({
          driverId: s.driverId,
          complaintLevel: decision.level,
          lastComplaintAt: new Date(),
          badRate: Number(decision.badRate.toFixed(4)),
        });

        this.logger.log(
          `Opened driver compliance case for ${s.driverId} at level ${decision.level} (${decision.type}), badRate=${decision.badRate.toFixed(4)}`,
        );
        escalated++;
      } catch (err: any) {
        this.logger.warn(
          `Driver compliance evaluation failed for ${s.driverId}: ${err?.message}`,
        );
      }
    }
    return escalated;
  }

  /** Xem tỉ lệ + trạng thái khiếu nại của tài xế (cho admin). */
  async getComplianceView(days?: number): Promise<DriverComplianceViewItem[]> {
    const cfg = this.config;
    const windowDays = days && days > 0 ? days : cfg.days;
    const since = new Date(Date.now() - windowDays * 86400000);
    const stats = await this.repository.getStats(since);

    return Promise.all(
      stats.map(async (s) => {
        const state = await this.repository.getState(s.driverId);
        const bad = s.declined + s.noResponse;
        return {
          driverId: s.driverId,
          totalOffers: s.total,
          declinedOffers: s.declined,
          noResponseOffers: s.noResponse,
          badRate: s.total > 0 ? Number((bad / s.total).toFixed(4)) : 0,
          complaintLevel: state?.complaint_level ?? 0,
          lastComplaintAt: state?.last_complaint_at ?? null,
          windowDays,
          warnRate: cfg.warnRate,
          fineRate: cfg.fineRate,
          suspendRate: cfg.suspendRate,
        };
      }),
    );
  }

  private buildReason(
    stats: DriverOfferStats,
    type: DriverCompliancePenaltyType,
    windowDays: number,
  ): string {
    const bad = stats.declined + stats.noResponse;
    const pct = stats.total > 0 ? ((bad / stats.total) * 100).toFixed(1) : "0.0";
    return (
      `Tài xế vượt ngưỡng tỉ lệ từ chối/không phản hồi (${type}): ` +
      `${stats.declined} từ chối + ${stats.noResponse} không phản hồi ` +
      `trên ${stats.total} lượt giao đơn trong ${windowDays} ngày (${pct}%).`
    );
  }

  /**
   * Mở case khiếu nại ở resolution-service. Chỉ gọi khi tỉ lệ vượt ngưỡng.
   * Không tự trừ tiền/tạm khóa tài xế — admin xem case và quyết định chế tài.
   */
  private async openCase(
    stats: DriverOfferStats,
    decision: { level: number; type: DriverCompliancePenaltyType },
    windowDays: number,
  ): Promise<boolean> {
    const url =
      process.env.RESOLUTION_SERVICE_URL || "http://resolution-service:3014";
    const reason = this.buildReason(stats, decision.type, windowDays);

    try {
      const res = await fetch(`${url}/api/v1/cases`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-service-key": this.serviceKey,
        },
        body: JSON.stringify({
          type: "COMPLAINT",
          category: "DRIVER_BEHAVIOR",
          respondentId: stats.driverId,
          respondentType: "DRIVER",
          subject: `Tài xế vượt ngưỡng tỉ lệ từ chối/không phản hồi (${decision.type})`,
          description: reason,
          reporterId: "system",
          reporterType: "SYSTEM",
          severity:
            decision.level >= 3
              ? "HIGH"
              : decision.level === 2
                ? "MEDIUM"
                : "LOW",
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        this.logger.warn(
          `openCase failed for driver ${stats.driverId}: HTTP ${res.status} ${body}`,
        );
        return false;
      }
      return true;
    } catch (err: any) {
      this.logger.warn(
        `openCase failed for driver ${stats.driverId}: ${err?.message}`,
      );
      return false;
    }
  }
}
