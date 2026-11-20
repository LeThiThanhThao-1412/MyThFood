import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { BusinessRuleViolationError } from "@mythfood/shared-kernel";
import { DriverRepository } from "../infrastructure/driver.repository";
import {
  DriverLocationHistoryRepository,
  DriverLocationPoint,
} from "../infrastructure/driver-location-history.repository";
import {
  Driver,
  DriverOnlineStatus,
  DriverStatus,
} from "../domain/driver.aggregate";
import { DriverId } from "../domain/driver-id";
import { DriverGeoService } from "../../geo/driver-geo.service";
import {
  CreateDriverDto,
  UpdateDriverProfileDto,
  UpdateLocationDto,
  LocationPointDto,
  UpdateFatigueDto,
  RateDriverDto,
  DriverComplianceDto,
} from "./dtos/driver.dto";

/**
 * Sự kiện "đã lưu vị trí tài xế" — gateway realtime (`/tracking`) đăng ký
 * listener để fan-out cho app khách/điều phối. Dùng interface thay vì import
 * ngược gateway để tránh vòng phụ thuộc module.
 */
export interface LocationBroadcast {
  driverId: string;
  orderId: string | null;
  latitude: number;
  longitude: number;
  recordedAt: Date;
  source: "HTTP" | "WS";
}

export type LocationListener = (update: LocationBroadcast) => void;

/** Tài xế khả dụng + khoảng cách tới điểm tìm kiếm. */
export interface NearbyDriverResult {
  driver: Driver;
  distanceKm: number;
}

