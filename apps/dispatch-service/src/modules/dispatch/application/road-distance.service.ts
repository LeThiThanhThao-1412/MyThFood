import { Injectable, Logger } from "@nestjs/common";
import {
  RouteMatrixMetric,
  RouteOptimizationMetric,
  haversineKm,
} from "../domain/route-planner";

export interface RoutePoint {
  latitude: number;
  longitude: number;
}

const AVG_SPEED_KMH = 25;
const DEFAULT_OSRM_BASE_URL = "https://router.project-osrm.org";
const GOOGLE_MATRIX_URL =
  "https://maps.googleapis.com/maps/api/distancematrix/json";
const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_CACHE_TTL_SECONDS = 30;
const MAX_CACHE_ENTRIES = 500;

/**
 * Lấy ma trận khoảng cách/thời gian **đường đi thực tế** cho tài xế + các
 * điểm lấy/giao hàng, phục vụ xếp lộ trình tối ưu.
 *
 * Thứ tự ưu tiên:
 * 1. Google Distance Matrix (`ROAD_MATRIX_PROVIDER=google` + `GOOGLE_MAPS_API_KEY`)
 *    — có `duration_in_traffic` (giao thông theo thời gian thực/best guess).
 * 2. OSRM `/table` (`OSRM_BASE_URL`, mặc định router.project-osrm.org)
 *    — khoảng cách/thời gian theo mạng đường bộ, có turn penalty.
 * 3. Trả `null` → `planRouteDetailed()` tự fallback Haversine.
 *
 * Kết quả được cache ngắn (mặc định 30s) theo toạ độ đã làm tròn ~11m để
 * tránh gọi dịch vụ bản đồ quá nhiều khi GPS nhích liên tục.
 */
