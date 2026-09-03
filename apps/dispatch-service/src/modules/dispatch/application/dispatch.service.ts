import { Injectable, Logger } from "@nestjs/common";
import { BusinessRuleViolationError } from "@mythfood/shared-kernel";
import { DispatchRepository } from "../infrastructure/dispatch.repository";
import { Dispatch, DispatchStatus } from "../domain/dispatch.aggregate";
import { DispatchId } from "../domain/dispatch-id";
import { MatchingEngineService } from "./matching-engine.service";
import {
  CreateDispatchDto,
  AssignDriverDto,
  DriverDeclineDto,
  CancelDispatchDto,
  UpdateDispatchNotesDto,
} from "./dtos/dispatch.dto";

const WALLET_SERVICE_URL =
  process.env.WALLET_SERVICE_URL || "http://wallet-service:3009";
const ORDER_SERVICE_URL =
  process.env.ORDER_SERVICE_URL || "http://order-service:3004";
const DRIVER_SERVICE_URL =
  process.env.DRIVER_SERVICE_URL || "http://driver-service:3007";
const MIN_COD_BALANCE = 2_000_000;

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly dispatchRepo: DispatchRepository,
    private readonly matchingEngine: MatchingEngineService,
  ) {}

  // ---- Dispatch CRUD ----

  async createDispatch(dto: CreateDispatchDto): Promise<Dispatch> {
    const existing = await this.dispatchRepo.findByOrderId(dto.orderId);
    if (existing) {
      throw new BusinessRuleViolationError(
        "Dispatch already exists for this order",
      );
    }
    const dispatch = Dispatch.create(dto);
    await this.dispatchRepo.save(dispatch);

    // Auto-match: tìm & gán tài xế gần nhất ngay lập tức
    try {
      return await this.autoMatchDispatch(dispatch.id.value);
    } catch (err: any) {
      this.logger.warn(
        `Auto-match failed for dispatch ${dispatch.id.value}: ${err.message}`,
      );
      return dispatch;
    }
  }

  /**
   * Chạy matching engine theo vòng bán kính mở rộng (1.5→3→5→7→∞ km)
   * và gán tài xế gần nhất cho dispatch đang ở trạng thái MATCHING.
   */
  async autoMatchDispatch(id: string): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    if (dispatch.dispatchStatus !== DispatchStatus.MATCHING) {
      return dispatch;
    }

    for (let ring = 0; ring < 5; ring++) {
      const result = await this.matchingEngine.findBestDriver(
        dispatch,
        ring,
        false,
      );
      if (result.matched && result.driver) {
        dispatch.assignDriver(result.driver.driverId);
        await this.dispatchRepo.save(dispatch);
        this.logger.log(
          `Auto-assigned driver ${result.driver.driverId} (${result.driver.distanceKm.toFixed(2)} km) to dispatch ${id}`,
        );
        return dispatch;
      }
    }
    return dispatch;
  }

  async getById(id: string): Promise<Dispatch> {
    const dispatchId = DispatchId.from(id);
    return this.dispatchRepo.findByIdOrFail(dispatchId);
  }

  async getByOrderId(orderId: string): Promise<Dispatch | null> {
    return this.dispatchRepo.findByOrderId(orderId);
  }

  async getByDriverId(driverId: string): Promise<Dispatch[]> {
    return this.dispatchRepo.findByDriverId(driverId);
  }

  async getByMerchantId(merchantId: string): Promise<Dispatch[]> {
    return this.dispatchRepo.findByMerchantId(merchantId);
  }

  async getAll(filter?: {
    status?: string;
    driverId?: string;
    orderId?: string;
    skip?: number;
    take?: number;
  }): Promise<Dispatch[]> {
    return this.dispatchRepo.findAll(filter);
  }

  async getActiveDispatches(): Promise<Dispatch[]> {
    return this.dispatchRepo.findActiveDispatches();
  }

  async getMatchingDispatches(): Promise<Dispatch[]> {
    return this.dispatchRepo.findMatchingDispatches();
  }

  async updateNotes(
    id: string,
    dto: UpdateDispatchNotesDto,
  ): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.updateNotes(dto.notes);
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  async deleteDispatch(id: string): Promise<void> {
    const dispatchId = DispatchId.from(id);
    await this.dispatchRepo.deleteById(dispatchId);
  }

  // ---- Matching Engine ----

  async assignDriver(
    id: string,
    dto: AssignDriverDto,
    _isCodOrder: boolean = false,
    authToken?: string,
  ): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );

    // Check if this order is COD by querying the order service
    let isCodOrder = _isCodOrder;
    try {
      const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
      const orderUrl = `${ORDER_SERVICE_URL}/api/v1/orders/${dispatch.dispatchOrderId}`;
      this.logger.log(`🔍 [COD-DEBUG] Querying order: ${orderUrl}`);
      const orderRes = await fetch(orderUrl, {
        headers: { "x-service-key": serviceKey },
      });
      if (orderRes.ok) {
        const orderData = (await orderRes.json()) as any;
        const paymentMethod =
          orderData?.paymentMethod || orderData?.data?.paymentMethod;
        isCodOrder = paymentMethod === "CASH" || paymentMethod === "COD";
        this.logger.log(
          `🔍 [COD-DEBUG] Order ${dispatch.dispatchOrderId} paymentMethod=${paymentMethod} → isCodOrder=${isCodOrder}`,
        );
      } else {
        this.logger.warn(
          `🔍 [COD-DEBUG] Order query failed: HTTP ${orderRes.status} (fallback isCodOrder=${_isCodOrder})`,
        );
      }
    } catch (err: any) {
      this.logger.warn(
        `🔍 [COD-DEBUG] Order query error: ${err.message} (fallback isCodOrder=${_isCodOrder})`,
      );
    }

    // Check COD eligibility before assigning driver
    if (isCodOrder && dto.driverId) {
      this.logger.log(
        `🔍 [COD-DEBUG] Checking COD eligibility for driver ${dto.driverId}...`,
      );
      const isEligible = await this.checkCodEligibility(
        dto.driverId,
        authToken,
      );
      if (!isEligible) {
        this.logger.warn(
          `🔍 [COD-DEBUG] Driver ${dto.driverId} NOT eligible for COD`,
        );
        throw new BusinessRuleViolationError(
          `Driver ${dto.driverId} does not meet COD requirements (min balance: ${MIN_COD_BALANCE.toLocaleString("vi-VN")} VND)`,
        );
      }
      this.logger.log(
        `🔍 [COD-DEBUG] Driver ${dto.driverId} passed COD check ✅`,
      );
    } else {
      this.logger.log(
        `🔍 [COD-DEBUG] Skipping COD check: isCodOrder=${isCodOrder}, hasDriver=${!!dto.driverId}`,
      );
    }

    dispatch.assignDriver(dto.driverId);
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  /**
   * Check if a driver's wallet balance meets COD requirements.
   * Calls wallet-service API: GET /api/v1/wallets/check-cod-eligibility/:driverId
   */
  private async checkCodEligibility(
    driverId: string,
    authToken?: string,
  ): Promise<boolean> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const response = await fetch(
        `${WALLET_SERVICE_URL}/api/v1/wallets/check-cod-eligibility/${driverId}`,
        { headers },
      );

      if (!response.ok) {
        this.logger.warn(
          `Wallet check-cod-eligibility returned ${response.status} for driver ${driverId}`,
        );
        return false;
      }

      const data = (await response.json()) as {
        eligible?: boolean;
        balance?: number;
      };
      if (typeof data.eligible === "boolean") {
        return data.eligible;
      }

      // Fallback: check balance manually
      if (typeof data.balance === "number") {
        return data.balance >= MIN_COD_BALANCE;
      }

      return false;
    } catch (error: any) {
      this.logger.error(
        `Failed to check COD eligibility for driver ${driverId}: ${error.message}`,
      );
      // SAFETY: If wallet service is unavailable, REJECT the assignment
      // to prevent drivers with insufficient balance from taking COD orders
      this.logger.warn(
        `Wallet service unavailable - REJECTING COD assignment for driver ${driverId} (fail-safe)`,
      );
      return false;
    }
  }

  async driverAccept(id: string): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.driverAccept();
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  async driverDecline(id: string, dto: DriverDeclineDto): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.driverDecline(dto.reason, dto.detail);
    await this.dispatchRepo.save(dispatch);
    // Tự tìm tài xế khác khi còn lượt retry
    if (dispatch.hasRemainingRetries) {
      try {
        return await this.autoMatchDispatch(id);
      } catch {
        /* ignore */
      }
    }
    return dispatch;
  }

  // ---- Dispatch Lifecycle ----

  async driverArrived(id: string): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.driverArrived();
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  async markPickedUp(id: string): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.markPickedUp();
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  async startDelivering(id: string): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.startDelivering();
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  async markDelivered(id: string): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.markDelivered();
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  async expireDispatch(id: string): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.expire();
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  async cancelDispatch(id: string, dto: CancelDispatchDto): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.cancel(dto.reason);
    await this.dispatchRepo.save(dispatch);
    return dispatch;
  }

  // ---- Cron: Expire Stale Dispatches ----

  async expireStaleDispatches(): Promise<number> {
    const matchingDispatches = await this.dispatchRepo.findMatchingDispatches();
    const now = new Date();
    let expiredCount = 0;

    for (const dispatch of matchingDispatches) {
      const expiresAt = dispatch.dispatchExpiresAt;
      if (expiresAt && expiresAt < now && dispatch.isActive) {
        dispatch.expire();
        await this.dispatchRepo.save(dispatch);
        expiredCount++;
      }
    }

    return expiredCount;
  }

  // ---- Nearby (B3) ----
  async getNearbyDispatches(
    lat: number,
    lng: number,
    radiusKm: number,
  ): Promise<Dispatch[]> {
    const matching = await this.dispatchRepo.findMatchingDispatches();
    return matching.filter((d) => {
      if (!d.dispatchDeliveryLatitude || !d.dispatchDeliveryLongitude) {
        return false;
      }
      const distance = this._haversineDistance(
        lat,
        lng,
        d.dispatchDeliveryLatitude,
        d.dispatchDeliveryLongitude,
      );
      return distance <= radiusKm;
    });
  }

  // ---- Location (B3) ----
  async getDispatchLocation(id: string): Promise<any> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );

    // Lấy GPS hiện tại của tài xế từ driver-service (server-to-server)
    let driverLatitude: number | null = null;
    let driverLongitude: number | null = null;
    const driverId = dispatch.dispatchDriverId;
    if (driverId) {
      try {
        const serviceKey =
          process.env.SERVICE_API_KEY || "mythfood-service-key";
        const res = await fetch(
          `${DRIVER_SERVICE_URL}/api/v1/drivers/${driverId}`,
          { headers: { "x-service-key": serviceKey } },
        );
        if (res.ok) {
          const json: any = await res.json();
          const d = json?.data ?? json;
          const lat = Number(d?.currentLatitude ?? d?.latitude);
          const lng = Number(d?.currentLongitude ?? d?.longitude);
          if (!Number.isNaN(lat)) driverLatitude = lat;
          if (!Number.isNaN(lng)) driverLongitude = lng;
        }
      } catch {
        /* non-fatal */
      }
    }

    return {
      dispatchId: dispatch.id.value,
      status: dispatch.dispatchStatus,
      driverId,
      driverLatitude,
      driverLongitude,
      merchantLatitude: dispatch.dispatchMerchantLatitude,
      merchantLongitude: dispatch.dispatchMerchantLongitude,
      deliveryLatitude: dispatch.dispatchDeliveryLatitude,
      deliveryLongitude: dispatch.dispatchDeliveryLongitude,
    };
  }

  private _haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