@Injectable()
export class DriverService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DriverService.name);

  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  /** Chu kỳ quét tài xế online bị "câm lặng" (đóng tab / mất mạng). */
  private static readonly SWEEP_INTERVAL_MS = 15_000;

  /** Sau bao lâu không gửi vị trí thì coi như mất kết nối → tự chuyển OFFLINE. */
  private static get OFFLINE_TIMEOUT_MS(): number {
    const seconds = Number(process.env.DRIVER_OFFLINE_TIMEOUT_SECONDS || 20);
    return (Number.isFinite(seconds) && seconds > 0 ? seconds : 20) * 1000;
  }

  constructor(
    private readonly driverRepo: DriverRepository,
    private readonly locationHistoryRepo: DriverLocationHistoryRepository,
    private readonly httpService: HttpService,
    private readonly geoService: DriverGeoService,
  ) {}

  // ---- Realtime location listeners (gateway /tracking) ----

  private readonly locationListeners: LocationListener[] = [];

  /** Đăng ký nhận sự kiện vị trí (gateway realtime). */
  registerLocationListener(listener: LocationListener): void {
    this.locationListeners.push(listener);
  }

  onModuleInit(): void {
    // Heartbeat: app tài xế gửi vị trí mỗi 5 giây (đóng vai trò "nhịp tim").
    // Nếu quá OFFLINE_TIMEOUT_MS không có vị trí mới (tài xế đóng tab / mất mạng),
    // tự chuyển tài xế sang OFFLINE để không còn nhận đơn.
    //
    // Lưu ý: tài xế VỪA bật ONLINE luôn được tính là có nhịp tim mới (xem
    // `Driver.driverLastHeartbeatAt`), nên có trọn OFFLINE_TIMEOUT_MS để app gửi
    // vị trí đầu tiên — không bị auto-offline ngay sau khi vừa bật Online.
    this.sweepInterval = setInterval(() => {
      this.sweepStaleOnlineDrivers().catch((err) =>
        this.logger.warn(
          `Auto-offline sweep failed: ${err?.message ?? String(err)}`,
        ),
      );
      this.sweepExpiredSuspensions().catch((err) =>
        this.logger.warn(
          `Auto-unlock sweep failed: ${err?.message ?? String(err)}`,
        ),
      );
    }, DriverService.SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.sweepInterval) clearInterval(this.sweepInterval);
  }

  // ---- Driver Profile CRUD ----

  async createDriver(dto: CreateDriverDto): Promise<Driver> {
    const existing = await this.driverRepo.findByUserId(dto.userId);
    if (existing) {
      throw new BusinessRuleViolationError(
        "Driver profile already exists for this user",
      );
    }
    const driver = Driver.create(dto);
    await this.driverRepo.save(driver);
    return driver;
  }

  async getById(id: string): Promise<Driver> {
    const driverId = DriverId.from(id);
    return this.driverRepo.findByIdOrFail(driverId);
  }

  async getByUserId(userId: string): Promise<Driver | null> {
    return this.driverRepo.findByUserId(userId);
  }

  async getAll(filter?: {
    status?: string;
    onlineStatus?: string;
    fatigueLevel?: string;
  }): Promise<Driver[]> {
    return this.driverRepo.findAll(filter);
  }

  async getAvailableDrivers(includeStackable = false): Promise<Driver[]> {
    return this.driverRepo.findAvailableDrivers(includeStackable);
  }

  /**
   * Tài xế khả dụng trong bán kính `radiusKm`, sắp xếp gần → xa.
   *
   * Pipeline: Redis `GEOSEARCH` (hot cache, O(log N + M)) → lọc lại theo danh
   * sách tài xế khả dụng trong DB (nguồn sự thật về trạng thái/đơn đang giữ).
   * Tài xế chưa có trong Redis (ví dụ Redis restart) vẫn được tính bằng
   * Haversine trên toạ độ lưu trong DB → không mất tài xế nào.
   */
  async getAvailableDriversNearby(params: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
    includeStackable?: boolean;
    limit?: number;
  }): Promise<NearbyDriverResult[]> {
    const latitude = Number(params.latitude);
    const longitude = Number(params.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return [];
    }

    const radiusKm = Math.min(
      9999,
      Math.max(0.1, Number(params.radiusKm ?? 5) || 5),
    );
    const limit = Math.min(
      50,
      Math.max(1, Math.trunc(Number(params.limit ?? 20) || 20)),
    );

    const available = await this.driverRepo.findAvailableDrivers(
      params.includeStackable === true,
    );
    const geoMatches = await this.geoService.nearby(
      latitude,
      longitude,
      radiusKm,
      limit * 4,
    );
    const geoDistances = new Map(
      geoMatches.map((match) => [match.driverId, match.distanceKm]),
    );

    const results: NearbyDriverResult[] = [];
    for (const driver of available) {
      const driverId = driver.id.toString();
      const geoDistance = geoDistances.get(driverId);

      let distanceKm: number;
      if (geoDistance != null) {
        distanceKm = geoDistance;
      } else {
        const driverLat = driver.driverCurrentLatitude;
        const driverLng = driver.driverCurrentLongitude;
        if (driverLat == null || driverLng == null) continue;
        distanceKm = DriverService.haversineKm(
          latitude,
          longitude,
          driverLat,
          driverLng,
        );
      }

      if (radiusKm < 9999 && distanceKm > radiusKm) continue;
      results.push({ driver, distanceKm });
    }

    results.sort((a, b) => a.distanceKm - b.distanceKm);
    return results.slice(0, limit);
  }

  private static haversineKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async updateProfile(
    id: string,
    dto: UpdateDriverProfileDto,
  ): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.updateProfile(dto);
    await this.driverRepo.save(driver);
    return driver;
  }

  async deleteDriver(id: string): Promise<void> {
    const driverId = DriverId.from(id);
    await this.driverRepo.deleteById(driverId);
  }

  // ---- Training & Activation ----

  async completeTraining(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.completeTraining();
    await this.driverRepo.save(driver);
    return driver;
  }

  async activateDriver(id: string, syncIdentity = true): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.activate();
    await this.driverRepo.save(driver);
    if (syncIdentity) {
      await this.syncIdentityAccount(driver.driverUserId, "ACTIVE");
    }
    return driver;
  }

  async deactivateDriver(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.deactivate();
    await this.driverRepo.save(driver);
    return driver;
  }

  /**
   * Khóa tài xế.
   *
   * @param durationDays Số ngày khóa (bỏ trống = khóa vĩnh viễn).
   * @param reason Lý do khóa — hiển thị cho tài xế khi đăng nhập.
   */
  async suspendDriver(
    id: string,
    durationDays?: number,
    reason?: string,
    syncIdentity = true,
  ): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    if (durationDays && durationDays > 0) {
      driver.suspendFor(durationDays);
    } else {
      driver.suspend();
    }
    await this.driverRepo.save(driver);
    if (syncIdentity) {
      await this.syncIdentityAccount(driver.driverUserId, "SUSPENDED", {
        reason,
        durationDays,
      });
    }
    return driver;
  }

  /**
   * Từ chối hồ sơ tài xế (admin action).
   * Lý do được đồng bộ sang identity-service để tài xế thấy thông báo khi
   * đăng nhập; tài khoản bị xóa sau 3 ngày.
   */
  async rejectDriver(
    id: string,
    reason?: string,
    syncIdentity = true,
  ): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.reject(reason);
    await this.driverRepo.save(driver);
    if (syncIdentity) {
      await this.syncIdentityAccount(driver.driverUserId, "REJECTED", {
        reason,
      });
    }
    return driver;
  }

  /** Mở khóa ngay tài xế đang bị khóa (không cần chờ hết hạn khóa). */
  async unlockDriver(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.unlock();
    await this.driverRepo.save(driver);
    await this.syncIdentityAccount(driver.driverUserId, "ACTIVE");
    return driver;
  }

  /** Đồng bộ trạng thái tài xế theo user (gọi từ identity-service khi khóa/mở user). */
  async setStatusByUserId(
    userId: string,
    status: string,
    options: { reason?: string; durationDays?: number } = {},
  ): Promise<Driver | null> {
    const driver = await this.driverRepo.findByUserId(userId);
    if (!driver) return null;
    if (status === "SUSPENDED") {
      return this.suspendDriver(
        driver.id.toString(),
        options.durationDays,
        options.reason,
        false,
      );
    }
    if (status === "REJECTED") {
      if (driver.driverStatus === DriverStatus.REJECTED) {
        return driver;
      }
      return this.rejectDriver(driver.id.toString(), options.reason, false);
    }
    if (status === "ACTIVE") {
      try {
        return await this.activateDriver(driver.id.toString(), false);
      } catch {
        return driver;
      }
    }
    return driver;
  }

  /**
   * Endpoint compliance cho resolution-service:
   * - SUSPEND → tạm khóa + chặn nhận đơn durationDays ngày
   * - DEDUCT_REPUTATION → trừ điểm uy tín
   */
  async applyCompliance(id: string, dto: DriverComplianceDto): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    switch (dto.action) {
      case "SUSPEND":
        driver.suspendFor(dto.durationDays ?? 7);
        break;
      case "BAN":
        // Khóa vĩnh viễn (không có ngày tự mở khóa).
        driver.suspend();
        break;
      case "DEDUCT_REPUTATION":
        driver.deductReputation(dto.points ?? 0);
        break;
      default:
        throw new BusinessRuleViolationError(
          `Unknown compliance action: ${dto.action}`,
        );
    }
    await this.driverRepo.save(driver);

    if (dto.action === "SUSPEND" || dto.action === "BAN") {
      const isBan = dto.action === "BAN";
      await this.syncIdentityAccount(driver.driverUserId, "SUSPENDED", {
        durationDays: isBan ? undefined : (dto.durationDays ?? 7),
        reason:
          dto.reason ??
          (isBan
            ? "Tài khoản bị khóa vĩnh viễn do vi phạm quy định"
            : "Tài khoản bị tạm khóa do vi phạm quy định"),
      });
    }

    return driver;
  }

  /**
   * Đồng bộ trạng thái tài khoản đăng nhập sang identity-service (best-effort).
   * - ACTIVE  → mở khóa / bỏ từ chối
   * - SUSPENDED → khóa (có thời hạn hoặc vĩnh viễn) kèm lý do
   * - REJECTED → từ chối hồ sơ kèm lý do
   */
  private async syncIdentityAccount(
    userId: string,
    status: "ACTIVE" | "SUSPENDED" | "REJECTED",
    options: { reason?: string; durationDays?: number } = {},
  ): Promise<void> {
    const baseUrl =
      process.env.IDENTITY_SERVICE_URL || "http://identity-service:3001";
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      if (status === "ACTIVE") {
        await firstValueFrom(
          this.httpService.patch(
            `${baseUrl}/api/v1/auth/users/${userId}/unlock`,
            {},
            { headers: { "x-service-key": serviceKey } },
          ),
        );
      } else if (status === "REJECTED") {
        await firstValueFrom(
          this.httpService.patch(
            `${baseUrl}/api/v1/auth/users/${userId}/reject`,
            { reason: options.reason },
            { headers: { "x-service-key": serviceKey } },
          ),
        );
      } else {
        await firstValueFrom(
          this.httpService.patch(
            `${baseUrl}/api/v1/auth/users/${userId}/status`,
            {
              status: "SUSPENDED",
              reason: options.reason,
              durationDays: options.durationDays,
            },
            { headers: { "x-service-key": serviceKey } },
          ),
        );
      }
    } catch (err: any) {
      this.logger.warn(
        `Sync identity account ${userId} (${status}) failed: ${err?.message ?? String(err)}`,
      );
    }
  }

  // ---- Online/Offline Status ----

  async goOnline(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.goOnline();
    await this.driverRepo.save(driver);
    return driver;
  }

  async goOffline(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.goOffline();
    await this.driverRepo.save(driver);
    // Rời tập "nóng" ngay để matching không trả về tài xế vừa tắt online.
    await this.removeFromGeoCache(driver.id.toString());
    return driver;
  }

  async goHome(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.goHome();
    await this.driverRepo.save(driver);
    return driver;
  }

  // ---- GPS Real-time Location ----

  async updateLocation(
    id: string,
    dto: UpdateLocationDto,
    source: "HTTP" | "WS" = "HTTP",
  ): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.updateLocation(dto.latitude, dto.longitude);
    await this.driverRepo.save(driver);

    // Ghi lịch sử GPS (mỗi lần cập nhật = 1 điểm), phục vụ theo dõi quãng đường
    // và kiểm chứng cơ chế "ghi nhận vị trí định kỳ" (mô phỏng hoặc thật).
    try {
      await this.locationHistoryRepo.savePoint({
        driverId: driver.id.toString(),
        orderId: driver.driverCurrentOrderId ?? null,
        latitude: dto.latitude,
        longitude: dto.longitude,
      });
    } catch (err: any) {
      this.logger.warn(`Failed to persist location history: ${err?.message}`);
    }

    await this.publishLocation(
      driver,
      {
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
      source,
    );

    return driver;
  }

  /**
   * Ghi **lô** điểm GPS (tối đa 100) trong 1 lần UPDATE + 1 INSERT.
   *
   * App tài xế lấy mẫu bằng `watchPosition` rồi gom lô → giảm mạnh số query so
   * với PATCH từng điểm mỗi 5 giây. Toạ độ vẫn được domain validate từng điểm
   * (tài xế phải ONLINE, toạ độ hợp lệ); vị trí hiện tại lấy theo điểm cuối.
   */
  async updateLocationsBatch(
    id: string,
    points: LocationPointDto[],
  ): Promise<{ driver: Driver; accepted: number }> {
    if (!Array.isArray(points) || points.length === 0) {
      throw new BusinessRuleViolationError(
        "At least one location point is required",
      );
    }

    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    for (const point of points) {
      driver.updateLocation(point.latitude, point.longitude);
    }
    await this.driverRepo.save(driver);

    const last = points[points.length - 1]!;
    const driverId = driver.id.toString();
    const orderId = driver.driverCurrentOrderId ?? null;

    try {
      await this.locationHistoryRepo.savePoints(
        points.map((point) => ({
          driverId,
          orderId,
          latitude: point.latitude,
          longitude: point.longitude,
          recordedAt: this.parseRecordedAt(point.recordedAt),
        })),
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to persist ${points.length} location point(s): ${err?.message}`,
      );
    }

    await this.publishLocation(driver, {
      latitude: last.latitude,
      longitude: last.longitude,
      recordedAt: this.parseRecordedAt(last.recordedAt),
    });

    return { driver, accepted: points.length };
  }

  /**
   * Sau khi vị trí đã lưu DB: cập nhật Redis GEO + phát sự kiện realtime.
   * Best-effort — lỗi cache/fan-out không được làm hỏng request GPS.
   */
  private async publishLocation(
    driver: Driver,
    point: { latitude: number; longitude: number; recordedAt?: Date },
    source: "HTTP" | "WS" = "HTTP",
  ): Promise<void> {
    const driverId = driver.id.toString();
    try {
      await this.geoService.upsertPosition(
        driverId,
        point.latitude,
        point.longitude,
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to update GEO cache for driver ${driverId}: ${err?.message}`,
      );
    }

    const update: LocationBroadcast = {
      driverId,
      orderId: driver.driverCurrentOrderId ?? null,
      latitude: point.latitude,
      longitude: point.longitude,
      recordedAt: point.recordedAt ?? new Date(),
      source,
    };

    for (const listener of this.locationListeners) {
      try {
        listener(update);
      } catch (err: any) {
        this.logger.warn(`Location listener failed: ${err?.message}`);
      }
    }
  }

  private parseRecordedAt(value?: string): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  /** Best-effort xoá khỏi Redis GEO — lỗi cache không chặn nghiệp vụ. */
  private async removeFromGeoCache(driverId: string): Promise<void> {
    try {
      await this.geoService.removeDriver(driverId);
    } catch (err: any) {
      this.logger.warn(
        `Failed to remove driver ${driverId} from GEO cache: ${err?.message}`,
      );
    }
  }

  /** Lấy lịch sử vị trí GPS của tài xế (mới nhất trước, giới hạn `limit`). */
  async getLocationHistory(
    id: string,
    options:
      | number
      | {
          limit?: number;
          orderId?: string;
          from?: string | Date;
          to?: string | Date;
        } = 200,
  ): Promise<DriverLocationPoint[]> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    const opts = typeof options === "number" ? { limit: options } : options;
    const from = opts.from ? new Date(opts.from) : undefined;
    const to = opts.to ? new Date(opts.to) : undefined;
    const validFrom = from && !Number.isNaN(from.getTime()) ? from : undefined;
    const validTo = to && !Number.isNaN(to.getTime()) ? to : undefined;

    // Giữ nguyên hành vi cũ khi không có bộ lọc (tương thích driver-app).
    if (!opts.orderId && !validFrom && !validTo) {
      return this.locationHistoryRepo.findByDriver(
        driver.id.toString(),
        opts.limit ?? 200,
      );
    }
    return this.locationHistoryRepo.findByDriverForOrder(driver.id.toString(), {
      orderId: opts.orderId,
      from: validFrom,
      to: validTo,
      limit: opts.limit ?? 400,
    });
  }

  // ---- Order Assignment ----

  async assignOrder(
    id: string,
    orderId: string,
    maxConcurrentOrders?: number,
  ): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.assignOrder(orderId, maxConcurrentOrders);
    await this.driverRepo.save(driver);
    return driver;
  }

  async completeOrder(id: string, orderId?: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.completeOrder(orderId);
    await this.driverRepo.save(driver);
    return driver;
  }

  // ---- Rating (called by review-service to keep driver rating in sync) ----
  async rateDriver(id: string, dto: RateDriverDto): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.addRating(dto.rating);
    await this.driverRepo.save(driver);
    return driver;
  }

  /**
   * Phạt tài xế (Case 7): giảm điểm uy tín + tạm khóa nhận đơn trong `blockMinutes`.
   */
  async penalizeCancellation(
    id: string,
    blockMinutes: number,
  ): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.penalizeCancellation(blockMinutes);
    await this.driverRepo.save(driver);
    return driver;
  }

  /**
   * Giải phóng tài xế khỏi đơn hiện tại (khi hủy/giao thất bại).
   */
  async releaseOrder(id: string, orderId?: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.releaseOrder(orderId);
    await this.driverRepo.save(driver);
    return driver;
  }

  // ---- Fatigue Management ----

  async updateFatigue(id: string, dto: UpdateFatigueDto): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.updateFatigueStatus(dto.minutesSinceLastCheck);
    await this.driverRepo.save(driver);
    return driver;
  }

  async takeBreak(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.takeBreak();
    await this.driverRepo.save(driver);
    return driver;
  }

  async forceBreak(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.forceBreak();
    await this.driverRepo.save(driver);
    return driver;
  }

  // ---- Shift Management ----

  async startShift(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.startShift();
    await this.driverRepo.save(driver);
    return driver;
  }

  async endShift(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    driver.endShift();
    await this.driverRepo.save(driver);
    return driver;
  }

  // ---- Earnings (B4): delegate to wallet-service ----
  async getEarnings(id: string, period: string): Promise<any> {
    const driver = await this.driverRepo.findByIdOrFail(DriverId.from(id));
    const walletEarnings = await this.fetchWalletEarnings(
      driver.id.toString(),
      period,
    );
    const totalOrders =
      walletEarnings?.totalOrders ?? driver.driverTotalOrders ?? 0;
    const totalEarnings = walletEarnings?.totalEarnings ?? 0;
    return {
      driverId: driver.id.toString(),
      period,
      totalEarnings,
      totalOrders,
      averagePerOrder:
        totalOrders > 0
          ? Math.round((totalEarnings / totalOrders) * 100) / 100
          : 0,
      earningsByDay: walletEarnings?.earningsByDay ?? [],
    };
  }

  private async fetchWalletEarnings(
    driverId: string,
    period: string,
  ): Promise<any | null> {
    const url = process.env.WALLET_SERVICE_URL || "http://localhost:3009";
    const serviceKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    try {
      const res = await firstValueFrom(
        this.httpService.get(`${url}/api/v1/wallets/earnings`, {
          params: { ownerId: driverId, ownerType: "DRIVER", period },
          headers: { "x-service-key": serviceKey },
        }),
      );
      return res.data;
    } catch (err: any) {
      this.logger.warn(`Failed to fetch wallet earnings: ${err?.message}`);
      return null;
    }
  }

  // ---- Stats (B4) ----
  async getDriverStats(): Promise<any> {
    const all = await this.driverRepo.findAll({});
    return {
      totalDrivers: all.length,
      activeDrivers: all.filter((d) => d.driverStatus === "ACTIVE").length,
      onlineDrivers: all.filter((d) => d.driverOnlineStatus === "ONLINE")
        .length,
    };
  }

  // ---- Auto-offline (heartbeat timeout) ----

  /**
   * Quét tài xế đang ONLINE nhưng không gửi vị trí (heartbeat) trong
   * `OFFLINE_TIMEOUT_MS` → coi như đã đóng tab/mất mạng và chuyển OFFLINE.
   * Trả về số tài xế đã được chuyển offline.
   *
   * Nhịp tim gần nhất = mốc mới nhất giữa lần gửi GPS cuối và thời điểm vừa bật
   * ONLINE (`Driver.driverLastHeartbeatAt`), nên tài xế vừa online không bị
   * chuyển OFFLINE trước khi kịp gửi vị trí đầu tiên.
   */
  async sweepStaleOnlineDrivers(): Promise<number> {
    const cutoff = new Date(Date.now() - DriverService.OFFLINE_TIMEOUT_MS);
    const staleDrivers =
      await this.driverRepo.findOnlineWithStaleLocation(cutoff);

    let count = 0;
    for (const driver of staleDrivers) {
      // Guard an toàn kép: chỉ offline tài xế thực sự đang ONLINE và đã hết
      // khoảng ân hạn kể từ nhịp tim cuối cùng.
      if (driver.driverOnlineStatus !== DriverOnlineStatus.ONLINE) {
        continue;
      }
      const lastHeartbeat = driver.driverLastHeartbeatAt;
      if (
        lastHeartbeat == null ||
        lastHeartbeat.getTime() >= cutoff.getTime()
      ) {
        continue;
      }

      try {
        driver.goOffline();
        await this.driverRepo.save(driver);
        await this.removeFromGeoCache(driver.id.toString());
        count += 1;
        this.logger.log(
          `Auto-offline driver ${driver.id.toString()} (heartbeat timeout)`,
        );
      } catch (err: any) {
        this.logger.warn(
          `Failed to auto-offline driver ${driver.id.toString()}: ${err?.message}`,
        );
      }
    }

    if (count > 0) {
      this.logger.log(`Auto-offlined ${count} disconnected driver(s)`);
    }
    return count;
  }

  /**
   * Quét tài xế đang SUSPENDED do khóa có thời hạn đã hết hạn → tự kích hoạt lại.
   */
  async sweepExpiredSuspensions(): Promise<number> {
    const drivers = await this.driverRepo.findAll({ status: "SUSPENDED" });
    let count = 0;
    for (const driver of drivers) {
      const blockedUntil = driver.driverAcceptBlockedUntil;
      if (!blockedUntil || blockedUntil.getTime() > Date.now()) {
        continue;
      }
      try {
        driver.activate();
        await this.driverRepo.save(driver);
        count += 1;
        this.logger.log(
          `Auto-unlocked driver ${driver.id.toString()} (suspension expired)`,
        );
      } catch (err: any) {
        this.logger.warn(
          `Failed to auto-unlock driver ${driver.id.toString()}: ${err?.message}`,
        );
      }
    }
    if (count > 0) {
      this.logger.log(`Auto-unlocked ${count} driver(s)`);
    }
    return count;
  }
}
