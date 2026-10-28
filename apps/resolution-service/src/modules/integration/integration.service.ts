import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";

/**
 * Lỗi đọc dữ liệu từ service khác (dùng cho assistant).
 *
 * Trước đây mọi thất bại đều bị nuốt thành `null` nên admin chỉ thấy
 * "service không phản hồi hoặc chưa có bản ghi" — không phân biệt được
 * service chết, sai URL, 401 do thiếu service key hay 404 do sai id.
 * Lỗi này mang theo path + từng lần thử để hiển thị đúng nguyên nhân.
 */
export class IntegrationReadError extends Error {
  constructor(
    readonly path: string,
    readonly attempts: string[],
  ) {
    super(
      `GET ${path} thất bại (${attempts.length || 1} lần thử): ` +
        (attempts.join(" | ") || "không rõ nguyên nhân"),
    );
    this.name = "IntegrationReadError";
  }
}

/** Cờ cho các lần đọc phục vụ AI: lỗi phải nổi lên thay vì trả null im lặng. */
interface ReadOptions {
  strict?: boolean;
}

/**
 * Phản hồi của các route quyết toán tiền (order-service → wallet-service).
 *
 * Mỗi field là **tuỳ chọn** vì mỗi route trả một tập khác nhau và vì
 * order-service có thể là phiên bản cũ (chỉ trả `{ ok: true }`) — người gọi phải
 * chịu được việc thiếu số liệu thay vì crash.
 */
export interface SettlementResponse {
  settled?: boolean;
  duplicated?: boolean;
  /** `FULL_REFUND`: số tiền thực sự vào ví khách. */
  refundAmount?: number;
  /** `SHIP_COMPENSATION`: số tiền thực sự vào ví khách. */
  amount?: number;
  charged?: number;
  clawback?: number;
  /** Lý do ví/order-service bỏ qua quyết toán (`FAILURE_ALREADY_SETTLED`...). */
  skipped?: string | null;
  reason?: string | null;
}

/**
 * Best-effort cross-service HTTP integration.
 *
 * Every call is fire-and-forget: if the target service is unreachable or the
 * endpoint does not exist yet, we log a warning and continue. This keeps the
 * resolution-service runnable standalone while the wallet/driver/merchant/
 * notification services expose the dedicated compliance endpoints.
 */
@Injectable()
export class IntegrationService {
  private readonly logger = new Logger(IntegrationService.name);

  /**
   * Cache ảnh bằng chứng đã tải (URL → bytes).
   *
   * Vì sao cần: mỗi lần admin bấm "Phân tích lại", 4–6 ảnh được tải lại từ
   * upload-service/S3. Chỉ cần một lần DNS phân giải lỗi (`EAI_AGAIN`/`ENOTFOUND`
   * khi container hỏi S3) là ảnh đó bị bỏ **vĩnh viễn** khỏi lượt phân tích ⇒
   * AI kết luận "không có ảnh". Cache giữ ảnh đã tải thành công để lượt sau
   * không phụ thuộc mạng ngoài nữa.
   */
  private readonly imageCache = new Map<
    string,
    { image: DownloadedImage; at: number }
  >();

  constructor(private readonly httpService: HttpService) {}

  private get serviceKey(): string {
    return process.env.SERVICE_API_KEY || "mythfood-service-key";
  }

