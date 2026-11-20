import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import Redis from "ioredis";

// ============================================================================
// DriverGeoService — hot cache vị trí tài xế trên Redis (Phase 1).
//
// - `GEOADD` vào 1 sorted-set địa lý duy nhất → matching bằng `GEOSEARCH`
//   O(log N + M) thay vì tải toàn bộ tài xế qua HTTP rồi Haversine O(N).
// - Mỗi tài xế có key TTL (`DRIVER_GEO_TTL_SECONDS`, mặc định 90s) → tài xế
//   đóng app tự biến mất khỏi tập "nóng" dù sweep chưa chạy.
// - Redis KHÔNG bắt buộc: thiếu `REDIS_URL` hoặc Redis chết → mọi hàm trả rỗng
//   và caller fallback sang DB. Không được phép làm sập luồng GPS.
// ============================================================================

const GEO_KEY = "mythfood:drivers:geo";
const SEEN_KEY = "mythfood:drivers:geo:seen";
const POSITION_KEY_PREFIX = "mythfood:drivers:geo:pos:";
const DEFAULT_TTL_SECONDS = 90;
const SWEEP_INTERVAL_MS = 60_000;

export interface NearbyDriverGeo {
  driverId: string;
  distanceKm: number;
}

@Injectable()
export class DriverGeoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DriverGeoService.name);
  private client: Redis | null = null;
  private warned = false;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  private get ttlSeconds(): number {
    const raw = Number(
      process.env.DRIVER_GEO_TTL_SECONDS || DEFAULT_TTL_SECONDS,
    );
    return Number.isFinite(raw) && raw >= 10 ? raw : DEFAULT_TTL_SECONDS;
  }

  onModuleInit(): void {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.log(
        "REDIS_URL not set — GPS hot cache disabled (fallback: DB + Haversine)",
      );
      return;
    }

    try {
      const client = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: (times) => Math.min(times * 1000, 10_000),
      });
      client.on("ready", () => {
        this.warned = false;
        this.logger.log("GPS hot cache ready (Redis GEO)");
      });
      client.on("error", (err) => this.warnOnce(err));
      client.connect().catch(() => undefined);
      this.client = client;

      this.sweepTimer = setInterval(() => {
        void this.sweepStale();
      }, SWEEP_INTERVAL_MS);
    } catch (err) {
      this.warnOnce(err);
    }
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    this.client?.disconnect();
    this.client = null;
  }

  isEnabled(): boolean {
    return this.client != null;
  }

  /** Cập nhật vị trí hiện tại của tài xế vào GEO set + TTL key. */
  async upsertPosition(
    driverId: string,
    latitude: number,
    longitude: number,
  ): Promise<void> {
    const client = this.client;
    if (!client) return;
    try {
      await client
        .multi()
        .geoadd(GEO_KEY, longitude, latitude, driverId)
        .zadd(SEEN_KEY, Date.now(), driverId)
        .set(
          POSITION_KEY_PREFIX + driverId,
          `${latitude},${longitude}`,
          "EX",
          this.ttlSeconds,
        )
        .exec();
    } catch (err) {
      this.warnOnce(err);
    }
  }

  /** Xoá tài xế khỏi cache khi OFFLINE / bị auto-offline. */
  async removeDriver(driverId: string): Promise<void> {
    const client = this.client;
    if (!client) return;
    try {
      await client
        .multi()
        .zrem(GEO_KEY, driverId)
        .zrem(SEEN_KEY, driverId)
        .del(POSITION_KEY_PREFIX + driverId)
        .exec();
    } catch (err) {
      this.warnOnce(err);
    }
  }

  /**
   * Tài xế trong bán kính `radiusKm`, sắp xếp gần → xa.
   * Chỉ trả những tài xế còn key TTL (vị trí còn "nóng").
   */
  async nearby(
    latitude: number,
    longitude: number,
    radiusKm: number,
    limit = 20,
  ): Promise<NearbyDriverGeo[]> {
    const client = this.client;
    if (!client) return [];
    try {
      const raw = (await client.call(
        "GEOSEARCH",
        GEO_KEY,
        "FROMLONLAT",
        String(longitude),
        String(latitude),
        "BYRADIUS",
        String(radiusKm),
        "km",
        "ASC",
        "COUNT",
        String(limit),
        "WITHDIST",
      )) as unknown;

      if (!Array.isArray(raw)) return [];
      const entries: NearbyDriverGeo[] = [];
      for (const row of raw) {
        if (!Array.isArray(row) || row.length < 2) continue;
        const driverId = String(row[0]);
        const distanceKm = Number(row[1]);
        if (!driverId || !Number.isFinite(distanceKm)) continue;
        entries.push({ driverId, distanceKm });
      }
      if (entries.length === 0) return [];

      const pipeline = client.pipeline();
      for (const entry of entries) {
        pipeline.exists(POSITION_KEY_PREFIX + entry.driverId);
      }
      const results = await pipeline.exec();
      return entries.filter((_, index) => {
        const row = results?.[index];
        return Number(row?.[1] ?? 0) === 1;
      });
    } catch (err) {
      this.warnOnce(err);
      return [];
    }
  }

  /** Dọn member đã hết TTL khỏi GEO set (tránh phình bộ nhớ). */
  async sweepStale(): Promise<number> {
    const client = this.client;
    if (!client) return 0;
    try {
      const cutoff = Date.now() - this.ttlSeconds * 1000;
      const stale = await client.zrangebyscore(
        SEEN_KEY,
        "-inf",
        cutoff,
        "LIMIT",
        0,
        500,
      );
      if (stale.length === 0) return 0;

      const pipeline = client.pipeline();
      for (const driverId of stale) {
        pipeline.zrem(GEO_KEY, driverId);
        pipeline.zrem(SEEN_KEY, driverId);
        pipeline.del(POSITION_KEY_PREFIX + driverId);
      }
      await pipeline.exec();
      return stale.length;
    } catch (err) {
      this.warnOnce(err);
      return 0;
    }
  }

  /** Chỉ log cảnh báo Redis 1 lần cho mỗi đợt mất kết nối (tránh spam log). */
  private warnOnce(err: unknown): void {
    if (this.warned) return;
    this.warned = true;
    this.logger.warn(
      `Redis GEO unavailable — fallback to DB: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
