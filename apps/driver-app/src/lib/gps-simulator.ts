// ============================================================================
// gps-simulator — "công tắc GPS" phục vụ demo (dev tool).
//
// Vì sao cần: pipeline realtime của app tài xế lấy vị trí bằng
// `navigator.geolocation.watchPosition` (xem use-driver-location-stream.ts).
// DevTools của Chrome chỉ cho *đặt* một toạ độ cố định, không cho tài xế "chạy"
// nên không demo được cảnh tượng thay đổi vị trí liên tục như Grab — và cũng
// không sinh ra vết GPS thật trong `driver_location_history`, thứ mà
// resolution-service dùng để tính tín hiệu GPS khi giải quyết sự cố.
//
// Cách tiếp cận: KHÔNG sửa pipeline. Ta ghi đè `navigator.geolocation` bằng một
// lớp mỏng:
//   • Khi giả lập TẮT → chuyển tiếp nguyên vẹn xuống GPS thật của thiết bị.
//   • Khi giả lập BẬT  → tự phát `GeolocationPosition` theo lộ trình, đúng nhịp
//     1 điểm/giây, kèm `accuracy`/`speed`/`heading` như thiết bị thật.
// Nhờ vậy mọi chỗ dùng GPS (DriverLocationTracker, nút "Lấy GPS", catchUp khi
// quay lại tab…) đều thấy vị trí mô phỏng, và dữ liệu vẫn đi đúng đường:
//   watchPosition → lấy mẫu thích ứng → WS tracking:push / HTTP batch
//   → driver_location_history → deriveGpsSignals của resolution-service.
//
// Lưu ý nghiệp vụ: muốn backend nhận điểm thì tài xế phải ONLINE (domain
// `Driver.updateLocation` ném lỗi khi offline) — panel demo sẽ cảnh báo.
// ============================================================================

import { haversineKm } from "@mythfood/frontend-shared";

export interface LatLngPoint {
  latitude: number;
  longitude: number;
}

/** Trạng thái phát lộ trình. `idle` = đang trả lại GPS thật. */
export type GpsSimStatus = "idle" | "running" | "paused" | "arrived";

export interface GpsSimFix {
  latitude: number;
  longitude: number;
  /** Bán kính sai số (m) — giả lập 8–14 m như GPS điện thoại. */
  accuracy: number;
  /** Tốc độ tức thời (m/s) theo chuẩn `GeolocationCoordinates.speed`. */
  speed: number;
  /** Hướng di chuyển (độ, 0–360). */
  heading: number;
  timestamp: number;
}

export interface GpsSimSnapshot {
  status: GpsSimStatus;
  /** Nhãn tuyến đang nạp (hiển thị trên panel). */
  label: string;
  routePointCount: number;
  totalMeters: number;
  progressMeters: number;
  speedKmh: number;
  loop: boolean;
  fix: GpsSimFix | null;
  /** Số watcher GPS đang được phục vụ (1 = app đang theo dõi vị trí). */
  watcherCount: number;
}

export interface GpsSimRouteOptions {
  speedKmh?: number;
  loop?: boolean;
  label?: string;
}

/** Tốc độ mặc định (km/h) — ngang tốc độ xe máy trong đô thị. */
export const DEFAULT_SIM_SPEED_KMH = 28;
const MIN_SPEED_KMH = 3;
const MAX_SPEED_KMH = 80;
/** Nhịp phát điểm GPS (ms). 1s giống thiết bị thật, đủ mượt để thấy xe chạy. */
const TICK_MS = 1_000;
/** Nhiễu vị trí nhỏ (m) khi đang chạy — marker "sống", không ảnh hưởng tín hiệu AI. */
const JITTER_M = 1.2;
/** Nhiễu cộng thêm khi tạo điểm GPS nhảy (m). */
const JUMP_NOISE_M = 25;
/**
 * Id watcher do lớp shim cấp. Đặt cao để không đụng id mà browser đã cấp cho
 * watcher GPS thật trước khi shim được cài.
 */