  /**
   * Timeout cho các lần đọc dữ liệu phục vụ AI.
   *
   * Auto-analysis chạy ngay khi khiếu nại được tạo; một service chết mà không có
   * timeout sẽ giữ tiến trình chờ vô hạn ⇒ bản phân tích không bao giờ được lưu.
   * Fail-fast (mặc định 8s) để nguồn đó được ghi "KHÔNG CÓ" và AI vẫn kết luận
   * bằng dữ liệu còn lại.
   */
  private get readTimeoutMs(): number {
    const raw = Number(process.env.ANALYSIS_HTTP_TIMEOUT_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : 8000;
  }

  private candidates(
    envKey: string,
    dockerUrl: string,
    localUrl: string,
  ): string[] {
    const urls = [process.env[envKey], dockerUrl, localUrl].filter(
      (u): u is string => !!u,
    );
    return [...new Set(urls)];
  }

  private async post(
    envKey: string,
    dockerUrl: string,
    localUrl: string,
    path: string,
    payload: unknown,
  ): Promise<void> {
    for (const base of this.candidates(envKey, dockerUrl, localUrl)) {
      try {
        await firstValueFrom(
          this.httpService.post(`${base}${path}`, payload, {
            headers: {
              "Content-Type": "application/json",
              "x-service-key": this.serviceKey,
            },
          }),
        );
        return;
      } catch (err: any) {
        this.logger.warn(
          `POST ${envKey}${path} failed against ${base}: ${err?.message}`,
        );
      }
    }
  }

  /**
   * POST có ĐỌC kết quả — dùng riêng cho các route quyết toán tiền.
   *
   * Vì sao cần: `post()` ở trên là fire-and-forget nên resolution-service không
   * biết ví đã chuyển bao nhiêu (hoặc đã bỏ qua). Hệ quả cũ: case VALID ghi
   * `COMPENSATION` đúng bằng số tiền **theo chính sách** kể cả khi ví trả
   * `FAILURE_ALREADY_SETTLED` ⇒ bút toán ảo (CASE-2026-000002: 93.247đ).
   *
   * Trả `{ data: null, error }` khi mọi candidate đều lỗi ⇒ người gọi coi như
   * "chưa chuyển đồng nào" và không ghi hình phạt tiền.
   */
  private async postForData(
    envKey: string,
    dockerUrl: string,
    localUrl: string,
    path: string,
    payload: unknown,
  ): Promise<{ data: SettlementResponse | null; error: string | null }> {
    for (const base of this.candidates(envKey, dockerUrl, localUrl)) {
      try {
        const res = await firstValueFrom(
          this.httpService.post(`${base}${path}`, payload, {
            headers: {
              "Content-Type": "application/json",
              "x-service-key": this.serviceKey,
            },
            timeout: this.readTimeoutMs,
          }),
        );
        const body: any = res.data;
        return {
          data: (body?.data ?? body) as SettlementResponse,
          error: null,
        };
      } catch (err: any) {
        this.logger.warn(
          `POST ${envKey}${path} failed against ${base}: ${err?.message}`,
        );
      }
    }
    return { data: null, error: "CALL_FAILED" };
  }

  private async patch(
    envKey: string,
    dockerUrl: string,
    localUrl: string,
    path: string,
    payload: unknown,
  ): Promise<void> {
    for (const base of this.candidates(envKey, dockerUrl, localUrl)) {
      try {
        await firstValueFrom(
          this.httpService.patch(`${base}${path}`, payload, {
            headers: {
              "Content-Type": "application/json",
              "x-service-key": this.serviceKey,
            },
          }),
        );
        return;
      } catch (err: any) {
        this.logger.warn(
          `PATCH ${envKey}${path} failed against ${base}: ${err?.message}`,
        );
      }
    }
  }

  private async get(
    envKey: string,
    dockerUrl: string,
    localUrl: string,
    path: string,
    options: ReadOptions = {},
  ): Promise<any> {
    const attempts: string[] = [];
    for (const base of this.candidates(envKey, dockerUrl, localUrl)) {
      try {
        const res = await firstValueFrom(
          this.httpService.get(`${base}${path}`, {
            headers: { "x-service-key": this.serviceKey },
            timeout: this.readTimeoutMs,
          }),
        );
        return res.data;
      } catch (err: any) {
        const status =
          err?.response?.status ??
          err?.response?.statusCode ??
          err?.status ??
          err?.code;
        const message =
          err?.response?.data?.message ??
          err?.response?.statusText ??
          err?.message ??
          "unknown";
        const reason = `${base}${path} → ${status ?? "?"} ${String(message).slice(0, 160)}`;
        attempts.push(reason);
        this.logger.warn(`GET ${envKey}${path} failed: ${reason}`);
      }
    }
    if (options.strict) {
      throw new IntegrationReadError(path, attempts);
    }
    return null;
  }

  async getOrder(orderId: string): Promise<any> {
    if (!orderId) return null;
    return this.get(
      "ORDER_SERVICE_URL",
      "http://order-service:3004",
      "http://localhost:3004",
      `/api/v1/orders/${orderId}`,
    );
  }

  async holdSettlement(orderId: string, caseId?: string | null): Promise<void> {
    if (!orderId) return;
    await this.post(
      "WALLET_SERVICE_URL",
      "http://wallet-service:3009",
      "http://localhost:3009",
      "/api/v1/wallets/settlement/hold",
      { orderId, caseId: caseId ?? undefined },
    );
  }

  /**
   * Mở khoá doanh thu của đơn và đóng dấu **ngày phán quyết** để dòng tiền vào
   * đúng lô quyết toán 23:00 của ngày đó (`settleOn`).
   *
   * Ví chỉ đổi các dòng đang HELD_BY_DISPUTE ⇒ gọi lại nhiều lần vẫn an toàn;
   * đây là cơ sở cho cron "read-repair" của resolution-service.
   */
  async releaseSettlement(
    orderId: string,
    options?: { caseId?: string | null; resolvedAt?: Date | string | null },
  ): Promise<void> {
    if (!orderId) return;
    const resolvedAt = options?.resolvedAt
      ? new Date(options.resolvedAt)
      : new Date();
    await this.post(
      "WALLET_SERVICE_URL",
      "http://wallet-service:3009",
      "http://localhost:3009",
      "/api/v1/wallets/settlement/release",
      {
        orderId,
        caseId: options?.caseId ?? undefined,
        resolvedAt: Number.isNaN(resolvedAt.getTime())
          ? new Date().toISOString()
          : resolvedAt.toISOString(),
      },
    );
  }

  async settleFailureMoney(
    orderId: string,
    faultParty: string,
    severity: string,
    caseId?: string | null,
    resolvedAt?: Date | string | null,
  ): Promise<SettlementResponse | null> {
    if (!orderId) return null;
    const { data } = await this.postForData(
      "ORDER_SERVICE_URL",
      "http://order-service:3004",
      "http://localhost:3004",
      `/api/v1/orders/${orderId}/settle-failure-money`,
      {
        faultParty,
        severity,
        caseId: caseId ?? undefined,
        // Mốc phán quyết: ví đóng `settleOn` = 23:00 của ngày này lên các dòng
        // escrow vừa giải toả, để doanh thu vào đúng lô quyết toán.
        resolvedAt:
          resolvedAt instanceof Date
            ? resolvedAt.toISOString()
            : (resolvedAt ?? undefined),
      },
    );
    return data;
  }

  /**
   * Bồi thường cho khách khi đơn **đã giao xong** nhưng dịch vụ có lỗi (giao
   * trễ, thái độ...): chỉ hoàn phần phí ship và trừ đúng bên lỗi.
   *
   * Khác `settleFailureMoney` (luồng đơn giao thất bại: hoàn 100% + huỷ escrow)
   * — dùng luồng này để hai con số "khách nhận" và "bên lỗi chịu" luôn bằng nhau
   * và tiền món của nhà hàng không bị đụng tới.
   */
  async settleCaseCompensation(input: {
    orderId: string;
    caseId?: string;
    category?: string;
    faultParty: string;
    amount: number;
  }): Promise<SettlementResponse | null> {
    if (!input.orderId || !(input.amount > 0)) return null;
    const { data } = await this.postForData(
      "ORDER_SERVICE_URL",
      "http://order-service:3004",
      "http://localhost:3004",
      `/api/v1/orders/${input.orderId}/settle-compensation`,
      {
        caseId: input.caseId,
        category: input.category,
        faultParty: input.faultParty,
        amount: input.amount,
      },
    );
    return data;
  }

  async debit(
    ownerId: string,
    ownerType: string,
    amount: number,
    description: string,
  ): Promise<void> {
    await this.post(
      "WALLET_SERVICE_URL",
      "http://wallet-service:3009",
      "http://localhost:3009",
      "/api/v1/wallets/penalty/debit",
      { ownerId, ownerType, amount, description },
    );
  }

  async credit(
    ownerId: string,
    ownerType: string,
    amount: number,
    description: string,
  ): Promise<void> {
    await this.post(
      "WALLET_SERVICE_URL",
      "http://wallet-service:3009",
      "http://localhost:3009",
      "/api/v1/wallets/penalty/credit",
      { ownerId, ownerType, amount, description },
    );
  }

  async suspendDriver(
    driverId: string,
    durationDays: number,
    reason?: string,
  ): Promise<void> {
    await this.patch(
      "DRIVER_SERVICE_URL",
      "http://driver-service:3007",
      "http://localhost:3007",
      `/api/v1/drivers/${driverId}/compliance`,
      { action: "SUSPEND", durationDays, reason },
    );
  }

  /** Khóa vĩnh viễn tài xế (BAN) kèm lý do hiển thị khi đăng nhập. */
  async banDriver(driverId: string, reason?: string): Promise<void> {
    await this.patch(
      "DRIVER_SERVICE_URL",
      "http://driver-service:3007",
      "http://localhost:3007",
      `/api/v1/drivers/${driverId}/compliance`,
      { action: "BAN", reason },
    );
  }

  async deductReputation(driverId: string, points: number): Promise<void> {
    await this.patch(
      "DRIVER_SERVICE_URL",
      "http://driver-service:3007",
      "http://localhost:3007",
      `/api/v1/drivers/${driverId}/compliance`,
      { action: "DEDUCT_REPUTATION", points },
    );
  }

  async suspendMerchant(
    merchantId: string,
    durationDays?: number,
    reason?: string,
  ): Promise<void> {
    await this.patch(
      "MERCHANT_SERVICE_URL",
      "http://merchant-service:3003",
      "http://localhost:3003",
      `/api/v1/merchants/${merchantId}/status`,
      { status: "SUSPENDED", durationDays, reason },
    );
  }

  async suspendConsumer(
    consumerId: string,
    status: "SUSPENDED" | "BANNED",
  ): Promise<void> {
    await this.patch(
      "CONSUMER_SERVICE_URL",
      "http://consumer-service:3002",
      "http://localhost:3002",
      `/api/v1/consumers/${consumerId}/status`,
      { status },
    );
  }

  async notify(userId: string, title: string, body: string): Promise<void> {
    await this.post(
      "NOTIFICATION_SERVICE_URL",
      "http://notification-service:3013",
      "http://localhost:3013",
      "/api/v1/notifications",
      { userId, title, body },
    );
  }

  // ==========================================================================
  // Read-only lookups (dùng cho AI assistant / hậu kiểm)
  //
  // Khác với các hàm hành động ở trên (fire-and-forget), nhóm này trả về dữ
  // liệu để phân tích. Vẫn best-effort: service không chạy → trả null/[].
  // ==========================================================================

  /**
   * Bóc vỏ `{ statusCode, data }` nếu có.
   *
   * Một số endpoint trả về envelope, một số trả payload trực tiếp (vd:
   * order-service `GET /orders/:id`). Helper này chuẩn hoá cả hai.
   */
  private async getData(
    envKey: string,
    dockerUrl: string,
    localUrl: string,
    path: string,
    options: ReadOptions = {},
  ): Promise<any> {
    const body = await this.get(envKey, dockerUrl, localUrl, path, options);
    if (body && typeof body === "object") {
      // Một số service trả HTTP 200 kèm envelope lỗi (vd: `{statusCode: 401}`).
      // Nếu bỏ qua, assistant sẽ coi nguồn đó là "CÓ" với payload rỗng.
      const status = (body as { statusCode?: unknown }).statusCode;
      if (typeof status === "number" && status >= 400) {
        if (options.strict) {
          const message = String(
            (body as { message?: unknown }).message ?? "",
          ).slice(0, 160);
          throw new IntegrationReadError(path, [
            `${path} → HTTP ${status} trong envelope: ${message || "không có message"}`,
          ]);
        }
        return null;
      }
      if ("data" in body) {
        return (body as { data: unknown }).data ?? null;
      }
    }
    return body;
  }

  /** D2 — Timeline trạng thái của đơn (order-service, B6). */
  async getOrderTimeline(orderId: string): Promise<any> {
    if (!orderId) return null;
    return this.getData(
      "ORDER_SERVICE_URL",
      "http://order-service:3004",
      "http://localhost:3004",
      `/api/v1/orders/${orderId}/timeline`,
      { strict: true },
    );
  }

  /** D9 — Lịch sử đơn của khách (order-service). */
  async getOrdersByConsumer(consumerId: string): Promise<any> {
    if (!consumerId) return [];
    const data = await this.getData(
      "ORDER_SERVICE_URL",
      "http://order-service:3004",
      "http://localhost:3004",
      `/api/v1/orders/consumer/${consumerId}`,
      { strict: true },
    );
    return data ?? [];
  }

  /** D10 — Lịch sử đơn của tài xế (order-service). */
  async getOrdersByDriver(driverId: string): Promise<any> {
    if (!driverId) return [];
    const data = await this.getData(
      "ORDER_SERVICE_URL",
      "http://order-service:3004",
      "http://localhost:3004",
      `/api/v1/orders/driver/${driverId}`,
      { strict: true },
    );
    return data ?? [];
  }

  /** D3 — Chuyến điều phối gắn với đơn (dispatch-service). */
  async getDispatchByOrder(orderId: string): Promise<any> {
    if (!orderId) return null;
    return this.getData(
      "DISPATCH_SERVICE_URL",
      "http://dispatch-service:3008",
      "http://localhost:3008",
      `/api/v1/dispatches/order/${orderId}`,
      { strict: true },
    );
  }

  /**
   * D4 — Vết GPS của tài xế (driver-service).
   *
   * Khi biết đơn/khoảng thời gian, phải lọc theo đó: endpoint cũ trả 200 điểm
   * **cũ nhất** của tài xế nên với tài xế chạy nhiều đơn, AI không bao giờ thấy
   * đoạn đường tới lúc giao hàng.
   */
  async getDriverLocationHistory(
    driverId: string,
    options: {
      orderId?: string;
      from?: string | null;
      to?: string | null;
      limit?: number;
    } = {},
  ): Promise<any> {
    if (!driverId) return [];
    const params = new URLSearchParams();
    const limit = Math.min(1000, Math.max(1, options.limit ?? 400));
    params.set("limit", String(limit));
    if (options.orderId) params.set("orderId", options.orderId);
    if (options.from) params.set("from", options.from);
    if (options.to) params.set("to", options.to);
    const data = await this.getData(
      "DRIVER_SERVICE_URL",
      "http://driver-service:3007",
      "http://localhost:3007",
      `/api/v1/drivers/${driverId}/location/history?${params.toString()}`,
      { strict: true },
    );
    return data ?? [];
  }

  /** D12 — Hồ sơ công khai của tài xế (rating, uy tín, số đơn). */
  async getDriverProfile(driverId: string): Promise<any> {
    if (!driverId) return null;
    return this.getData(
      "DRIVER_SERVICE_URL",
      "http://driver-service:3007",
      "http://localhost:3007",
      `/api/v1/drivers/${driverId}/public-profile`,
      { strict: true },
    );
  }

  /** D5 — Đánh giá của đơn (review-service). */
  async getReviewsByOrder(orderId: string): Promise<any> {
    if (!orderId) return [];
    const data = await this.getData(
      "REVIEW_SERVICE_URL",
      "http://review-service:3011",
      "http://localhost:3011",
      `/api/v1/reviews/order/${orderId}`,
      { strict: true },
    );
    return data ?? [];
  }

  /**
   * D17 — Đánh giá của nhà hàng (kèm tổng số + điểm trung bình).
   *
   * Dùng `get()` thô thay vì `getData()` vì envelope còn chứa `total` và
   * `averageRating` — hai số liệu quan trọng để đánh giá mẫu đánh giá xấu.
   */
  async getMerchantReviews(
    merchantId: string,
    take = 10,
  ): Promise<{
    items: any[];
    total: number | null;
    averageRating: number | null;
  } | null> {
    if (!merchantId) return null;
    const body = await this.get(
      "REVIEW_SERVICE_URL",
      "http://review-service:3011",
      "http://localhost:3011",
      `/api/v1/reviews/merchant/${merchantId}?skip=0&take=${Math.min(50, Math.max(1, take))}`,
      { strict: true },
    );
    if (!body || typeof body !== "object") return null;
    return {
      items: Array.isArray(body.data) ? body.data : [],
      total: typeof body.total === "number" ? body.total : null,
      averageRating:
        typeof body.averageRating === "number" ? body.averageRating : null,
    };
  }

  /** D18 — Đánh giá khách dành cho tài xế (kèm phân bố điểm). */
  async getDriverReviews(
    driverId: string,
    take = 10,
  ): Promise<{
    items: any[];
    total: number | null;
    averageRating: number | null;
    distribution: Record<string, number> | null;
  } | null> {
    if (!driverId) return null;
    const body = await this.get(
      "REVIEW_SERVICE_URL",
      "http://review-service:3011",
      "http://localhost:3011",
      `/api/v1/reviews/driver/${driverId}?skip=0&take=${Math.min(50, Math.max(1, take))}`,
      { strict: true },
    );
    if (!body || typeof body !== "object") return null;
    return {
      items: Array.isArray(body.data) ? body.data : [],
      total: typeof body.total === "number" ? body.total : null,
      averageRating:
        typeof body.averageRating === "number" ? body.averageRating : null,
      distribution:
        body.distribution && typeof body.distribution === "object"
          ? body.distribution
          : null,
    };
  }

  /** D15 — Thực đơn của nhà hàng (merchant-service). */
  async getMerchantMenu(merchantId: string): Promise<any[]> {
    if (!merchantId) return [];
    const data = await this.getData(
      "MERCHANT_SERVICE_URL",
      "http://merchant-service:3003",
      "http://localhost:3003",
      `/api/v1/merchants/${merchantId}/menu?includeUnavailable=true`,
      { strict: true },
    );
    return Array.isArray(data) ? data : [];
  }

  /** D16 — Các mã khuyến mãi của nhà hàng (promotion-service). */
  async getMerchantPromotions(merchantId: string): Promise<any[]> {
    if (!merchantId) return [];
    const data = await this.getData(
      "PROMOTION_SERVICE_URL",
      "http://promotion-service:3012",
      "http://localhost:3012",
      `/api/v1/promotions/merchant/${merchantId}`,
      { strict: true },
    );
    return Array.isArray(data) ? data : [];
  }

  /** D16 — Các chương trình flash sale của nhà hàng. */
  async getMerchantFlashSales(merchantId: string): Promise<any[]> {
    if (!merchantId) return [];
    const body: any = await this.getData(
      "PROMOTION_SERVICE_URL",
      "http://promotion-service:3012",
      "http://localhost:3012",
      `/api/v1/promotions/flash-sales/merchant/${merchantId}`,
      { strict: true },
    );
    if (Array.isArray(body)) return body;
    return Array.isArray(body?.items) ? body.items : [];
  }

  /** D16 — Ưu đãi thực tế của đơn (mã đã dùng + suất flash sale). */
  async getPromotionUsageByOrder(orderId: string): Promise<any> {
    if (!orderId) return null;
    return this.getData(
      "PROMOTION_SERVICE_URL",
      "http://promotion-service:3012",
      "http://localhost:3012",
      `/api/v1/promotions/usages/order/${orderId}`,
      { strict: true },
    );
  }

  /** D19 — Hồ sơ năng lực tài xế, đã whitelist ở driver-service (không PII). */
  async getDriverAnalyticsProfile(driverId: string): Promise<any> {
    if (!driverId) return null;
    return this.getData(
      "DRIVER_SERVICE_URL",
      "http://driver-service:3007",
      "http://localhost:3007",
      `/api/v1/drivers/${driverId}/analytics-profile`,
      { strict: true },
    );
  }

  /** D6 — Thanh toán của đơn (payment-service), dùng cho CHARGEBACK_FRAUD. */
  async getPaymentByOrder(orderId: string): Promise<any> {
    if (!orderId) return null;
    return this.getData(
      "PAYMENT_SERVICE_URL",
      "http://payment-service:3006",
      "http://localhost:3006",
      `/api/v1/payments/order/${orderId}`,
      { strict: true },
    );
  }

  /** D7 — Chat khách ↔ tài xế của đơn (chat-service). */
  async getChatMessagesByOrder(orderId: string): Promise<any> {
    if (!orderId) return [];
    const data = await this.getData(
      "CHAT_SERVICE_URL",
      "http://chat-service:3015",
      "http://localhost:3015",
      `/api/v1/chat/conversations/order/${orderId}/messages`,
      { strict: true },
    );
    return data ?? [];
  }

  /**
   * D13 — Hồ sơ khách hàng (consumer-service).
   *
   * `reporterId` của vụ việc là **consumer profile id** (bảng `consumers`), còn
   * `/consumers/user/:userId` nhận identity userId. Trước đây chỉ gọi endpoint
   * user-id nên phần lớn vụ việc trả 404 ⇒ D13 luôn bị ghi "KHÔNG CÓ".
   * Thử profile id trước, chỉ fallback sang user id khi profile id không có.
   */
  async getConsumerProfile(id: string): Promise<any> {
    if (!id) return null;
    try {
      return await this.getData(
        "CONSUMER_SERVICE_URL",
        "http://consumer-service:3002",
        "http://localhost:3002",
        `/api/v1/consumers/${id}`,
        { strict: true },
      );
    } catch (profileError) {
      try {
        return await this.getData(
          "CONSUMER_SERVICE_URL",
          "http://consumer-service:3002",
          "http://localhost:3002",
          `/api/v1/consumers/user/${id}`,
          { strict: true },
        );
      } catch {
        // Báo lỗi của lần thử đầu — đó mới là id thật của vụ việc.
        throw profileError;
      }
    }
  }

  /** D12 — Hồ sơ nhà hàng (merchant-service). */
  async getMerchant(merchantId: string): Promise<any> {
    if (!merchantId) return null;
    return this.getData(
      "MERCHANT_SERVICE_URL",
      "http://merchant-service:3003",
      "http://localhost:3003",
      `/api/v1/merchants/${merchantId}`,
      { strict: true },
    );
  }

  /**
   * D8 — Lịch sử giao dịch ví (wallet-service), dùng cho COD_THEFT.
   *
   * `ownerType` là **bắt buộc về mặt nghiệp vụ**: wallet-service mặc định
   * `DRIVER`, nên ví của khách/nhà hàng sẽ không bao giờ được tìm thấy nếu chỉ
   * truyền ownerId.
   */
  async getWalletTransactions(
    ownerId: string,
    ownerType: "CONSUMER" | "DRIVER" | "MERCHANT" = "DRIVER",
  ): Promise<any> {
    if (!ownerId) return [];
    const params = new URLSearchParams({ ownerType });
    const data = await this.getData(
      "WALLET_SERVICE_URL",
      "http://wallet-service:3009",
      "http://localhost:3009",
      `/api/v1/wallets/${ownerId}/transactions?${params.toString()}`,
      { strict: true },
    );
    return data ?? [];
  }

  /**
   * Các URL có thể thử tải cho một ảnh đã lưu.
   *
   * Ảnh upload qua upload-service được lưu với host của **client** (mặc định
   * `http://localhost:3010`), nên khi resolution-service chạy trong docker phải
   * đổi sang `UPLOAD_SERVICE_URL`. Thử lần lượt nhiều host (upload-service →
   * URL gốc → localhost) để ảnh vẫn tải được cả khi chạy docker lẫn chạy tay,
   * và ghi lại từng lần thử khi hỏng.
   */
  private imageUrlCandidates(url: string): string[] {
    const trimmed = url.trim();
    const marker = "/api/v1/upload/";
    const idx = trimmed.indexOf(marker);
    const candidates = new Set<string>();

    if (idx !== -1) {
      const path = trimmed.slice(idx);
      const uploadBase = (process.env.UPLOAD_SERVICE_URL ?? "").replace(
        /\/+$/,
        "",
      );
      if (uploadBase) candidates.add(`${uploadBase}${path}`);
      candidates.add(`http://upload-service:3010${path}`);
      candidates.add(`http://localhost:3010${path}`);
    }
    candidates.add(trimmed);
    return [...candidates];
  }

  /** Đoán MIME từ đuôi file — nhiều URL ảnh không có content-type chuẩn. */
  private mimeFromUrl(url: string): string {
    const clean = url.split("?")[0]?.split("#")[0] ?? url;
    const ext = clean.slice(clean.lastIndexOf(".") + 1).toLowerCase();
    const map: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
      heic: "image/heic",
      heif: "image/heif",
    };
    return map[ext] ?? "";
  }

