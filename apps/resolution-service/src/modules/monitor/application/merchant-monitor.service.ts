import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { CaseRepository } from "../../case/infrastructure/case.repository";
import { IntegrationService } from "../../integration/integration.service";
import { MerchantWarningEntity } from "../infrastructure/merchant-warning.entity";
import { MerchantWarningRepository } from "../infrastructure/merchant-warning.repository";
import {
  complaintPeriodKey,
  decideMerchantComplaintLevel,
  MERCHANT_COMPLAINT_DEFAULTS,
  MerchantComplaintLevel,
} from "../domain/merchant-complaint.policy";

export interface MerchantComplaintHealth {
  merchantId: string;
  windowDays: number;
  windowStart: Date;
  windowEnd: Date;
  totalOrders: number;
  cancelledOrders: number;
  totalComplaints: number;
  validComplaints: number;
  /** Tổng khiếu nại tích lũy (không giới hạn cửa sổ) — hiển thị hồ sơ nhà hàng. */
  totalComplaintsAllTime: number;
  validComplaintsAllTime: number;
  /** Tỉ lệ khiếu nại hợp lệ trên tổng đơn (0..1). */
  complaintRate: number;
  level: MerchantComplaintLevel;
  thresholds: {
    warnRate: number;
    lockRate: number;
    lockDays: number;
  };
  warnings: MerchantWarningEntity[];
}

export interface MerchantComplaintEvaluationResult {
  evaluated: number;
  warned: number;
  locked: number;
  skipped: number;
}

interface RequestUser {
  userId?: string;
  roles?: string[];
}

@Injectable()
export class MerchantMonitorService {
  private readonly logger = new Logger(MerchantMonitorService.name);

  constructor(
    private readonly caseRepository: CaseRepository,
    private readonly warningRepository: MerchantWarningRepository,
    private readonly integration: IntegrationService,
  ) {}

  /** Đọc cấu hình từ env, giữ mặc định 7 ngày / 5% / 15% / khóa 30 ngày. */
  private get config() {
    return {
      windowDays: this.positiveInt(
        "MERCHANT_COMPLAINT_WINDOW_DAYS",
        MERCHANT_COMPLAINT_DEFAULTS.windowDays,
      ),
      warnRate: this.rate(
        "MERCHANT_COMPLAINT_WARN_RATE",
        MERCHANT_COMPLAINT_DEFAULTS.warnRate,
      ),
      lockRate: this.rate(
        "MERCHANT_COMPLAINT_LOCK_RATE",
        MERCHANT_COMPLAINT_DEFAULTS.lockRate,
      ),
      lockDays: this.positiveInt(
        "MERCHANT_COMPLAINT_LOCK_DAYS",
        MERCHANT_COMPLAINT_DEFAULTS.lockDays,
      ),
      minOrders: this.positiveInt(
        "MERCHANT_COMPLAINT_MIN_ORDERS",
        MERCHANT_COMPLAINT_DEFAULTS.minOrders,
      ),
    };
  }

  private positiveInt(key: string, fallback: number): number {
    const v = Number(process.env[key]);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
  }

  private rate(key: string, fallback: number): number {
    const v = Number(process.env[key]);
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : fallback;
  }

  /**
   * Đánh giá toàn bộ nhà hàng có phát sinh đơn trong cửa sổ:
   *   > 5%  ⇒ ghi cảnh báo (hiện trên app, bấm "Đã hiểu" để ẩn)
   *   > 15% ⇒ khóa tài khoản 1 tháng (đồng bộ merchant + identity)
   *
   * Idempotent theo tuần ISO: chạy lại trong cùng tuần chỉ cập nhật số liệu,
   * không tạo cảnh báo trùng và không khóa lặp.
   */
  async evaluateAll(days?: number): Promise<MerchantComplaintEvaluationResult> {
    const cfg = this.config;
    const windowDays = this.normalizeDays(days, cfg.windowDays);
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - windowDays * 86400000);

    const [complaints, orderCounts] = await Promise.all([
      this.caseRepository.getMerchantComplaintStats(windowStart),
      this.integration.getMerchantOrderCounts(windowStart, windowEnd),
    ]);

    if (!orderCounts) {
      this.logger.warn(
        "Bỏ qua đánh giá tỉ lệ khiếu nại: order-service không phản hồi",
      );
      return { evaluated: 0, warned: 0, locked: 0, skipped: 0 };
    }

    const ordersByMerchant = new Map(
      orderCounts.map((row) => [row.merchantId, row]),
    );
    const periodKey = complaintPeriodKey(windowEnd);