const FIRST_WATCH_ID = 900_000;

/**
 * Công tắc tổng của công cụ demo: bật ở môi trường dev, hoặc bật tường minh
 * trên bản build bằng `NEXT_PUBLIC_GPS_SIMULATOR=1`.
 *
 * Tắt → lớp shim không được cài, `navigator.geolocation` giữ nguyên gốc.
 */
export const GPS_SIMULATOR_ENABLED =
  process.env.NEXT_PUBLIC_GPS_SIMULATOR === "1" ||
  process.env.NODE_ENV !== "production";

const EMPTY_SNAPSHOT: GpsSimSnapshot = {
  status: "idle",
  label: "",
  routePointCount: 0,
  totalMeters: 0,
  progressMeters: 0,
  speedKmh: DEFAULT_SIM_SPEED_KMH,
  loop: false,
  fix: null,
  watcherCount: 0,
};

// ---------------------------------------------------------------------------
// Hình học
// ---------------------------------------------------------------------------

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function isValidPoint(point: LatLngPoint | null | undefined): boolean {
  if (!point) return false;
  const { latitude, longitude } = point;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  return !(latitude === 0 && longitude === 0);
}

/** Di chuyển 1 điểm theo hướng `headingDeg` một quãng `meters`. */
function moveBy(
  point: LatLngPoint,
  meters: number,
  headingDeg: number,
): LatLngPoint {
  const dLat = (meters * Math.cos(toRad(headingDeg))) / 111_320;
  const cosLat = Math.max(0.000001, Math.cos(toRad(point.latitude)));
  const dLng = (meters * Math.sin(toRad(headingDeg))) / (111_320 * cosLat);
  return {
    latitude: point.latitude + dLat,
    longitude: point.longitude + dLng,
  };
}

/** Hướng từ A → B (độ, 0–360). */
function bearingDeg(a: LatLngPoint, b: LatLngPoint): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function distanceMeters(a: LatLngPoint, b: LatLngPoint): number {
  return haversineKm(a.latitude, a.longitude, b.latitude, b.longitude) * 1000;
}

/** Chuẩn hoá đầu vào `[lat, lng]` hoặc `{latitude, longitude}` → mảng điểm. */
function normalizeRoute(
  input: ReadonlyArray<LatLngPoint | [number, number]>,
): LatLngPoint[] {
  const points: LatLngPoint[] = [];
  for (const item of input) {
    const point: LatLngPoint = Array.isArray(item)
      ? { latitude: item[0], longitude: item[1] }
      : { latitude: item.latitude, longitude: item.longitude };
    if (!isValidPoint(point)) continue;
    const previous = points[points.length - 1];
    // Bỏ điểm trùng lặp sát nhau (< 0.5 m) để tránh chia cho 0 khi nội suy.
    if (previous && distanceMeters(previous, point) < 0.5) continue;
    points.push(point);
  }
  return points;
}

/** Vòng tròn quanh 1 tâm — dùng cho kiểu "chạy lòng vòng quanh vị trí hiện tại". */
export function buildLoopRoute(
  center: LatLngPoint,
  radiusM = 350,
  segments = 24,
): LatLngPoint[] {
  if (!isValidPoint(center) || segments < 3) return [];
  const step = 360 / segments;
  const points: LatLngPoint[] = [];
  for (let index = 0; index < segments; index += 1) {
    points.push(moveBy(center, radiusM, index * step));
  }
  // Khép kín vòng (điểm cuối trùng điểm đầu) để phát lại không bị nhảy.
  points.push(points[0]!);
  return points;
}