  /**
   * Lý do thất bại ngắn gọn của một lượt tải (status + message của service).
   *
   * `responseType: "arraybuffer"` ⇒ body lỗi là Buffer, phải đổi sang chuỗi rồi
   * thử đọc `message` trong JSON (upload-service trả `{message: "File not found"}`).
   */
  private describeDownloadError(err: any): string {
    const status =
      err?.response?.status ?? err?.response?.statusCode ?? err?.code ?? "?";
    const body = err?.response?.data;
    let message = "";
    if (Buffer.isBuffer(body)) message = body.toString("utf8");
    else if (typeof body === "string") message = body;
    else if (body && typeof body === "object")
      message = String(body.message ?? "");
    if (message) {
      try {
        const parsed = JSON.parse(message);
        message = String(parsed?.message ?? message);
      } catch {
        // Không phải JSON (HTML/XML của S3, trang lỗi…) — giữ nguyên.
      }
    }
    if (!message) message = err?.message ?? "unknown";
    return `${status} ${message.replace(/\s+/g, " ").trim().slice(0, 140)}`;
  }

  /**
   * Giới hạn dung lượng 1 ảnh đưa vào prompt vision.
   *
   * Ảnh chụp từ app điện thoại thường 3–8MB; gửi nhiều ảnh cỡ đó làm request
   * model vượt hạn mức (và tăng latency) ⇒ cả lượt phân tích thất bại. Ảnh quá
   * lớn bị bỏ qua và được ghi vào `imagesSkipped` thay vì làm hỏng lượt gọi.
   */
  private get maxImageBytes(): number {
    const raw = Number(process.env.AI_MAX_IMAGE_BYTES);
    return Number.isFinite(raw) && raw > 0 ? raw : 5 * 1024 * 1024;
  }

