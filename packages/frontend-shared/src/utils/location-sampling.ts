import { haversineKm } from "./distance";

/**
 * Một điểm GPS thô từ `navigator.geolocation.watchPosition`.
 * `accuracy` là bán kính sai số (mét) do thiết bị báo về.
 */
export interface GeoFix {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  /** Thời điểm thiết bị ghi nhận (epoch ms). */
  timestamp?: number;
}

/** Trạng thái lần gửi gần nhất — dùng để quyết định có gửi điểm mới hay không. */
export interface GeoFixState {
  lastSentAt: number | null;
  lastSentFix: Pick<GeoFix, "latitude" | "longitude"> | null;
}

/**
 * Cấu hình lấy mẫu cho từng chế độ của tài xế.
 *
 * - `minIntervalMs`: khoảng cách tối thiểu giữa 2 lần gửi khi **có di chuyển**.
 * - `minDistanceM`: phải di chuyển ít nhất bao nhiêu mét thì mới gửi.
 * - `maxAccuracyM`: bỏ qua điểm có sai số lớn hơn (GPS nhảy trong nhà, toà nhà).
 * - `maxSilenceMs`: dù không di chuyển vẫn phải gửi "nhịp tim" sau khoảng này,
 *   để backend không tự chuyển tài xế sang OFFLINE.
 */
export interface SamplingProfile {
  minIntervalMs: number;
  minDistanceM: number;
  maxSilenceMs: number;
  maxAccuracyM?: number;
}

/**
 * Hồ sơ lấy mẫu mặc định (giây/mét).
 *
 * `delivering` dày hơn để khách thấy xe chạy mượt; `idle` thưa hơn để tiết kiệm
 * pin. Cả hai đều có `maxSilenceMs` < `DRIVER_OFFLINE_TIMEOUT_SECONDS` (20s) —
 * kể cả khi trình duyệt throttle tab nền, nhịp tim vẫn còn dư địa.
 */
export const DRIVER_SAMPLING_PROFILES: {
  idle: SamplingProfile;
  delivering: SamplingProfile;
} = {
  idle: {
    minIntervalMs: 10_000,
    minDistanceM: 50,
    maxSilenceMs: 15_000,
    maxAccuracyM: 100,
  },
  delivering: {
    minIntervalMs: 4_000,
    minDistanceM: 15,
    maxSilenceMs: 8_000,
    maxAccuracyM: 75,
  },
};

/** Khoảng cách (mét) giữa 2 toạ độ — dùng Haversine, đủ chính xác ở quy mô đô thị. */
export function distanceMeters(
  a: Pick<GeoFix, "latitude" | "longitude">,
  b: Pick<GeoFix, "latitude" | "longitude">,
): number {
  return haversineKm(a.latitude, a.longitude, b.latitude, b.longitude) * 1000;
}

/** Toạ độ hợp lệ (hữu hạn, đúng miền giá trị, không phải điểm rác 0,0). */
export function isValidFix(fix: GeoFix | null | undefined): fix is GeoFix {
  if (!fix) return false;
  const { latitude, longitude } = fix;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  // (0, 0) là toạ độ mặc định khi GPS chưa có tín hiệu (và nằm giữa biển).
  if (latitude === 0 && longitude === 0) return false;
  return true;
}

/**
 * Quyết định có gửi điểm GPS mới lên backend hay không.
 *
 * Thứ tự kiểm tra:
 *  1. Toạ độ không hợp lệ → bỏ.
 *  2. Sai số > `maxAccuracyM` → bỏ (tránh "nhảy" vị trí).
 *  3. Chưa từng gửi → gửi ngay (nhịp tim đầu tiên khi vừa ONLINE).
 *  4. Đã đủ `maxSilenceMs` → gửi dù không di chuyển (heartbeat).
 *  5. Đã đủ `minIntervalMs` **và** đi được `minDistanceM` → gửi.
 */
export function shouldSendFix(
  state: GeoFixState,
  fix: GeoFix,
  profile: SamplingProfile,
  now: number = Date.now(),
): boolean {
  if (!isValidFix(fix)) return false;

  const accuracy = fix.accuracy;
  if (
    profile.maxAccuracyM != null &&
    accuracy != null &&
    Number.isFinite(accuracy) &&
    accuracy > profile.maxAccuracyM
  ) {
    return false;
  }

  if (state.lastSentAt == null || state.lastSentFix == null) return true;

  const elapsedMs = Math.max(0, now - state.lastSentAt);
  if (elapsedMs >= profile.maxSilenceMs) return true;

  if (elapsedMs < profile.minIntervalMs) return false;

  const movedM = distanceMeters(state.lastSentFix, fix);
  return movedM >= profile.minDistanceM;
}