    let warned = 0;
    let locked = 0;
    let evaluated = 0;

    for (const complaint of complaints) {
      const orders = ordersByMerchant.get(complaint.merchantId);
      if (!orders) continue;
      evaluated += 1;

      const decision = decideMerchantComplaintLevel({
        totalOrders: orders.totalOrders,
        validComplaints: complaint.validComplaints,
        minOrders: cfg.minOrders,
        warnRate: cfg.warnRate,
        lockRate: cfg.lockRate,
      });
      if (decision.level === "NONE") continue;

      if (decision.level === "LOCK") {
        const lockSince = new Date(
          windowEnd.getTime() - cfg.lockDays * 86400000,
        );
        const alreadyLocked = await this.warningRepository.hasRecentLock(
          complaint.merchantId,
          lockSince,
        );
        if (alreadyLocked) continue;

        const title = "Tài khoản bị tạm khóa 1 tháng";
        const message = this.lockMessage(
          complaint.validComplaints,
          orders.totalOrders,
          decision.rate,
          cfg.lockDays,
        );

        // Khóa thật trước, chỉ ghi cảnh báo LOCK khi merchant/identity đã nhận.
        // Nếu ghi trước mà khóa thất bại, cờ `hasRecentLock` sẽ chặn mọi lần thử
        // lại trong 30 ngày trong khi nhà hàng vẫn hoạt động bình thường.
        const suspended = await this.integration.suspendMerchant(
          complaint.merchantId,
          cfg.lockDays,
          title,
        );
        if (!suspended.ok) {
          this.logger.warn(
            `Không khóa được nhà hàng ${complaint.merchantId}: ${suspended.error}`,
          );
          continue;
        }

        const warning = await this.warningRepository.upsertForPeriod({
          merchantId: complaint.merchantId,
          level: "LOCK",
          periodKey,
          windowDays,
          windowStart,
          windowEnd,
          totalOrders: orders.totalOrders,
          cancelledOrders: orders.cancelledOrders,
          totalComplaints: complaint.totalComplaints,
          validComplaints: complaint.validComplaints,
          complaintRate: decision.rate,
          title,
          message,
        });
        locked += 1;
        this.logger.log(
          `Đã khóa nhà hàng ${complaint.merchantId} ${cfg.lockDays} ngày ` +
            `(tỉ lệ khiếu nại ${(decision.rate * 100).toFixed(2)}%)`,
        );
        await this.notifyOwner(complaint.merchantId, warning);
        continue;
      }

      // WARNING — nhà hàng có thể đã bấm "Đã hiểu" trong tuần này.
      await this.warningRepository.upsertForPeriod({
        merchantId: complaint.merchantId,
        level: "WARNING",
        periodKey,
        windowDays,
        windowStart,
        windowEnd,
        totalOrders: orders.totalOrders,
        cancelledOrders: orders.cancelledOrders,
        totalComplaints: complaint.totalComplaints,
        validComplaints: complaint.validComplaints,
        complaintRate: decision.rate,
        title: "Cảnh báo tỉ lệ khiếu nại",
        message: this.warningMessage(
          complaint.validComplaints,
          orders.totalOrders,
          decision.rate,
          cfg.warnRate,
          cfg.lockRate,
          cfg.lockDays,
          windowDays,
        ),
      });
      warned += 1;
    }