  /** Thời gian giữ ảnh trong cache (mặc định 10 phút — đủ cho vài lượt phân tích lại). */
  private get imageCacheTtlMs(): number {
    const raw = Number(process.env.AI_IMAGE_CACHE_TTL_MS);
    return Number.isFinite(raw) && raw >= 0 ? raw : 10 * 60 * 1000;
  }

  /** Số URL tối đa giữ trong cache (mỗi entry ~1 ảnh base64). */
  private get imageCacheMax(): number {
    const raw = Number(process.env.AI_IMAGE_CACHE_MAX);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 12;
  }

  /** Số lần thử tải 1 URL ảnh khi lỗi **tạm thời** (DNS/timeout/5xx). */
  private get imageDownloadAttempts(): number {
    const raw = Number(process.env.AI_IMAGE_DOWNLOAD_ATTEMPTS);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 3;
  }

  /**
   * Lỗi tải ảnh có khả năng tự khỏi khi thử lại.
   *
   * `EAI_AGAIN`/`ENOTFOUND` xảy ra khi container phân giải DNS tới S3 trượt —
   * đây chính là lý do "4 ảnh còn 1 ảnh" ở lần phân tích lại. 404/403 thì
   * **không** thử lại (tải lại chỉ tốn 15s timeout của mỗi URL).
   */
  private isTransientDownloadError(err: any): boolean {
    const status = Number(err?.response?.status);
    if (Number.isFinite(status) && status > 0) {
      return status === 408 || status === 429 || status >= 500;
    }
    return true;
  }