/** Tuyến demo quanh trung tâm Quận 1 (Chợ Bến Thành → Nguyễn Huệ → Bạch Đằng). */
export const DEMO_ROUTE_Q1: LatLngPoint[] = [
  { latitude: 10.77248, longitude: 106.69803 }, // Chợ Bến Thành
  { latitude: 10.7739, longitude: 106.70086 }, // Lê Lợi → Nguyễn Huệ
  { latitude: 10.77452, longitude: 106.70298 }, // Nguyễn Huệ / Mê Linh
  { latitude: 10.77667, longitude: 106.70487 }, // Tôn Đức Thắng
  { latitude: 10.7739, longitude: 106.70689 }, // Bạch Đằng
  { latitude: 10.77051, longitude: 106.70454 }, // Bitexco
  { latitude: 10.768, longitude: 106.70005 }, // Bùi Viện
  { latitude: 10.7698, longitude: 106.696 }, // Trần Hưng Đạo
  { latitude: 10.77248, longitude: 106.69803 }, // về lại Chợ Bến Thành
];

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface SimWatcher {
  callback: PositionCallback;
  errorCallback: PositionErrorCallback | null;
  options?: PositionOptions;
  /** Id của watcher GPS thật khi đang chuyển tiếp; `null` khi đang mô phỏng. */
  nativeId: number | null;
}

interface NativeGeolocation {
  geo: Geolocation;
  getCurrentPosition: Geolocation["getCurrentPosition"];
  watchPosition: Geolocation["watchPosition"];
  clearWatch: Geolocation["clearWatch"];
}

/**
 * Engine mô phỏng GPS + shim `navigator.geolocation`.
 *
 * Một instance dùng chung cho cả app (`gpsSimulator`) để panel demo và nút
 * "Mô phỏng GPS" ở trang giao hàng điều khiển cùng một lộ trình, không sinh ra
 * hai vòng lặp GPS chạy song song.
 */
export class GpsSimulator {
  private statusValue: GpsSimStatus = "idle";
  private label = "";
  private points: LatLngPoint[] = [];
  /** Khoảng cách tích luỹ (m) từ điểm đầu tới từng đỉnh polyline. */
  private cumulative: number[] = [];
  private totalMeters = 0;
  private progressMeters = 0;
  private speedKmh = DEFAULT_SIM_SPEED_KMH;
  private loop = false;
  private readonly tickMs = TICK_MS;
  private fix: GpsSimFix | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private snapshot: GpsSimSnapshot = EMPTY_SNAPSHOT;
  private readonly listeners = new Set<(snapshot: GpsSimSnapshot) => void>();

  private installed = false;
  private native: NativeGeolocation | null = null;
  private readonly watchers = new Map<number, SimWatcher>();
  private nextWatchId = FIRST_WATCH_ID;

  // ---- Đăng ký / đọc trạng thái (dùng với useSyncExternalStore) -----------

  subscribe = (listener: (snapshot: GpsSimSnapshot) => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): GpsSimSnapshot => this.snapshot;

  /** Snapshot cố định cho SSR — engine chỉ tồn tại ở client. */
  getServerSnapshot = (): GpsSimSnapshot => EMPTY_SNAPSHOT;

  // ---- Cấu hình lộ trình ---------------------------------------------------

  /**
   * Nạp lộ trình mới. Giữ nguyên trạng thái chạy/dừng hiện tại nhưng đưa tiến
   * độ về đầu tuyến (đổi tuyến giữa chừng → chạy lại từ điểm xuất phát).
   *
   * @returns `false` khi tuyến không hợp lệ (< 2 điểm phân biệt).
   */
  setRoute(
    input: ReadonlyArray<LatLngPoint | [number, number]>,
    options: GpsSimRouteOptions = {},
  ): boolean {
    const points = normalizeRoute(input);
    this.points = points;
    this.cumulative = [];
    this.totalMeters = 0;

    for (let index = 0; index < points.length; index += 1) {
      const previous = points[index - 1];
      this.cumulative.push(
        previous
          ? this.cumulative[index - 1]! +
              distanceMeters(previous, points[index]!)
          : 0,
      );
    }
    this.totalMeters = this.cumulative[this.cumulative.length - 1] ?? 0;
    this.progressMeters = 0;

    if (options.speedKmh != null) {
      this.speedKmh = clamp(options.speedKmh, MIN_SPEED_KMH, MAX_SPEED_KMH);
    }
    if (options.loop != null) this.loop = options.loop;
    if (options.label != null) this.label = options.label;

    this.fix = points[0] ? this.makeFix(points[0], 0, 0, 0) : null;
    this.publish();
    return points.length >= 2;
  }

