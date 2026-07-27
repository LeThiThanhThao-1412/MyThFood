import { Injectable, Logger } from "@nestjs/common";
import { DispatchRepository } from "../infrastructure/dispatch.repository";
import { Dispatch } from "../domain/dispatch.aggregate";

/**
 * Matching Engine - tìm tài xế theo vòng tròn bán kính mở rộng
 *
 * Thuật toán:
 * 1. Bắt đầu với bán kính 1.5km, incentive 1.0x
 * 2. Nếu không tìm thấy → mở rộng 3km (1.2x), 5km (1.5x), 7km (2.0x), unlimited (2.5x)
 * 3. Timeout 300s (5 phút) → auto expire
 * 4. COD orders: kiểm tra ví driver ≥ 2M VND
 */

export interface DriverMatch {
  driverId: string;
  distanceKm: number;
  incentiveMultiplier: number;
  codEligible?: boolean;
}

export interface MatchingResult {
  matched: boolean;
  driver?: DriverMatch;
  searchRadius: number;
  incentiveMultiplier: number;
  attemptsRemaining: number;
  message?: string;
}

const SEARCH_RINGS = [
  { radius: 1.5, incentive: 1.0 },
  { radius: 3.0, incentive: 1.2 },
  { radius: 5.0, incentive: 1.5 },
  { radius: 7.0, incentive: 2.0 },
  { radius: Infinity, incentive: 2.5 },
];

const MATCHING_TIMEOUT_SECONDS = 300; // 5 phút
const MAX_RETRY_ATTEMPTS = 3;

@Injectable()
export class MatchingEngineService {
  private readonly logger = new Logger(MatchingEngineService.name);

  constructor(private readonly dispatchRepo: DispatchRepository) {}

  /**
   * Execute one round of matching for a dispatch.
   * If no driver found at current ring, the caller should increment retryCount and call again.
   */
  async findBestDriver(
    dispatch: Dispatch,
    retryCount: number,
    isCodOrder: boolean = false,
    walletServiceUrl?: string,
    authToken?: string,
  ): Promise<MatchingResult> {
    const ringIndex = Math.min(retryCount, SEARCH_RINGS.length - 1);
    const ring = SEARCH_RINGS[ringIndex]!;

    this.logger.log(
      `Matching dispatch ${dispatch.id.value} - Ring ${ringIndex + 1}/${SEARCH_RINGS.length} - Radius ${ring.radius}km, Incentive ${ring.incentive}x`,
    );

    // Get available drivers within radius
    const drivers = await this.dispatchRepo.findAvailableDriversNearLocation(
      dispatch.dispatchMerchantLatitude || dispatch.dispatchDeliveryLatitude,
      dispatch.dispatchMerchantLongitude || dispatch.dispatchDeliveryLongitude,
      ring.radius,
    );

    if (drivers.length === 0) {
      const msg = `No drivers found within ${ring.radius}km`;
      this.logger.warn(msg);
      return {
        matched: false,
        searchRadius: ring.radius,
        incentiveMultiplier: ring.incentive,
        attemptsRemaining: MAX_RETRY_ATTEMPTS - retryCount,
        message: msg,
      };
    }

    // Filter out previously matched drivers
    const previouslyMatched = dispatch.dispatchMatchedDriverIds;
    const eligibleDrivers = drivers.filter(
      (d) => !previouslyMatched.includes(d.driverId),
    );

    if (eligibleDrivers.length === 0) {
      return {
        matched: false,
        searchRadius: ring.radius,
        incentiveMultiplier: ring.incentive,
        attemptsRemaining: MAX_RETRY_ATTEMPTS - retryCount,
        message: "All drivers at this radius have already been attempted",
      };
    }

    // COD check: verify wallet balance ≥ 2M VND
    let codEligible = false;
    if (isCodOrder && walletServiceUrl && authToken) {
      const filtered: typeof eligibleDrivers = [];
      for (const d of eligibleDrivers) {
        try {
          const res = await fetch(
            `${walletServiceUrl}/api/v1/wallets/check-cod-eligibility/${d.driverId}`,
            { headers: { Authorization: `Bearer ${authToken}` } },
          );
          if (res.ok) {
            const data: any = await res.json();
            if (data.eligible) {
              filtered.push(d);
              codEligible = true;
            }
          }
        } catch {
          // If wallet service unavailable, skip check and allow driver
          filtered.push(d);
        }
      }
      if (filtered.length === 0) {
        return {
          matched: false,
          searchRadius: ring.radius,
          incentiveMultiplier: ring.incentive,
          attemptsRemaining: MAX_RETRY_ATTEMPTS - retryCount,
          message: "No COD-eligible drivers found at this radius",
        };
      }
    }

    // Select closest driver
    const best = eligibleDrivers.reduce((a, b) =>
      a.distanceKm < b.distanceKm ? a : b,
    );

    return {
      matched: true,
      driver: {
        driverId: best.driverId,
        distanceKm: best.distanceKm,
        incentiveMultiplier: ring.incentive,
        codEligible: codEligible,
      },
      searchRadius: ring.radius,
      incentiveMultiplier: ring.incentive,
      attemptsRemaining: MAX_RETRY_ATTEMPTS - retryCount,
    };
  }

  /**
   * Check if dispatch has timed out
   */
  isTimedOut(dispatch: Dispatch): boolean {
    const now = new Date();
    const expiresAt = dispatch.dispatchExpiresAt;
    if (!expiresAt) return false;

    // Also check: created more than MATCHING_TIMEOUT_SECONDS ago
    const createdAt = dispatch.createdAt; // using inherited from AggregateRoot
    const elapsed = (now.getTime() - (createdAt?.getTime() || now.getTime())) / 1000;
    return elapsed > MATCHING_TIMEOUT_SECONDS;
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  static haversineKm(
    lat1: number, lng1: number,
    lat2: number, lng2: number,
  ): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}