  /** GET ảnh có thử lại khi lỗi mạng tạm thời (DNS/socket/timeout). */
  private async fetchImage(url: string): Promise<any> {
    const attempts = this.imageDownloadAttempts;
    let lastError: any = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await firstValueFrom(
          this.httpService.get(url, {
            responseType: "arraybuffer",
            timeout: 15000,
            maxRedirects: 5,
            headers: { "x-service-key": this.serviceKey },
          }),
        );
      } catch (err: any) {
        lastError = err;
        if (!this.isTransientDownloadError(err) || attempt === attempts) {
          throw err;
        }
        const waitMs = 200 * 3 ** (attempt - 1);
        this.logger.warn(
          `downloadImage lỗi tạm thời (${this.describeDownloadError(err)}) — ` +
            `thử lại ${attempt + 1}/${attempts} sau ${waitMs}ms: ${url}`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }

    throw lastError;
  }

  /** Đọc cache ảnh còn hạn; tự xoá entry hết hạn. */
  private readImageCache(url: string): DownloadedImage | null {
    const cached = this.imageCache.get(url);
    if (!cached) return null;
    if (Date.now() - cached.at > this.imageCacheTtlMs) {
      this.imageCache.delete(url);
      return null;
    }
    return cached.image;
  }

  /** Ghi cache ảnh, loại entry cũ nhất khi vượt hạn mức. */
  private writeImageCache(url: string, image: DownloadedImage): void {
    if (this.imageCacheTtlMs <= 0) return;
    this.imageCache.set(url, { image, at: Date.now() });
    while (this.imageCache.size > this.imageCacheMax) {
      const oldest = this.imageCache.keys().next().value;
      if (oldest === undefined) break;
      this.imageCache.delete(oldest);
    }
  }