  /** Đổi tốc độ phát (km/h) giữa chừng. */
  setSpeed(kmh: number): void {
    this.speedKmh = clamp(kmh, MIN_SPEED_KMH, MAX_SPEED_KMH);
    this.publish();
  }

  /** Bật chế độ phát lộ trình (nếu đang tạm dừng thì tiếp tục). */
  start(): boolean {
    if (this.points.length < 2) return false;
    this.ensureShim();
    this.statusValue = "running";
    this.startTimer();
    // Phát ngay điểm hiện tại để luồng GPS có dữ liệu tức thì (không chờ 1s).
    this.emitNow();
    this.syncWatchers();
    this.publish();
    return true;
  }

  /** Tạm dừng di chuyển nhưng vẫn "đứng yên tại chỗ" (heartbeat vẫn phát). */
  pause(): void {
    if (this.statusValue !== "running") return;
    this.statusValue = "paused";
    this.emitNow();
  }

  /** Dừng hẳn và trả GPS lại cho thiết bị thật. */
  stop(): void {
    this.stopTimer();
    const wasActive = this.statusValue !== "idle";
    this.statusValue = "idle";
    // Bỏ toạ độ mô phỏng: sau khi dừng, vị trí hiển thị phải do GPS thật cấp.
    this.fix = null;
    this.publish();
    if (wasActive) this.syncWatchers();
  }

  /** Đưa tiến độ về đầu tuyến (không đổi trạng thái chạy/dừng). */
  reset(): void {
    this.progressMeters = 0;
    const first = this.points[0];
    this.fix = first ? this.makeFix(first, 0, 0, 0) : null;
    this.publish();
    if (this.isSimulating() && this.fix) this.broadcast(this.fix);
  }

  /** Nhảy ngay tới điểm cuối tuyến (demo "đã tới nơi"). */
  skipToEnd(): void {
    if (!this.isSimulating() || this.totalMeters <= 0) return;
    this.progressMeters = this.totalMeters;
    this.statusValue = "arrived";
    this.emitNow();
  }

  /**
   * Bắn **một điểm GPS sai lệch** khỏi lộ trình (mặc định 1 km) rồi tiếp tục
   * lộ trình bình thường. Mục đích: demo tín hiệu `jumpCount` của
   * resolution-service (nghi vấn GPS_SPOOFING) — hệ thống sẽ thấy vận tốc bất
   * khả thi giữa 2 điểm liên tiếp.
   *
   * @returns điểm vừa bắn, hoặc `null` khi chưa bật giả lập.
   */
  teleportJump(meters = 1_000): GpsSimFix | null {
    if (!this.isSimulating() || !this.fix) return null;
    const heading = Math.random() * 360;
    const target = moveBy(this.fix, Math.abs(meters), heading);
    const jumpFix = this.makeFix(
      target,
      heading,
      this.fix.speed * 3.6,
      JUMP_NOISE_M,
    );
    // Cố ý KHÔNG đổi `this.fix` / tiến độ: điểm kế tiếp quay lại lộ trình →
    // tạo đúng 2 mốc nhảy (đi và về), giống một lần GPS bị can thiệp.
    this.broadcast(jumpFix);
    return jumpFix;
  }

  // ---- Shim navigator.geolocation -----------------------------------------

