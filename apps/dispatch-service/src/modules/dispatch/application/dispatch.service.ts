import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  ConflictException,
} from "@nestjs/common";
import { BusinessRuleViolationError } from "@mythfood/shared-kernel";
import { DispatchRepository } from "../infrastructure/dispatch.repository";
import {
  Dispatch,
  DispatchDeclineReason,
  DispatchStatus,
} from "../domain/dispatch.aggregate";
import { DispatchId } from "../domain/dispatch-id";
import { MatchingEngineService } from "./matching-engine.service";
import {
  CreateDispatchDto,
  AssignDriverDto,
  DriverDeclineDto,
  CancelDispatchDto,
  UpdateDispatchNotesDto,
  DriverCancelDto,
  DeliveryFailedDto,
} from "./dtos/dispatch.dto";

const WALLET_SERVICE_URL =
  process.env.WALLET_SERVICE_URL || "http://wallet-service:3009";
const ORDER_SERVICE_URL =
  process.env.ORDER_SERVICE_URL || "http://order-service:3004";
const DRIVER_SERVICE_URL =
  process.env.DRIVER_SERVICE_URL || "http://driver-service:3007";
const MIN_COD_BALANCE = 2_000_000;

@Injectable()
export class DispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DispatchService.name);
  private timeoutInterval: ReturnType<typeof setInterval> | null = null;

  private static readonly DRIVER_RESPONSE_TIMEOUT_MS = 60_000;

  constructor(
    private readonly dispatchRepo: DispatchRepository,
    private readonly matchingEngine: MatchingEngineService,
  ) {}

  onModuleInit(): void {
    // Re-match dispatches where the assigned driver didn't respond within 1 minute.
    this.timeoutInterval = setInterval(() => {
      this.handleDriverNoResponse().catch((err) =>
        this.logger.warn(`Driver no-response sweep failed: ${err.message}`),
      );
    }, 15_000);
  }

  onModuleDestroy(): void {
    if (this.timeoutInterval) clearInterval(this.timeoutInterval);
  }

  /**
   * Finds DRIVER_ASSIGNED dispatches older than 1 minute and re-matches them
   * (the current driver is treated as having declined silently).
   */
  async handleDriverNoResponse(): Promise<void> {
    const cutoff = new Date(
      Date.now() - DispatchService.DRIVER_RESPONSE_TIMEOUT_MS,
    );
    const assigned = await this.dispatchRepo.findAssignedOlderThan(cutoff);
    for (const dispatch of assigned) {
      try {
        await this.driverDecline(dispatch.id.value, {
          driverId: dispatch.dispatchDriverId || "",
          reason: DispatchDeclineReason.OTHER,
          detail: "Không phản hồi trong 1 phút",
        });
        this.logger.log(
          `Driver ${dispatch.dispatchDriverId} timed out on dispatch ${dispatch.id.value} - re-matching`,
        );
      } catch (err: any) {
        this.logger.warn(
          `Timeout re-match failed for ${dispatch.id.value}: ${err.message}`,
        );
      }
    }
  }

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
    const driverId = dispatch.dispatchDriverId;
    if (!driverId) {
      throw new BusinessRuleViolationError(
        "No driver assigned to this dispatch",
      );
    }

    // Case 5: tài xế đang bận (có đơn dở dang / bị tạm khóa) thì không cho nhận.
    const available = await this.checkDriverAvailable(driverId);
    if (!available) {
      throw new BusinessRuleViolationError(
        "Tài xế đang có đơn khác hoặc bị tạm khóa nhận đơn",
      );
    }

    // Case 6: chốt đơn nguyên tử — đảm bảo 1 đơn chỉ 1 tài xế nhận được.
    const accepted = await this.dispatchRepo.acceptAtomic(id);
    if (!accepted) {
      throw new ConflictException("Đơn đã được tài xế khác nhận");
    }

    // Đánh dấu tài xế bận ngay lập tức.
    await this.markDriverBusy(driverId, dispatch.dispatchOrderId);

    return this.dispatchRepo.findByIdOrFail(DispatchId.from(id));
  }

  /**
   * Case 7: tài xế đã nhận đơn nhưng hủy → ghi lý do, phạt tài xế,
   * đưa đơn quay lại tìm tài xế khác.
   */
  async driverCancelAfterAccept(
    id: string,
    dto: DriverCancelDto,
  ): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    const driverId = dispatch.dispatchDriverId;
    dispatch.driverCancelAfterAccept(dto.reason);
    await this.dispatchRepo.save(dispatch);

    if (driverId) {
      await this.penalizeDriver(driverId);
      await this.releaseDriver(driverId);
    }

    // Báo order-service ghi lý do vào lịch sử + thông báo khách hàng.
    await this.notifyOrderDriverCancel(dispatch, dto.reason);

    if (dispatch.dispatchStatus === DispatchStatus.EXPIRED) {
      await this.notifyOrderNoDriver(dispatch);
      return dispatch;
    }

    if (dispatch.hasRemainingRetries) {
      try {
        return await this.autoMatchDispatch(id);
      } catch {
        /* ignore */
      }
    }
    return dispatch;
  }

  /**
   * Case 8: tài xế giao hàng thất bại (khách không nhận hàng).
   */
  async deliveryFailed(id: string, dto: DeliveryFailedDto): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.deliveryFailed(dto.reason);
    await this.dispatchRepo.save(dispatch);

    await this.notifyOrderDeliveryFailed(
      dispatch,
      dto.reason,
      dto.photoUrl,
      dto.faultParty,
    );

    const driverId = dispatch.dispatchDriverId;
    if (driverId) {
      await this.releaseDriver(driverId);
    }

    return dispatch;
  }

  async driverDecline(id: string, dto: DriverDeclineDto): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );
    dispatch.driverDecline(dto.reason, dto.detail);
    await this.dispatchRepo.save(dispatch);

    // Hết lượt tìm tài xế → không còn tài xế nhận đơn → hủy đơn (Case 3).
    if (dispatch.dispatchStatus === DispatchStatus.EXPIRED) {
      await this.notifyOrderNoDriver(dispatch);
      return dispatch;
    }

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
    await this.notifyOrderNoDriver(dispatch);
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

  /**
   * Case 3: khi dispatch hết thời gian chờ mà không có tài xế nhận,
   * báo order-service hủy đơn với trạng thái CANCELLED_NO_DRIVER.
   */
  private async notifyOrderNoDriver(dispatch: Dispatch): Promise<void> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      await fetch(
        `${ORDER_SERVICE_URL}/api/v1/orders/${dispatch.dispatchOrderId}/cancel-no-driver`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-service-key": serviceKey,
          },
          body: JSON.stringify({}),
        },
      );
      this.logger.log(
        `Notified order ${dispatch.dispatchOrderId} as CANCELLED_NO_DRIVER`,
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to notify no-driver cancellation for order ${dispatch.dispatchOrderId}: ${err.message}`,
      );
    }
  }

  private async checkDriverAvailable(driverId: string): Promise<boolean> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      const res = await fetch(
        `${DRIVER_SERVICE_URL}/api/v1/drivers/${driverId}`,
        { headers: { "x-service-key": serviceKey } },
      );
      if (!res.ok) return false;
      const json: any = await res.json();
      const d = json?.data ?? json;
      return (
        d?.status === "ACTIVE" &&
        d?.onlineStatus === "ONLINE" &&
        !d?.currentOrderId &&
        !d?.isBlocked
      );
    } catch {
      return false;
    }
  }

  private async markDriverBusy(
    driverId: string,
    orderId: string,
  ): Promise<void> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      await fetch(
        `${DRIVER_SERVICE_URL}/api/v1/drivers/${driverId}/assign-order`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-service-key": serviceKey,
          },
          body: JSON.stringify({ orderId }),
        },
      );
    } catch (err: any) {
      this.logger.warn(`markDriverBusy failed for ${driverId}: ${err.message}`);
    }
  }

  private async releaseDriver(driverId: string): Promise<void> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      await fetch(
        `${DRIVER_SERVICE_URL}/api/v1/drivers/${driverId}/release-order`,
        {
          method: "PATCH",
          headers: { "x-service-key": serviceKey },
        },
      );
    } catch (err: any) {
      this.logger.warn(`releaseDriver failed for ${driverId}: ${err.message}`);
    }
  }

  private async penalizeDriver(driverId: string): Promise<void> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      await fetch(
        `${DRIVER_SERVICE_URL}/api/v1/drivers/${driverId}/penalize-cancellation`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-service-key": serviceKey,
          },
          body: JSON.stringify({ blockMinutes: 30 }),
        },
      );
    } catch (err: any) {
      this.logger.warn(`penalizeDriver failed for ${driverId}: ${err.message}`);
    }
  }

  private async notifyOrderDriverCancel(
    dispatch: Dispatch,
    reason: string,
  ): Promise<void> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      await fetch(
        `${ORDER_SERVICE_URL}/api/v1/orders/${dispatch.dispatchOrderId}/driver-cancel`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-service-key": serviceKey,
          },
          body: JSON.stringify({ reason }),
        },
      );
    } catch (err: any) {
      this.logger.warn(`notifyOrderDriverCancel failed: ${err.message}`);
    }
  }

  private async notifyOrderDeliveryFailed(
    dispatch: Dispatch,
    reason: string,
    photoUrl?: string,
    faultParty?: string,
  ): Promise<void> {
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      await fetch(
        `${ORDER_SERVICE_URL}/api/v1/orders/${dispatch.dispatchOrderId}/delivery-failed`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-service-key": serviceKey,
          },
          body: JSON.stringify({ reason, photoUrl, faultParty }),
        },
      );
    } catch (err: any) {
      this.logger.warn(`notifyOrderDeliveryFailed failed: ${err.message}`);
    }
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
        await this.notifyOrderNoDriver(dispatch);
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