@Injectable()
export class RoadDistanceService {
  private readonly logger = new Logger(RoadDistanceService.name);
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: RouteMatrixMetric }
  >();
  private lastWarningAt = 0;

  async getMatrix(points: RoutePoint[]): Promise<RouteMatrixMetric | null> {
    const validPoints = (points ?? []).filter(
      (point) =>
        Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
    );
    if (validPoints.length < 2) return null;

    const cacheKey = this.cacheKey(validPoints);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const provider = (process.env.ROAD_MATRIX_PROVIDER || "osrm")
      .trim()
      .toLowerCase();

    let matrix: RouteMatrixMetric | null = null;
    if (provider === "google") {
      matrix = await this.fetchGoogleMatrix(validPoints);
    }
    if (!matrix) {
      matrix = await this.fetchOsrmMatrix(validPoints);
    }
    if (!matrix) return null;

    matrix.metric = this.optimizationMetric();
    this.cache.set(cacheKey, {
      expiresAt: Date.now() + this.cacheTtlSeconds() * 1000,
      value: matrix,
    });
    this.evictCache();
    return matrix;
  }

  // ─── OSRM ────────────────────────────────────────────────────────────────

  private async fetchOsrmMatrix(
    points: RoutePoint[],
  ): Promise<RouteMatrixMetric | null> {
    const base = (process.env.OSRM_BASE_URL || DEFAULT_OSRM_BASE_URL).replace(
      /\/+$/,
      "",
    );
    // OSRM nhận thứ tự lon,lat.
    const coordinates = points
      .map((point) => `${point.longitude},${point.latitude}`)
      .join(";");
    const url = `${base}/table/v1/driving/${coordinates}?annotations=distance,duration`;

    try {
      const res = await this.fetchWithTimeout(url);
      if (!res.ok) {
        this.warn(`OSRM table HTTP ${res.status}`);
        return null;
      }
      const data: any = await res.json();
      if (
        data?.code !== "Ok" ||
        !Array.isArray(data.distances) ||
        !Array.isArray(data.durations)
      ) {
        this.warn(`OSRM table invalid response (code=${data?.code})`);
        return null;
      }
      return {
        distanceKm: this.toDistanceMatrix(data.distances, points),
        durationMin: this.toDurationMatrix(data.durations, points),
        source: "osrm",
      };
    } catch (err: any) {
      this.warn(`OSRM table failed: ${err?.message ?? String(err)}`);
      return null;
    }
  }

  // ─── Google Distance Matrix (tuỳ chọn, có traffic) ───────────────────────

  private async fetchGoogleMatrix(
    points: RoutePoint[],
  ): Promise<RouteMatrixMetric | null> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
    if (!apiKey) {
      this.warn(
        "ROAD_MATRIX_PROVIDER=google nhưng thiếu GOOGLE_MAPS_API_KEY — fallback OSRM",
      );
      return null;
    }

    const coordinateList = points
      .map((point) => `${point.latitude},${point.longitude}`)
      .join("|");
    const params = new URLSearchParams({
      origins: coordinateList,
      destinations: coordinateList,
      mode: "driving",
      // Có departure_time thì Google trả duration_in_traffic.
      departure_time: "now",
      traffic_model: "best_guess",
      language: "vi",
      key: apiKey,
    });
    const url = `${GOOGLE_MATRIX_URL}?${params.toString()}`;

    try {
      const res = await this.fetchWithTimeout(url);
      if (!res.ok) {
        this.warn(`Google Distance Matrix HTTP ${res.status}`);
        return null;
      }
      const data: any = await res.json();
      if (
        data?.status !== "OK" ||
        !Array.isArray(data.rows) ||
        data.rows.length !== points.length
      ) {
        this.warn(
          `Google Distance Matrix invalid response (status=${data?.status})`,
        );
        return null;
      }

      const distanceKm: number[][] = [];
      const durationMin: number[][] = [];
      for (let i = 0; i < points.length; i += 1) {
        const distanceRow: number[] = [];
        const durationRow: number[] = [];
        for (let j = 0; j < points.length; j += 1) {
          if (i === j) {
            distanceRow.push(0);
            durationRow.push(0);
            continue;
          }
          const element = data.rows[i]?.elements?.[j];
          const fallbackDistanceKm = haversineKm(
            points[i]!.latitude,
            points[i]!.longitude,
            points[j]!.latitude,
            points[j]!.longitude,
          );
          if (element?.status !== "OK") {
            distanceRow.push(fallbackDistanceKm);
            durationRow.push((fallbackDistanceKm / AVG_SPEED_KMH) * 60);
            continue;
          }
          const distance = Number(element.distance?.value);
          const durationSeconds = Number(
            element.duration_in_traffic?.value ?? element.duration?.value,
          );
          distanceRow.push(
            Number.isFinite(distance) && distance >= 0
              ? distance / 1000
              : fallbackDistanceKm,
          );
          durationRow.push(
            Number.isFinite(durationSeconds) && durationSeconds >= 0
              ? durationSeconds / 60
              : (fallbackDistanceKm / AVG_SPEED_KMH) * 60,
          );
        }
        distanceKm.push(distanceRow);
        durationMin.push(durationRow);
      }

      return { distanceKm, durationMin, source: "google" };
    } catch (err: any) {
      this.warn(
        `Google Distance Matrix failed: ${err?.message ?? String(err)}`,
      );
      return null;
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private toDistanceMatrix(raw: any, points: RoutePoint[]): number[][] {
    return points.map((from, i) =>
      points.map((to, j) => {
        if (i === j) return 0;
        const meters = Number(raw?.[i]?.[j]);
        if (Number.isFinite(meters) && meters >= 0) return meters / 1000;
        return haversineKm(
          from.latitude,
          from.longitude,
          to.latitude,
          to.longitude,
        );
      }),
    );
  }

  private toDurationMatrix(raw: any, points: RoutePoint[]): number[][] {
    return points.map((from, i) =>
      points.map((to, j) => {
        if (i === j) return 0;
        const seconds = Number(raw?.[i]?.[j]);
        if (Number.isFinite(seconds) && seconds >= 0) return seconds / 60;
        const distance = haversineKm(
          from.latitude,
          from.longitude,
          to.latitude,
          to.longitude,
        );
        return (distance / AVG_SPEED_KMH) * 60;
      }),
    );
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private cacheKey(points: RoutePoint[]): string {
    // Làm tròn 4 chữ số thập phân (~11m) để GPS nhích nhẹ vẫn dùng lại cache.
    return points
      .map(
        (point) => `${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}`,
      )
      .join(";");
  }

  private evictCache(): void {
    if (this.cache.size <= MAX_CACHE_ENTRIES) return;
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(key);
    }
    while (this.cache.size > MAX_CACHE_ENTRIES - 100) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.cache.delete(oldestKey);
    }
  }

  private optimizationMetric(): RouteOptimizationMetric {
    const value = (process.env.ROUTE_OPTIMIZE_METRIC || "duration")
      .trim()
      .toLowerCase();
    return value === "distance" ? "distance" : "duration";
  }

  private timeoutMs(): number {
    const value = Number(process.env.ROAD_MATRIX_TIMEOUT_MS);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
  }

  private cacheTtlSeconds(): number {
    const value = Number(process.env.ROAD_MATRIX_CACHE_SECONDS);
    return Number.isFinite(value) && value >= 0
      ? value
      : DEFAULT_CACHE_TTL_SECONDS;
  }

  /** Log cảnh báo có throttle để không spam khi mất mạng. */
  private warn(message: string): void {
    const now = Date.now();
    if (now - this.lastWarningAt < 60_000) return;
    this.lastWarningAt = now;
    this.logger.warn(message);
  }
}