  /**
   * Cài lớp chuyển tiếp GPS. Idempotent — gọi nhiều lần cũng chỉ cài 1 lần.
   * Khi chưa bật giả lập, mọi lời gọi được chuyển nguyên vẹn xuống GPS thật.
   */
  ensureShim(): void {
    if (this.installed) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const geo = navigator.geolocation;
    this.native = {
      geo,
      getCurrentPosition: geo.getCurrentPosition.bind(geo),
      watchPosition: geo.watchPosition.bind(geo),
      clearWatch: geo.clearWatch.bind(geo),
    };

    geo.getCurrentPosition = (
      success: PositionCallback,
      error?: PositionErrorCallback | null,
      options?: PositionOptions,
    ) => {
      if (this.isSimulating() && this.fix) {
        this.deliver(success, this.toPosition(this.fix));
        return;
      }
      this.native?.getCurrentPosition(success, error ?? undefined, options);
    };

    geo.watchPosition = (
      callback: PositionCallback,
      errorCallback?: PositionErrorCallback | null,
      options?: PositionOptions,
    ): number => {
      const id = this.nextWatchId;
      this.nextWatchId += 1;
      const watcher: SimWatcher = {
        callback,
        errorCallback: errorCallback ?? null,
        options,
        nativeId: null,
      };
      this.watchers.set(id, watcher);
      this.attach(watcher);
      this.publish();
      return id;
    };

    geo.clearWatch = (id: number) => {
      const watcher = this.watchers.get(id);
      if (!watcher) return;
      if (watcher.nativeId !== null) {
        this.native?.clearWatch(watcher.nativeId);
      }
      this.watchers.delete(id);
      this.publish();
    };

    this.installed = true;
    this.publish();
  }

  /** Shim đã cài chưa (dùng để hiển thị trạng thái trên panel). */
  isShimInstalled(): boolean {
    return this.installed;
  }

  // ---- Nội bộ --------------------------------------------------------------

  private isSimulating(): boolean {
    return this.statusValue !== "idle";
  }

  private startTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  private stopTimer(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    if (!this.isSimulating()) return;

    if (this.statusValue === "running") {
      const metersPerTick =
        ((this.speedKmh * 1000) / 3600) * (this.tickMs / 1000);
      this.progressMeters += metersPerTick;
      if (this.progressMeters >= this.totalMeters) {
        if (this.loop && this.totalMeters > 0) {
          this.progressMeters %= this.totalMeters;
        } else {
          this.progressMeters = this.totalMeters;
          this.statusValue = "arrived";
        }
      }
    }

    this.emitNow();
  }

  /** Tính vị trí hiện tại trên lộ trình theo tiến độ (nội suy tuyến tính). */
  private positionAt(distance: number): {
    point: LatLngPoint;
    heading: number;
  } {
    const first = this.points[0]!;
    if (this.points.length < 2) return { point: first, heading: 0 };

    let index = 1;
    while (
      index < this.cumulative.length - 1 &&
      this.cumulative[index]! < distance
    ) {
      index += 1;
    }
    const start = this.points[index - 1]!;
    const end = this.points[index]!;
    const segStart = this.cumulative[index - 1]!;
    const segEnd = this.cumulative[index]!;
    const ratio =
      segEnd > segStart
        ? clamp((distance - segStart) / (segEnd - segStart), 0, 1)
        : 0;
    return {
      point: {
        latitude: start.latitude + (end.latitude - start.latitude) * ratio,
        longitude: start.longitude + (end.longitude - start.longitude) * ratio,
      },
      heading: bearingDeg(start, end),
    };
  }

  /** Cập nhật `fix` hiện tại rồi phát cho các watcher. */
  private emitNow(): void {
    if (!this.isSimulating() || this.points.length === 0) return;

    const { point, heading } = this.positionAt(this.progressMeters);
    const moving = this.statusValue === "running";
    const jittered = moving
      ? moveBy(point, Math.random() * JITTER_M, Math.random() * 360)
      : point;
    const fix = this.makeFix(
      jittered,
      heading,
      moving ? this.speedKmh : 0,
      moving ? JITTER_M : 0,
    );

    this.fix = fix;
    this.broadcast(fix);
    this.publish();
  }

