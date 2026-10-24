"use client";

// ============================================================================
// GpsSimulatorPanel — bảng điều khiển "GPS mô phỏng" cho demo/test.
//
// Chỉ hiện ở môi trường dev (hoặc khi đặt NEXT_PUBLIC_GPS_SIMULATOR=1) và chỉ
// với tài khoản DRIVER. Panel điều khiển engine `gpsSimulator` trong
// src/lib/gps-simulator.ts:
//   1. Chọn lộ trình: đơn đang giao (vị trí bạn → quán → khách), vòng quanh
//      Quận 1, hoặc vòng tròn 300 m quanh vị trí hiện tại.
//   2. Chạy / tạm dừng / dừng, đổi tốc độ, nhảy tới đích.
//   3. "Bắn GPS lệch 1 km" → tạo điểm bất thường để thử tín hiệu GPS của
//      resolution-service (nghi vấn GPS_SPOOFING).
//
// Toàn bộ vị trí phát ra vẫn đi qua luồng thật (watchPosition → lấy mẫu →
// WS tracking:push/HTTP batch) nên backend ghi đúng `driver_location_history`.
// ============================================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";
import { dispatchApi, driverApi, orderApi } from "@mythfood/api-client";
import {
  canAccessApp,
  fetchRouteThrough,
  useAuthStore,
  useLocationStore,
} from "@mythfood/frontend-shared";
import {
  DEFAULT_SIM_SPEED_KMH,
  DEMO_ROUTE_Q1,
  GPS_SIMULATOR_ENABLED,
  buildLoopRoute,
  gpsSimulator,
  type GpsSimStatus,
  type LatLngPoint,
} from "@/lib/gps-simulator";
import {
  customerLocation,
  restaurantLocation,
  unwrap,
} from "@/lib/delivery-flow";

type PresetKey = "order" | "demo" | "loop";

const PRESET_META: Record<PresetKey, { icon: string; label: string }> = {
  order: { icon: "📦", label: "Đơn đang giao" },
  demo: { icon: "🏙️", label: "Vòng Q1" },
  loop: { icon: "🎯", label: "Quanh đây" },
};

const SPEED_PRESETS = [10, 20, 30, 45];

/** Trạng thái dispatch đang trong chuyến (chưa kết thúc). */
const ACTIVE_DISPATCH_STATUSES = [
  "DRIVER_ACCEPTED",
  "DRIVER_ARRIVED",
  "PICKED_UP",
  "DELIVERING",
];

const DRIVER_POLL_MS = 10_000;
/** Tâm dự phòng khi tài xế chưa có toạ độ nào (Chợ Bến Thành, Q1). */
const FALLBACK_CENTER: LatLngPoint = {
  latitude: 10.77248,
  longitude: 106.69803,
};

/** Bật ở dev, hoặc bật tường minh bằng biến môi trường trên bản build. */
const PANEL_ENABLED = GPS_SIMULATOR_ENABLED;

const STATUS_META: Record<
  GpsSimStatus,
  { label: string; dot: string; badge: string }
> = {
  idle: {
    label: "GPS thật",
    dot: "bg-gray-400",
    badge: "bg-gray-100 text-gray-600",
  },
  running: {
    label: "Đang chạy",
    dot: "bg-emerald-500 animate-pulse",
    badge: "bg-emerald-100 text-emerald-700",
  },
  paused: {
    label: "Tạm dừng",
    dot: "bg-amber-500",
    badge: "bg-amber-100 text-amber-700",
  },
  arrived: {
    label: "Đã tới đích",
    dot: "bg-blue-500",
    badge: "bg-blue-100 text-blue-700",
  },
};

function formatMeters(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  return meters >= 1000
    ? `${(meters / 1000).toFixed(2)} km`
    : `${Math.round(meters)} m`;
}

