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

  async suspendDriver(driverId: string, durationDays: number): Promise<void> {
    await this.patch(
      "DRIVER_SERVICE_URL",
      "http://driver-service:3007",
      "http://localhost:3007",
      `/api/v1/drivers/${driverId}/compliance`,
      { action: "SUSPEND", durationDays },
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

  async suspendMerchant(merchantId: string): Promise<void> {
    await this.patch(
      "MERCHANT_SERVICE_URL",
      "http://merchant-service:3003",
      "http://localhost:3003",
      `/api/v1/merchants/${merchantId}/status`,
      { status: "SUSPENDED" },
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
}