  /**
   * Tải ảnh bằng chứng **kèm nguyên nhân** khi hỏng.
   *
   * `downloadImage()` chỉ trả `null` nên trước đây admin thấy "0 ảnh gửi AI" mà
   * không biết ảnh 404, quá dung lượng hay là redirect S3 lỗi. Kết quả ở đây
   * được lưu vào `snapshot.imageSkipReasons` và hiển thị lên admin-portal.
   */
  async downloadImageDetailed(
    url: string,
  ): Promise<{ image: DownloadedImage | null; reason: string }> {
    if (!url) return { image: null, reason: "URL rỗng" };

    // Lượt "Phân tích lại" dùng lại ảnh đã tải thành công — không phụ thuộc
    // DNS/S3 nữa (nguồn gốc của cảnh "4 ảnh còn 1 ảnh").
    const cached = this.readImageCache(url);
    if (cached) return { image: cached, reason: "" };

    const attempts: string[] = [];

    for (const candidate of this.imageUrlCandidates(url)) {
      try {
        const res = await this.fetchImage(candidate);
        const declared = String(res.headers?.["content-type"] ?? "")
          .split(";")[0]
          ?.trim()
          .toLowerCase();
        // upload-service trả `application/octet-stream` cho đuôi lạ (vd .HEIC):
        // đoán lại từ URL thay vì loại ảnh một cách âm thầm.
        const mimeType = declared?.startsWith("image/")
          ? declared
          : this.mimeFromUrl(candidate) || this.mimeFromUrl(url);

        if (!mimeType.startsWith("image/")) {
          attempts.push(
            `${candidate} → ${declared || "không rõ content-type"} (không phải ảnh)`,
          );
          continue;
        }
        if (!VISION_SAFE_MIME.has(mimeType)) {
          attempts.push(
            `${candidate} → ${mimeType} (định dạng chưa hỗ trợ, cần JPG/PNG/WebP)`,
          );
          continue;
        }

        const buffer = Buffer.from(res.data as ArrayBuffer);
        if (buffer.byteLength === 0) {
          attempts.push(`${candidate} → 200 nhưng nội dung rỗng`);
          continue;
        }
        if (buffer.byteLength > this.maxImageBytes) {
          attempts.push(
            `${candidate} → ${formatBytes(buffer.byteLength)} > ` +
              `${formatBytes(this.maxImageBytes)}`,
          );
          continue;
        }

        const image: DownloadedImage = {
          mimeType,
          base64: buffer.toString("base64"),
          url,
        };
        this.writeImageCache(url, image);
        return { image, reason: "" };
      } catch (err: any) {
        attempts.push(`${candidate} → ${this.describeDownloadError(err)}`);
      }
    }

    const reason = attempts.join(" | ") || "không rõ nguyên nhân";
    this.logger.warn(`downloadImage failed for ${url}: ${reason}`);
    return { image: null, reason };
  }

  /**
   * Tải ảnh bằng chứng về dạng base64 để đưa vào prompt vision.
   * Trả về null nếu URL không phải ảnh hoặc không tải được.
   */
  async downloadImage(url: string): Promise<DownloadedImage | null> {
    return (await this.downloadImageDetailed(url)).image;
  }
}

/** Ảnh đã tải xong, sẵn sàng gửi model vision. */
export interface DownloadedImage {
  mimeType: string;
  base64: string;
  url: string;
}

/**
 * Định dạng ảnh model vision thực sự đọc được.
 *
 * HEIC/HEIF (mặc định của iPhone) bị loại sớm kèm lý do rõ ràng thay vì gửi lên
 * model rồi nhận lỗi 1210 mơ hồ.
 */
const VISION_SAFE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** Dung lượng dễ đọc cho thông báo lỗi ("0.0MB" vô nghĩa với ảnh nhỏ). */
const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`;