    return {
      evaluated,
      warned,
      locked,
      skipped: Math.max(0, complaints.length - evaluated),
    };
  }

  /** Số liệu sức khỏe + cảnh báo còn hiệu lực của một nhà hàng. */
  async getHealth(
    merchantId: string,
    user?: RequestUser,
    days?: number,
  ): Promise<MerchantComplaintHealth> {
    await this.assertMerchantAccess(merchantId, user);

    const cfg = this.config;
    const windowDays = this.normalizeDays(days, cfg.windowDays);
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - windowDays * 86400000);

    const [complaintStats, allTimeStats, orderStats, warnings] =
      await Promise.all([
        this.caseRepository.getMerchantComplaintStats(windowStart, merchantId),
        // Tích lũy từ trước đến nay: admin cần con số tổng, không chỉ tuần.
        this.caseRepository.getMerchantComplaintStats(new Date(0), merchantId),
        this.integration.getMerchantOrderStats(
          merchantId,
          windowStart,
          windowEnd,
        ),
        this.warningRepository.findActive(merchantId, windowStart),
      ]);

    const totalComplaints = complaintStats[0]?.totalComplaints ?? 0;
    const validComplaints = complaintStats[0]?.validComplaints ?? 0;
    const totalOrders = orderStats?.totalOrders ?? 0;
    const decision = decideMerchantComplaintLevel({
      totalOrders,
      validComplaints,
      minOrders: cfg.minOrders,
      warnRate: cfg.warnRate,
      lockRate: cfg.lockRate,
    });

    return {
      merchantId,
      windowDays,
      windowStart,
      windowEnd,
      totalOrders,
      cancelledOrders: orderStats?.cancelledOrders ?? 0,
      totalComplaints,
      validComplaints,
      totalComplaintsAllTime: allTimeStats[0]?.totalComplaints ?? 0,
      validComplaintsAllTime: allTimeStats[0]?.validComplaints ?? 0,
      complaintRate: decision.rate,
      level: decision.level,
      thresholds: {
        warnRate: cfg.warnRate,
        lockRate: cfg.lockRate,
        lockDays: cfg.lockDays,
      },
      warnings,
    };
  }

  /** Nhà hàng bấm "Đã hiểu" — cảnh báo không hiện lại trong tuần. */
  async dismissWarning(
    warningId: string,
    merchantId: string,
    user?: RequestUser,
  ): Promise<MerchantWarningEntity> {
    const warning = await this.warningRepository.findById(warningId);
    if (!warning) {
      throw new NotFoundException(`Warning ${warningId} not found`);
    }
    if (warning.merchantId !== merchantId) {
      throw new ForbiddenException("Cảnh báo không thuộc nhà hàng này");
    }
    await this.assertMerchantAccess(merchantId, user);
    return this.warningRepository.dismiss(warning, user?.userId ?? "merchant");
  }

  /** Chủ nhà hàng chỉ được xem cảnh báo của chính mình; admin xem tất cả. */
  private async assertMerchantAccess(
    merchantId: string,
    user?: RequestUser,
  ): Promise<void> {
    const roles = user?.roles ?? [];
    if (roles.includes("ADMIN")) return;
    if (!roles.includes("MERCHANT_OWNER")) {
      throw new ForbiddenException("Không có quyền xem dữ liệu nhà hàng");
    }
    let merchant: any = null;
    try {
      merchant = await this.integration.getMerchant(merchantId);
    } catch {
      // merchant-service lỗi ⇒ không xác thực được quyền sở hữu.
      merchant = null;
    }
    if (!merchant || String(merchant.userId) !== String(user?.userId)) {
      throw new ForbiddenException("Không có quyền xem dữ liệu nhà hàng");
    }
  }

  private normalizeDays(days: number | undefined, fallback: number): number {
    return Number.isFinite(days) && (days as number) > 0
      ? Math.floor(days as number)
      : fallback;
  }

  private warningMessage(
    validComplaints: number,
    totalOrders: number,
    rate: number,
    warnRate: number,
    lockRate: number,
    lockDays: number,
    windowDays: number,
  ): string {
    return (
      `Trong ${windowDays} ngày gần nhất, nhà hàng có ` +
      `${validComplaints}/${totalOrders} đơn bị khiếu nại hợp lệ ` +
      `(${(rate * 100).toFixed(2)}%), vượt ngưỡng ${(warnRate * 100).toFixed(0)}%. ` +
      `Nếu tỉ lệ vượt ${(lockRate * 100).toFixed(0)}%, tài khoản sẽ bị khóa ${lockDays} ngày.`
    );
  }

  private lockMessage(
    validComplaints: number,
    totalOrders: number,
    rate: number,
    lockDays: number,
  ): string {
    return (
      `Nhà hàng có ${validComplaints}/${totalOrders} đơn bị khiếu nại hợp lệ ` +
      `(${(rate * 100).toFixed(2)}%), vượt ngưỡng khóa. Tài khoản bị tạm khóa ` +
      `${lockDays} ngày và sẽ tự mở khóa khi hết hạn.`
    );
  }

  private async notifyOwner(
    merchantId: string,
    warning: MerchantWarningEntity,
  ): Promise<void> {
    try {
      const merchant = await this.integration.getMerchant(merchantId);
      const ownerId = merchant?.userId;
      if (!ownerId) return;
      await this.integration.notify(ownerId, warning.title, warning.message);
    } catch (err: any) {
      this.logger.warn(
        `Không gửi được thông báo khóa cho nhà hàng ${merchantId}: ${err?.message}`,
      );
    }
  }
}