export default function GpsSimulatorPanel() {
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const storeLocation = useLocationStore((s) => s.location);
  const setLocation = useLocationStore((s) => s.setLocation);

  const sim = useSyncExternalStore(
    gpsSimulator.subscribe,
    gpsSimulator.getSnapshot,
    gpsSimulator.getServerSnapshot,
  );

  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<PresetKey>("order");
  const [loading, setLoading] = useState<PresetKey | null>(null);
  const [notice, setNotice] = useState("");
  const [driver, setDriver] = useState<any>(null);
  const [activeDispatch, setActiveDispatch] = useState<any>(null);

  const userId = user?.id;
  const canSimulate =
    isAuthenticated && !!userId && canAccessApp(user?.roles, "DRIVER");
  const isOnline = driver?.onlineStatus === "ONLINE";

  // Cài lớp chuyển tiếp GPS ngay khi vào app: watcher nào đăng ký trước khi
  // panel được mở vẫn nằm trong tầm kiểm soát của engine.
  useEffect(() => {
    if (!PANEL_ENABLED || !canSimulate) return;
    gpsSimulator.ensureShim();
  }, [canSimulate]);

  // Theo dõi tài xế (trạng thái ONLINE) + chuyến đang chạy để dựng tuyến.
  useEffect(() => {
    if (!PANEL_ENABLED || !canSimulate || !userId) {
      setDriver(null);
      setActiveDispatch(null);
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      try {
        const me = unwrap<any>(await driverApi.getByUserId(userId));
        if (cancelled) return;
        setDriver(me ?? null);
        if (!me?.id) return;
        const res: any = await dispatchApi.getByDriver(me.id);
        if (cancelled) return;
        const list: any[] = unwrap<any[]>(res) ?? [];
        const active =
          (Array.isArray(list) ? list : []).find((item: any) =>
            ACTIVE_DISPATCH_STATUSES.includes(String(item?.status)),
          ) ?? null;
        setActiveDispatch(active);
      } catch {
        // Chưa có hồ sơ tài xế / lỗi mạng → tick sau thử lại.
      }
    };

    void refresh();
    const timer = setInterval(refresh, DRIVER_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [canSimulate, userId]);

  // Đồng bộ toạ độ mô phỏng vào store để marker trên bản đồ chạy theo, kể cả
  // khi tài xế đang OFFLINE (lúc đó luồng GPS thật không hoạt động).
  useEffect(() => {
    if (!sim.fix || sim.status === "idle") return;
    setLocation({
      latitude: sim.fix.latitude,
      longitude: sim.fix.longitude,
      address: `GPS mô phỏng ${sim.fix.latitude.toFixed(5)}, ${sim.fix.longitude.toFixed(5)}`,
      source: "gps",
    });
  }, [sim.fix, sim.status, setLocation]);

  /** Tâm để dựng vòng tròn: ưu tiên vị trí đang phát → GPS tài xế → store. */
  const resolveCenter = useCallback((): LatLngPoint => {
    const fix = gpsSimulator.getSnapshot().fix;
    if (fix) return { latitude: fix.latitude, longitude: fix.longitude };
    if (driver?.currentLatitude != null && driver?.currentLongitude != null) {
      return {
        latitude: Number(driver.currentLatitude),
        longitude: Number(driver.currentLongitude),
      };
    }
    if (storeLocation) {
      return {
        latitude: storeLocation.latitude,
        longitude: storeLocation.longitude,
      };
    }
    return FALLBACK_CENTER;
  }, [driver, storeLocation]);

  /** Dựng lộ trình cho preset đã chọn. Trả về `true` khi nạp thành công. */
  const loadRoute = useCallback(
    async (key: PresetKey): Promise<boolean> => {
      setLoading(key);
      setNotice("");
      try {
        const speedKmh =
          gpsSimulator.getSnapshot().speedKmh || DEFAULT_SIM_SPEED_KMH;

        if (key === "demo") {
          const route = await fetchRouteThrough(DEMO_ROUTE_Q1);
          const ok = gpsSimulator.setRoute(route.points, {
            label: "Vòng quanh trung tâm Quận 1",
            loop: true,
            speedKmh,
          });
          if (!ok) setNotice("❌ Không dựng được tuyến demo.");
          return ok;
        }

        if (key === "loop") {
          const ok = gpsSimulator.setRoute(
            buildLoopRoute(resolveCenter(), 300, 24),
            {
              label: "Vòng tròn 300 m quanh vị trí hiện tại",
              loop: true,
              speedKmh,
            },
          );
          if (!ok) setNotice("❌ Chưa xác định được vị trí hiện tại.");
          return ok;
        }

        // "order" — bám theo đơn đang giao
        if (!activeDispatch?.orderId) {
          setNotice(
            "⚠️ Chưa có đơn đang giao — nhận đơn trước hoặc chọn tuyến demo.",
          );
          return false;
        }
        const order = unwrap<any>(
          await orderApi.getById(activeDispatch.orderId).catch(() => null),
        );
        const restaurant = restaurantLocation(activeDispatch, null);
        const customer = customerLocation(order, activeDispatch);
        if (!restaurant || !customer) {
          setNotice("❌ Đơn thiếu toạ độ quán/khách.");
          return false;
        }

        const pickedUp = ["PICKED_UP", "DELIVERING"].includes(
          String(activeDispatch.status),
        );
        const waypoints: LatLngPoint[] = pickedUp
          ? [resolveCenter(), customer]
          : [resolveCenter(), restaurant, customer];
        const shortId = String(activeDispatch.orderId).slice(0, 8);
        const route = await fetchRouteThrough(waypoints);
        const ok = gpsSimulator.setRoute(route.points, {
          label: pickedUp
            ? `Đơn #${shortId}: vị trí bạn → khách`
            : `Đơn #${shortId}: vị trí bạn → quán → khách`,
          loop: false,
          speedKmh,
        });
        if (!ok) setNotice("❌ Không dựng được tuyến cho đơn này.");
        return ok;
      } finally {
        setLoading(null);
      }
    },
    [activeDispatch, resolveCenter],
  );

  /** Chạy / tạm dừng; tự nạp tuyến nếu chưa có (hoặc đã chạy hết tuyến). */
  const handlePlayPause = useCallback(async () => {
    const snapshot = gpsSimulator.getSnapshot();
    if (snapshot.status === "running") {
      gpsSimulator.pause();
      return;
    }
    const needRoute =
      snapshot.routePointCount < 2 || snapshot.status === "arrived";
    if (needRoute && !(await loadRoute(preset))) return;
    gpsSimulator.start();
  }, [loadRoute, preset]);

  const handleStop = useCallback(() => {
    gpsSimulator.stop();
    setNotice("");
  }, []);

  const handlePreset = useCallback(
    async (key: PresetKey) => {
      setPreset(key);
      const ok = await loadRoute(key);
      // Đang chạy dở mà đổi tuyến → chạy tiếp tuyến mới ngay.
      if (ok && gpsSimulator.getSnapshot().status !== "idle") {
        gpsSimulator.start();
      }
    },
    [loadRoute],
  );

  const handleJump = useCallback(() => {
    const fix = gpsSimulator.teleportJump(1_000);
    setNotice(
      fix
        ? "📡 Đã bắn 1 điểm lệch ~1 km — xem tín hiệu GPS ở resolution-service."
        : "⚠️ Bật mô phỏng trước rồi mới bắn điểm GPS lỗi được.",
    );
  }, []);

  const progressPercent =
    sim.totalMeters > 0
      ? Math.min(100, (sim.progressMeters / sim.totalMeters) * 100)
      : 0;
  const remainingMeters = Math.max(0, sim.totalMeters - sim.progressMeters);
  const etaMinutes = useMemo(() => {
    if (sim.speedKmh <= 0) return 0;
    return Math.round((remainingMeters / 1000 / sim.speedKmh) * 60);
  }, [remainingMeters, sim.speedKmh]);

  const statusMeta = STATUS_META[sim.status];
  const hidden =
    !PANEL_ENABLED ||
    !canSimulate ||
    pathname === "/login" ||
    pathname === "/register";
  if (hidden) return null;

  return (
    <div className="fixed bottom-24 right-3 z-[130] flex flex-col items-end gap-2">
      {open && (
        <div className="w-[min(340px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-gray-200 bg-white/95 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between bg-slate-900 px-3 py-2 text-white">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🧪</span>
              <p className="text-xs font-bold">Giả lập GPS</p>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${statusMeta.badge}`}
              >
                {statusMeta.label}
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Đóng bảng giả lập GPS"
              className="text-xs text-white/70 transition hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2.5 p-3">
            {driver && !isOnline && (
              <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-700">
                Tài xế đang OFFLINE — bật ONLINE ở trang Khu vực để backend ghi
                nhận lịch sử GPS.
              </p>
            )}

            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(PRESET_META) as PresetKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => void handlePreset(key)}
                  disabled={loading !== null}
                  className={`rounded-xl border px-1 py-1.5 text-[11px] font-semibold transition disabled:opacity-50 ${
                    preset === key
                      ? "border-[#ff6b35] bg-orange-50 text-[#ff6b35]"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {loading === key
                    ? "…"
                    : `${PRESET_META[key].icon} ${PRESET_META[key].label}`}
                </button>
              ))}
            </div>

            <p className="truncate text-[11px] text-gray-500" title={sim.label}>
              {sim.label || "Chưa nạp tuyến"}
            </p>

            <div className="space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-[#ff6b35] transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-500">
                <span>
                  {formatMeters(sim.progressMeters)} /{" "}
                  {formatMeters(sim.totalMeters)}
                </span>
                <span>
                  còn {formatMeters(remainingMeters)} · ~{etaMinutes}′
                </span>
              </div>
            </div>

            <div className="flex gap-1.5">
              <button
                onClick={() => void handlePlayPause()}
                disabled={loading !== null}
                className="flex-1 rounded-xl bg-[#ff6b35] py-2 text-xs font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
              >
                {sim.status === "running"
                  ? "⏸ Tạm dừng"
                  : sim.status === "idle"
                    ? "▶ Chạy mô phỏng"
                    : "▶ Tiếp tục"}
              </button>
              <button
                onClick={handleStop}
                disabled={sim.status === "idle"}
                aria-label="Dừng mô phỏng"
                className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
              >
                ⏹
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-gray-500">
                Tốc độ
              </span>
              {SPEED_PRESETS.map((kmh) => (
                <button
                  key={kmh}
                  onClick={() => gpsSimulator.setSpeed(kmh)}
                  className={`rounded-lg px-2 py-1 text-[10px] font-bold transition ${
                    Math.round(sim.speedKmh) === kmh
                      ? "bg-slate-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {kmh}
                </button>
              ))}
              <span className="ml-auto text-[10px] text-gray-400">km/h</span>
            </div>

            <div className="flex gap-1.5">
              <button
                onClick={() => gpsSimulator.skipToEnd()}
                disabled={sim.status === "idle"}
                className="flex-1 rounded-xl bg-blue-50 py-1.5 text-[11px] font-bold text-blue-600 transition hover:bg-blue-100 disabled:opacity-40"
              >
                ⏭ Tới đích
              </button>
              <button
                onClick={handleJump}
                disabled={sim.status === "idle"}
                title="Bắn 1 điểm GPS lệch 1 km để thử tín hiệu GPS bất thường"
                className="flex-1 rounded-xl bg-purple-50 py-1.5 text-[11px] font-bold text-purple-600 transition hover:bg-purple-100 disabled:opacity-40"
              >
                📡 GPS lỗi
              </button>
            </div>

            <div className="rounded-lg bg-gray-50 px-2 py-1.5 text-[10px] leading-relaxed text-gray-600">
              <p className="font-mono">
                {sim.fix
                  ? `${sim.fix.latitude.toFixed(5)}, ${sim.fix.longitude.toFixed(5)}`
                  : "—"}
              </p>
              <p>
                {sim.watcherCount > 0
                  ? `🛰️ ${sim.watcherCount} watcher GPS`
                  : "⚠️ Chưa có watcher GPS"}
                {" · "}
                {isOnline ? "🟢 ONLINE" : "⚪ OFFLINE"}
              </p>
            </div>

            {notice && (
              <p className="rounded-lg bg-slate-100 px-2 py-1.5 text-[11px] leading-snug text-slate-700">
                {notice}
              </p>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full bg-slate-900/90 px-3 py-2 text-[11px] font-bold text-white shadow-lg backdrop-blur transition hover:bg-slate-900"
      >
        <span className={`h-2 w-2 rounded-full ${statusMeta.dot}`} />
        🧪 GPS demo
        {sim.status !== "idle" && (
          <span className="font-mono text-[10px] text-white/70">
            {Math.round(progressPercent)}%
          </span>
        )}
      </button>
    </div>
  );
}
