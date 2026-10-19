import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";

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

  constructor(private readonly httpService: HttpService) {}

  private get serviceKey(): string {
    return process.env.SERVICE_API_KEY || "mythfood-service-key";
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
  ): Promise<any> {
    for (const base of this.candidates(envKey, dockerUrl, localUrl)) {
      try {
        const res = await firstValueFrom(
          this.httpService.get(`${base}${path}`, {
            headers: { "x-service-key": this.serviceKey },
          }),
        );
        return res.data;
      } catch (err: any) {
        this.logger.warn(
          `GET ${envKey}${path} failed against ${base}: ${err?.message}`,
        );
      }
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

  async holdSettlement(orderId: string): Promise<void> {
    if (!orderId) return;
    await this.post(
      "WALLET_SERVICE_URL",
      "http://wallet-service:3009",
      "http://localhost:3009",
      "/api/v1/wallets/settlement/hold",
      { orderId },
    );
  }

  async releaseSettlement(orderId: string): Promise<void> {
    if (!orderId) return;
    await this.post(
      "WALLET_SERVICE_URL",
      "http://wallet-service:3009",
      "http://localhost:3009",
      "/api/v1/wallets/settlement/release",
      { orderId },
    );
  }

  async settleFailureMoney(
    orderId: string,
    faultParty: string,
    severity: string,
  ): Promise<void> {
    if (!orderId) return;
    await this.post(
      "ORDER_SERVICE_URL",
      "http://order-service:3004",
      "http://localhost:3004",
      `/api/v1/orders/${orderId}/settle-failure-money`,
      { faultParty, severity },
    );
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
  ): Promise<any> {
    const body = await this.get(envKey, dockerUrl, localUrl, path);
    if (body && typeof body === "object" && "data" in body) {
      return (body as { data: unknown }).data ?? null;
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
    );
  }

  /** D5 — Vết GPS của tài xế (driver-service), dùng cho GPS_SPOOFING. */
  async getDriverLocationHistory(driverId: string, limit = 200): Promise<any> {
    if (!driverId) return [];
    const safeLimit = Math.min(1000, Math.max(1, limit));
    const data = await this.getData(
      "DRIVER_SERVICE_URL",
      "http://driver-service:3007",
      "http://localhost:3007",
      `/api/v1/drivers/${driverId}/location/history?limit=${safeLimit}`,
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
    );
    return data ?? [];
  }

  /** D6 — Thanh toán của đơn (payment-service), dùng cho CHARGEBACK_FRAUD. */
  async getPaymentByOrder(orderId: string): Promise<any> {
    if (!orderId) return null;
    return this.getData(
      "PAYMENT_SERVICE_URL",
      "http://payment-service:3006",
      "http://localhost:3006",
      `/api/v1/payments/order/${orderId}`,
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
    );
    return data ?? [];
  }

  /** D13 — Hồ sơ khách hàng theo identity userId (consumer-service). */
  async getConsumerByUserId(userId: string): Promise<any> {
    if (!userId) return null;
    return this.getData(
      "CONSUMER_SERVICE_URL",
      "http://consumer-service:3002",
      "http://localhost:3002",
      `/api/v1/consumers/user/${userId}`,
    );
  }

  /** D12 — Hồ sơ nhà hàng (merchant-service). */
  async getMerchant(merchantId: string): Promise<any> {
    if (!merchantId) return null;
    return this.getData(
      "MERCHANT_SERVICE_URL",
      "http://merchant-service:3003",
      "http://localhost:3003",
      `/api/v1/merchants/${merchantId}`,
    );
  }

  /** D8 — Lịch sử giao dịch ví (wallet-service), dùng cho COD_THEFT. */
  async getWalletTransactions(ownerId: string): Promise<any> {
    if (!ownerId) return [];
    const data = await this.getData(
      "WALLET_SERVICE_URL",
      "http://wallet-service:3009",
      "http://localhost:3009",
      `/api/v1/wallets/${ownerId}/transactions`,
    );
    return data ?? [];
  }

  /**
   * Ảnh lưu ở chế độ local trỏ về `http://localhost:3010/...` nên khi chạy
   * trong docker phải đổi sang `UPLOAD_SERVICE_URL`.
   */
  private resolveImageUrl(url: string): string {
    const uploadBase = process.env.UPLOAD_SERVICE_URL;
    if (!uploadBase) return url;
    const marker = "/api/v1/upload/";
    const idx = url.indexOf(marker);
    return idx === -1 ? url : `${uploadBase}${url.slice(idx)}`;
  }

  /**
   * Tải ảnh bằng chứng về dạng base64 để đưa vào prompt vision của Gemini.
   * Trả về null nếu URL không phải ảnh hoặc không tải được.
   */
  async downloadImage(
    url: string,
  ): Promise<{ mimeType: string; base64: string; url: string } | null> {
    if (!url) return null;
    try {
      const res = await firstValueFrom(
        this.httpService.get(this.resolveImageUrl(url), {
          responseType: "arraybuffer",
          timeout: 15000,
          headers: { "x-service-key": this.serviceKey },
        }),
      );
      const rawType = String(res.headers?.["content-type"] ?? "");
      const mimeType = rawType.split(";")[0]?.trim() || "image/jpeg";
      if (!mimeType.startsWith("image/")) {
        this.logger.warn(`downloadImage skipped (not an image): ${mimeType}`);
        return null;
      }
      return {
        mimeType,
        base64: Buffer.from(res.data as ArrayBuffer).toString("base64"),
        url,
      };
    } catch (err: any) {
      this.logger.warn(`downloadImage failed for ${url}: ${err?.message}`);
      return null;
    }
  }
}