  private makeFix(
    point: LatLngPoint,
    heading: number,
    speedKmh: number,
    noiseMeters: number,
  ): GpsSimFix {
    return {
      latitude: point.latitude,
      longitude: point.longitude,
      accuracy: 8 + Math.random() * 6 + noiseMeters,
      speed: Math.round(((speedKmh * 1000) / 3600) * 100) / 100,
      heading: Math.round(heading * 10) / 10,
      timestamp: Date.now(),
    };
  }

  /** Đẩy vị trí tới mọi watcher đang ở chế độ mô phỏng. */
  private broadcast(fix: GpsSimFix): void {
    if (this.watchers.size === 0) return;
    const position = this.toPosition(fix);
    for (const watcher of this.watchers.values()) {
      if (watcher.nativeId !== null) continue;
      this.deliver(watcher.callback, position);
    }
  }

  private deliver(
    callback: PositionCallback,
    position: GeolocationPosition,
  ): void {
    try {
      callback(position);
    } catch {
      // Lỗi trong callback của người dùng không được làm sập vòng phát GPS.
    }
  }

  /** Chuyển `fix` nội bộ thành object đúng chuẩn `GeolocationPosition`. */
  private toPosition(fix: GpsSimFix): GeolocationPosition {
    return {
      coords: {
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy: fix.accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: fix.heading,
        speed: fix.speed,
      },
      timestamp: fix.timestamp,
    } as unknown as GeolocationPosition;
  }

  /** Gắn 1 watcher vào nguồn vị trí phù hợp (GPS thật hoặc mô phỏng). */
  private attach(watcher: SimWatcher): void {
    if (this.isSimulating() && this.fix) {
      this.deliver(watcher.callback, this.toPosition(this.fix));
      return;
    }
    if (!this.native) return;
    watcher.nativeId = this.native.watchPosition(
      watcher.callback,
      watcher.errorCallback ?? undefined,
      watcher.options,
    );
  }

  /**
   * Đồng bộ toàn bộ watcher khi bật/tắt giả lập:
   *  - Bật → huỷ watcher GPS thật (tránh 2 nguồn vị trí chồng nhau) + phát fix.
   *  - Tắt → đăng ký lại watcher GPS thật để app tiếp tục chạy bình thường.
   */
  private syncWatchers(): void {
    const simulate = this.isSimulating() && !!this.fix;
    for (const watcher of this.watchers.values()) {
      if (simulate) {
        if (watcher.nativeId !== null) {
          this.native?.clearWatch(watcher.nativeId);
          watcher.nativeId = null;
        }
      } else if (watcher.nativeId === null && this.native) {
        watcher.nativeId = this.native.watchPosition(
          watcher.callback,
          watcher.errorCallback ?? undefined,
          watcher.options,
        );
      }
    }
    if (simulate && this.fix) this.broadcast(this.fix);
  }

  private publish(): void {
    this.snapshot = {
      status: this.statusValue,
      label: this.label,
      routePointCount: this.points.length,
      totalMeters: this.totalMeters,
      progressMeters: this.progressMeters,
      speedKmh: this.speedKmh,
      loop: this.loop,
      fix: this.fix,
      watcherCount: this.watchers.size,
    };
    for (const listener of this.listeners) {
      try {
        listener(this.snapshot);
      } catch {
        // Listener lỗi không được chặn vòng phát.
      }
    }
  }
}

/** Instance dùng chung cho toàn app tài xế. */
export const gpsSimulator = new GpsSimulator();

// Cài lớp chuyển tiếp ngay khi module được nạp (trước mọi React effect) để
// `watchPosition` của luồng GPS thật chắc chắn đi qua engine. Khi chưa bật giả
// lập, lớp này chỉ chuyển tiếp xuống GPS gốc của thiết bị.
if (GPS_SIMULATOR_ENABLED) {
  gpsSimulator.ensureShim();
}
