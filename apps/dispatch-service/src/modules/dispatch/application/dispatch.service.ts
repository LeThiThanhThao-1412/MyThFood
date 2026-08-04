import { Injectable, Logger } from "@nestjs/common";
import { BusinessRuleViolationError } from "@mythfood/shared-kernel";
import { DispatchRepository } from "../infrastructure/dispatch.repository";
import { Dispatch } from "../domain/dispatch.aggregate";
import { DispatchId } from "../domain/dispatch-id";
import {
  CreateDispatchDto,
  AssignDriverDto,
  DriverDeclineDto,
  CancelDispatchDto,
  UpdateDispatchNotesDto,
} from "./dtos/dispatch.dto";

const WALLET_SERVICE_URL = process.env.WALLET_SERVICE_URL || "http://localhost:3009";
const MIN_COD_BALANCE = 2_000_000;

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(private readonly dispatchRepo: DispatchRepository) {}

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
    isCodOrder: boolean = false,
    authToken?: string,
  ): Promise<Dispatch> {
    const dispatch = await this.dispatchRepo.findByIdOrFail(
      DispatchId.from(id),
    );

    // Check COD eligibility before assigning driver
    if (isCodOrder && dto.driverId) {
      const isEligible = await this.checkCodEligibility(
        dto.driverId,
        authToken,
      );
      if (!isEligible) {
        throw new BusinessRuleViolationError(
          `Driver ${dto.driverId} does not meet COD requirements (min balance: ${MIN_COD_BALANCE.toLocaleString("vi-VN")} VND)`,
        );
      }
      this.logger.log(`Driver ${dto.driverId} passed COD eligibility check`);
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

      const data = await response.json() as { eligible?: boolean; balance?: number };
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
    const dispatch = await this.dispatchRepo.findByIdOrFail(DispatchId.from(id));
    return {
      dispatchId: dispatch.id.value,
      status: dispatch.dispatchStatus,
      driverId: dispatch.dispatchDriverId,
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
