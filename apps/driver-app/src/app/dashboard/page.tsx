"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  driverApi,
  orderApi,
  walletApi,
  dispatchApi,
} from "@mythfood/api-client";
import {
  useAuthStore,
  useLocationStore,
  LocationGate,
  haversineKm,
  formatDistance,
  canAccessApp,
  NotificationBell,
  reverseGeocodeAddress,
} from "@mythfood/frontend-shared";
import DeliveryDrawer from "@/components/DeliveryDrawer";
import DeliveredOrdersDrawer from "@/components/DeliveredOrdersDrawer";
import DriverActiveOrderCard from "@/components/DriverActiveOrderCard";
import {
  acceptOrder as acceptDispatchOrder,
  friendlyError,
} from "@/lib/delivery-flow";

// ─── Helpers ────────────────────────────────────────────────
function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

// ≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡
export default function DriverDashboardPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();

  const [driver, setDriver] = useState<any>(null);
  const [availableOrders, setAvailableOrders] = useState<any[]>([]);
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { location, hasLocation } = useLocationStore();
  const [driverAddress, setDriverAddress] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showDeliveredDrawer, setShowDeliveredDrawer] = useState(false);
  const [now, setNow] = useState(Date.now());
  const firstSeen = useRef<Record<string, number>>({});
  // Đơn đã bị ẩn (hết 60s hoặc tài xế từ chối) → không hiển thị lại trong phiên
  const hiddenOrderIds = useRef<Set<string>>(new Set());
  // Trigger reload (vd: sau khi tài xế cập nhật trạng thái đơn từ floating card)
  const [reloadTick, setReloadTick] = useState(0);

  // Tick every second for the countdown timer on order cards
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Reverse geocode vị trí tài xế (lat/lng -> địa chỉ text)
  useEffect(() => {
    const lat =
      driver?.currentLatitude != null
        ? Number(driver.currentLatitude)
        : hasLocation && location
          ? location.latitude
          : null;
    const lng =
      driver?.currentLongitude != null
        ? Number(driver.currentLongitude)
        : hasLocation && location
          ? location.longitude
          : null;
    if (lat == null || lng == null) {
      setDriverAddress(null);
      return;
    }
    let cancelled = false;
    reverseGeocodeAddress(lat, lng)
      .then((address) => {
        if (!cancelled) setDriverAddress(address);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    driver?.currentLatitude,
    driver?.currentLongitude,
    hasLocation,
    location,
  ]);

  // Filter available orders within 5km of driver
  // Hiển thị tất cả đơn READY (sắp theo khoảng cách gần nhất), không giới hạn 5km
  // để khớp matching engine (mở rộng bán kính đến vô hạn).
  const nearbyOrders = [...availableOrders].sort((a: any, b: any) => {
    const dist = (o: any) => {
      if (!hasLocation || !location) return Infinity;
      if (o.deliveryLatitude == null || o.deliveryLongitude == null)
        return Infinity;
      return haversineKm(
        location.latitude,
        location.longitude,
        Number(o.deliveryLatitude),
        Number(o.deliveryLongitude),
      );
    };
    return dist(a) - dist(b);
  });

  // Stats (computed from real order data) — tài xế giữ 80% phí ship (20% hoa hồng nền tảng)
  const deliveredOrders = activeOrders.filter((o) => o.status === "DELIVERED");
  const isToday = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  };
  const todayEarnings = deliveredOrders
    .filter((o) => isToday(o.createdAt))
    .reduce(
      (sum, o) => Math.round(sum + toNum(o.deliveryFee || 15000) * 0.8),
      0,
    );
  const weekEarnings = deliveredOrders.reduce(
    (sum, o) => Math.round(sum + toNum(o.deliveryFee || 15000) * 0.8),
    0,
  );
  const completedOrders = deliveredOrders.length;

  // Chỉ các đơn đang giao (chưa hoàn thành / chưa hủy) — loại bỏ đơn đã giao thành công
  const deliveringOrders = activeOrders.filter(
    (o) => o.status !== "DELIVERED" && o.status !== "CANCELLED",
  );

  // 1 tài xế chỉ nhận 1 đơn tại một thời điểm → đơn đang giao duy nhất
  const activeOrder = deliveringOrders[0] ?? null;

  const remainingSeconds = (orderId: string): number => {
    const seen = firstSeen.current[orderId];
    if (!seen) return 60;
    return Math.max(0, 60 - Math.floor((now - seen) / 1000));
  };

  // Load driver data
  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (!canAccessApp(user?.roles, "DRIVER")) {
      clearAuth();
      router.push("/login");
      return;
    }
    let interval: any;
    async function load() {
      try {
        const dRes = await driverApi.getByUserId(user?.id || "");
        const d = (dRes as any).data ?? dRes;
        setDriver(d);
        if (d && d.status === "ACTIVE") {
          const [availRes, activeRes] = await Promise.all([
            orderApi.list({ status: "READY_FOR_PICKUP", take: 20 }),
            orderApi.listByDriver(d.id),
          ]);
          const availItems = (availRes as any).items || [];
          const availList = (
            Array.isArray(availItems) ? availItems : []
          ).filter((o: any) => !hiddenOrderIds.current.has(o.id));
          const seen = firstSeen.current;
          for (const o of availList) {
            if (!seen[o.id]) seen[o.id] = Date.now();
          }
          setAvailableOrders(availList);
          // activeRes may return all orders assigned to this driver (including DELIVERED)
          const allDriverOrders = Array.isArray(activeRes) ? activeRes : [];
          setActiveOrders(allDriverOrders);
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
    interval = setInterval(load, 10000);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAuthenticated, user, router, reloadTick]);

  // ─── Actions ──────────────────────────────────────────────
  async function toggleOnline() {
    if (!driver) return;
    try {
      const isOnline = driver.onlineStatus === "ONLINE";
      const res = isOnline
        ? await driverApi.goOffline(driver.id)
        : await driverApi.goOnline(driver.id);
      setDriver((res as any).data ?? res);
    } catch {
      /* ignore */
    }
  }

  const [walletBalance, setWalletBalance] = useState(0);
  const [heldBalance, setHeldBalance] = useState(0);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [codEligible, setCodEligible] = useState(false);
  const [hasActiveCOD, setHasActiveCOD] = useState(false);
  const [codCheckLoading, setCodCheckLoading] = useState(false);

  // Check COD eligibility when driver loads
  useEffect(() => {
    if (!driver) return;
    async function checkWallet() {
      try {
        const eligibility = await walletApi.checkCodEligibility(driver.id);
        setWalletBalance(eligibility.balance || 0);
        setHeldBalance(eligibility.heldBalance || 0);
        setAvailableBalance(
          eligibility.availableBalance || eligibility.balance || 0,
        );
        setCodEligible(eligibility.eligible || false);
        setHasActiveCOD(eligibility.hasActiveCOD || false);
      } catch {
        /* wallet service unavailable - assume not eligible */
      }
    }
    checkWallet();
  }, [driver]);

  async function acceptOrder(orderId: string) {
    if (!driver) return;
    setCodCheckLoading(true);
    try {
      // Find the order to check its payment method
      const order = availableOrders.find((o) => o.id === orderId);
      const isCardOrder =
        order?.paymentMethod === "CREDIT_CARD" ||
        order?.paymentMethod === "STRIPE";

      // Only check COD eligibility for COD (cash) orders
      if (!isCardOrder) {
        // Re-check COD eligibility before accepting
        let eligible = codEligible;
        try {
          const eligibility = await walletApi.checkCodEligibility(driver.id);
          eligible = eligibility.eligible || false;
          setWalletBalance(eligibility.balance || 0);
          setCodEligible(eligible);
        } catch {
          // If wallet service unavailable, REJECT (fail-safe)
          alert("⚠️ Không thể kiểm tra số dư ví. Vui lòng thử lại sau.");
          return;
        }

        if (!eligible) {
          if (hasActiveCOD) {
            alert(
              `⚠️ Không đủ khả dụng để nhận thêm COD!\n\n` +
                `💰 Khả dụng: ${availableBalance.toLocaleString("vi-VN")}₫\n` +
                `🔒 Đang giữ: ${heldBalance.toLocaleString("vi-VN")}₫\n` +
                `📦 Tổng ví: ${walletBalance.toLocaleString("vi-VN")}₫\n\n` +
                `Vui lòng hoàn thành đơn COD đang giao trước khi nhận thêm.`,
            );
          } else {
            alert(
              `⚠️ Cần nạp đủ 2.000.000₫ để nhận đơn COD đầu tiên!\n\n` +
                `💰 Số dư hiện tại: ${walletBalance.toLocaleString("vi-VN")}₫\n` +
                `💸 Cần nạp thêm: ${(2000000 - walletBalance).toLocaleString("vi-VN")}₫\n\n` +
                `Vui lòng nạp thêm tiền vào ví trước khi nhận đơn.`,
            );
          }
          return;
        }
      }

      await acceptDispatchOrder(order, driver.id);
      // Chuyển ngay đơn sang danh sách “Đơn đang giao” để hiển thị nút trạng thái kế tiếp
      if (order) {
        setActiveOrders((prev) => [
          order,
          ...prev.filter((x) => x.id !== order.id),
        ]);
      }
      setAvailableOrders(availableOrders.filter((o) => o.id !== orderId));
      // Mở trang giao hàng theo đúng yêu cầu: bấm nhận đơn → /delivery/[mã đơn]
      router.push(`/delivery/${orderId}`);
      setDriver(((await driverApi.getById(driver.id)) as any).data ?? driver);
    } catch (err: any) {
      alert(friendlyError(err, "Không nhận được đơn này. Vui lòng thử lại."));
    } finally {
      setCodCheckLoading(false);
    }
  }

  async function declineOrder(orderId: string) {
    // Xóa khỏi danh sách ngay (optimistic UI) và ẩn trong phiên
    hiddenOrderIds.current.add(orderId);
    setAvailableOrders((prev) => prev.filter((o) => o.id !== orderId));

    if (!driver) return;
    try {
      // Tìm dispatch của đơn này
      const dRes: any = await dispatchApi.getByOrder(orderId).catch(() => null);
      const dispatch = dRes?.data ?? null;
      // Nếu đơn đang được gán cho tài xế này và đang chờ phản hồi → từ chối
      // để backend tìm tài xế khác ngay lập tức.
      if (
        dispatch?.id &&
        dispatch.status === "DRIVER_ASSIGNED" &&
        dispatch.driverId === driver.id
      ) {
        await dispatchApi.driverDecline(dispatch.id, {
          driverId: driver.id,
          reason: "OTHER",
          detail: "Tài xế từ chối",
        });
      }
    } catch {
      /* non-fatal */
    }
  }

  // ─── Hết 60s phản hồi → đơn tự động mất & backend tìm tài xế mới ─────
  useEffect(() => {
    if (!driver) return;
    const expired = availableOrders.filter((o) => remainingSeconds(o.id) <= 0);
    if (expired.length === 0) return;
    for (const o of expired) {
      declineOrder(o.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  // ─── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-500">Đang tải...</p>
        </div>
      </div>
    );
  }

  // ─── No driver ────────────────────────────────────────────
  if (!driver) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5] px-4">
        <div className="text-center bg-white rounded-2xl shadow-sm p-8 sm:p-10 max-w-md">
          <p className="text-5xl mb-4">🛵</p>
          <p className="text-xl font-bold text-[#1a1a2e] mb-2">
            Bạn chưa đăng ký tài xế
          </p>
          <p className="text-gray-500 text-sm mb-6">
            Đăng ký để bắt đầu nhận đơn và kiếm tiền
          </p>
          <Link
            href="/register"
            className="bg-[#ff6b35] text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-orange-600 transition"
          >
            Đăng ký ngay
          </Link>
        </div>
      </div>
    );
  }

  // ─── Inactive / Pending approval ──────────────────────────
  if (driver.status === "INACTIVE") {
    return (
      <div className="min-h-screen bg-[#f0f2f5]">
        <header className="bg-[#1a1a2e] px-4 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="text-xl font-extrabold text-white">
              MyTh<span className="text-[#ff6b35]">Food</span>
            </div>
            <button
              onClick={() => {
                clearAuth();
                router.push("/");
              }}
              className="text-sm text-gray-400 hover:text-red-500 transition"
            >
              Đăng xuất
            </button>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-16">
          <div className="bg-white rounded-2xl shadow-sm p-8 sm:p-10 text-center">
            <div className="text-6xl mb-6">⏳</div>
            <h2 className="text-2xl font-bold text-[#e67e22] mb-3">
              Đang chờ duyệt
            </h2>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 mb-6">
              <p className="text-orange-800 font-medium mb-2">
                Hồ sơ của bạn đang chờ Admin duyệt
              </p>
              <p className="text-orange-700 text-sm">
                Admin sẽ duyệt hồ sơ trong 24-48h. Bạn sẽ nhận thông báo khi tài
                khoản được kích hoạt.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm text-gray-500 mb-6">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="font-medium text-gray-700">Tên</p>
                <p>{driver.fullName}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="font-medium text-gray-700">Loại xe</p>
                <p>{driver.vehicleType}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="font-medium text-gray-700">Biển số</p>
                <p>{driver.vehicleRegistrationNumber}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="font-medium text-gray-700">SĐT</p>
                <p>{driver.phoneNumber}</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const isOnline = driver.onlineStatus === "ONLINE";
  const driverLat =
    driver?.currentLatitude != null
      ? Number(driver.currentLatitude)
      : hasLocation && location
        ? location.latitude
        : null;
  const driverLng =
    driver?.currentLongitude != null
      ? Number(driver.currentLongitude)
      : hasLocation && location
        ? location.longitude
        : null;

  // ═══════════════ ACTIVE DASHBOARD ═══════════════════════════
  return (
    <>
      <LocationGate />
      <div className="min-h-screen bg-[#f0f2f5] max-w-[1400px] mx-auto pb-20 lg:pb-0 w-full">
        {/* ≡≡≡≡≡ HEADER ≡≡≡≡≡ */}
        <header className="bg-[#1a1a2e] px-4 sm:px-6 py-4 text-white w-full">
          <div className="max-w-[1600px] mx-auto w-full">
            <div className="flex items-center justify-between">
              <div className="text-xl sm:text-2xl font-extrabold">
                MyTh<span className="text-[#ff6b35]">Food</span>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href="/location"
                  className="text-xl hover:scale-110 transition-transform"
                  title="Cập nhật vị trí"
                >
                  📍
                </Link>
                <button className="text-xl">💬</button>
                <button
                  onClick={() => setShowDeliveredDrawer(true)}
                  className="relative text-xl hover:scale-110 transition-transform"
                  title="Đơn đã giao"
                >
                  📦
                  {deliveredOrders.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-green-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {deliveredOrders.length}
                    </span>
                  )}
                </button>
                <NotificationBell userId={user?.id} />
                <button
                  onClick={() => {
                    clearAuth();
                    router.push("/");
                  }}
                  className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition"
                >
                  Đăng xuất
                </button>
              </div>
            </div>

            {/* Driver status card */}
            <div className="mt-3 flex items-center gap-4 bg-white/8 rounded-2xl p-3 sm:p-4">
              <div className="w-11 h-11 bg-[#ff6b35] rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0">
                {(driver.fullName || "?")[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm sm:text-base truncate">
                  {driver.fullName}
                </p>
                <p
                  className={`text-xs font-medium ${isOnline ? "text-[#2ecc71]" : "text-gray-400"}`}
                >
                  {isOnline ? "🟢 Đang online" : "⚫ Đang offline"}
                </p>
              </div>
              <button
                onClick={toggleOnline}
                className={`px-4 sm:px-6 py-2 rounded-full text-sm font-bold transition-all ${
                  isOnline
                    ? "bg-[#e74c3c] hover:bg-red-600 text-white"
                    : "bg-[#2ecc71] hover:bg-green-600 text-white"
                }`}
              >
                {isOnline ? "Offline" : "Online"}
              </button>
            </div>
          </div>
        </header>

        {/* ≡≡≡≡≡ MAIN ≡≡≡≡≡ */}
        <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 w-full">
          {/* ─── QUICK ACTIONS ─── */}
          <div className="grid grid-cols-4 gap-2 sm:gap-3 mb-6">
            {[
              {
                icon: "💰",
                label: "Ví",
                href: "/wallet",
                color: "from-green-500 to-emerald-600",
              },
              {
                icon: "🗺️",
                label: "Bản đồ",
                href: "/location",
                color: "from-blue-500 to-cyan-600",
              },
              {
                icon: "📊",
                label: "Thu nhập",
                href: "/earnings",
                color: "from-purple-500 to-pink-600",
              },
              {
                icon: "📦",
                label: "Đơn hàng",
                href: "/orders",
                color: "from-orange-500 to-red-500",
              },
            ].map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className={`bg-gradient-to-br ${a.color} rounded-2xl p-4 text-center text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all`}
              >
                <span className="text-2xl block mb-1">{a.icon}</span>
                <span className="text-xs font-semibold">{a.label}</span>
              </Link>
            ))}
          </div>

          {/* ─── EARNINGS ─── */}
          <div className="bg-white rounded-2xl shadow-sm p-5 grid grid-cols-3 gap-4 text-center mb-6">
            {[
              {
                label: "Hôm nay",
                value: `${(todayEarnings / 1000).toFixed(0)}.000đ`,
                color: "text-[#ff6b35]",
              },
              {
                label: "Tuần này",
                value: `${(weekEarnings / 1_000_000).toFixed(1)}trđ`,
                color: "text-[#1a1a2e]",
              },
              {
                label: "Đơn hoàn thành",
                value: completedOrders.toLocaleString("vi-VN"),
                color: "text-[#2ecc71]",
              },
            ].map((s, i) => (
              <div key={i}>
                <p className="text-xs text-gray-400">{s.label}</p>
                <p
                  className={`text-lg sm:text-xl font-extrabold mt-0.5 ${s.color}`}
                >
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          {/* ─── LOCATION STATUS ─── */}
          <Link
            href="/location"
            className="block bg-gradient-to-br from-[#1a1a2e] to-[#2d2d44] rounded-2xl p-6 text-white text-center mb-6 relative overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
          >
            <div className="absolute top-3 right-4 bg-white/15 px-3 py-1 rounded-full text-xs font-semibold">
              {isOnline ? "🟢 Đang hoạt động" : "⚫ Offline"}
            </div>
            <div className="text-4xl mb-2">📍</div>
            <p className="font-semibold text-lg">
              {isOnline
                ? deliveringOrders.length > 0
                  ? "Đang trên đường giao hàng"
                  : "Đang chờ đơn hàng mới"
                : "Hãy bật Online để nhận đơn"}
            </p>
            <p className="text-sm text-white/50 mt-1">
              {isOnline
                ? `${nearbyOrders.length} đơn đang chờ gần bạn`
                : "Nhấn nút Online để bắt đầu"}
            </p>
            <p className="text-xs text-white/70 mt-2">
              {driverLat != null && driverLng != null ? (
                <>
                  📍 {driverAddress || "Vị trí hiện tại"}{" "}
                  <span className="font-mono text-white/50">
                    ({driverLat.toFixed(6)}, {driverLng.toFixed(6)})
                  </span>
                </>
              ) : (
                "📍 Chưa có vị trí"
              )}
            </p>
            <div className="mt-3 text-xs text-white/30">
              👆 Nhấn để cập nhật vị trí của bạn
            </div>
          </Link>

          {/* ─── AVAILABLE ORDERS ─── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-[#1a1a2e]">
                📦 Đơn hàng gần bạn ({nearbyOrders.length})
              </h2>
              {nearbyOrders.length > 0 && (
                <Link
                  href="/orders"
                  className="text-sm font-semibold text-[#ff6b35] hover:underline"
                >
                  Xem tất cả →
                </Link>
              )}
            </div>

            {!isOnline ? (
              <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
                <p className="text-3xl mb-2">🔒</p>
                <p className="text-gray-400 text-sm">
                  Bật Online để xem đơn hàng gần bạn
                </p>
              </div>
            ) : nearbyOrders.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
                <p className="text-3xl mb-2">📦</p>
                <p className="text-gray-400 text-sm">
                  Chưa có đơn hàng nào sẵn sàng gần bạn (trong 5km)
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Hãy đợi thêm đơn mới...
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {nearbyOrders.map((o: any) => (
                  <div
                    key={o.id}
                    className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="font-semibold text-gray-800">
                          #{o.id?.slice(0, 8)}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ml-1 ${o.paymentMethod === "CREDIT_CARD" ? "bg-purple-100 text-purple-700" : "bg-green-100 text-green-700"}`}
                        >
                          {o.paymentMethod === "CREDIT_CARD"
                            ? "💳 Thẻ"
                            : "💵 COD"}
                        </span>
                        <span className="text-xs bg-[#e8f5e9] text-[#2e7d32] px-2.5 py-0.5 rounded-full font-semibold ml-2">
                          📦 Sẵn sàng
                        </span>
                      </div>
                      <span className="text-[#ff6b35] font-bold text-lg shrink-0 ml-3">
                        {toNum(o.totalAmount).toLocaleString("vi-VN")}₫
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 space-y-1.5 mb-3">
                      <p className="flex items-center gap-1">
                        <span>📍</span>{" "}
                        <span className="truncate">
                          Giao đến: {o.deliveryAddress}
                        </span>
                      </p>
                      {o.items && (
                        <p className="flex items-center gap-1">
                          <span>🛒</span>{" "}
                          {o.items
                            .slice(0, 3)
                            .map((i: any) => `${i.quantity}x ${i.name}`)
                            .join(", ")}
                          {o.items.length > 3 ? "..." : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                      <span>⏱ Thời gian phản hồi</span>
                      <span
                        className={`font-bold ${remainingSeconds(o.id) <= 10 ? "text-red-500" : "text-[#ff6b35]"}`}
                      >
                        {remainingSeconds(o.id)}s
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => declineOrder(o.id)}
                        className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-200 transition"
                      >
                        Từ chối
                      </button>
                      <button
                        onClick={() => acceptOrder(o.id)}
                        className="flex-1 bg-[#ff6b35] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-orange-600 transition"
                      >
                        ✅ Nhận đơn
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Floating card đơn đang giao (1 đơn duy nhất) */}
        <DriverActiveOrderCard
          orderId={activeOrder?.id ?? null}
          onOpen={() => activeOrder && setSelectedOrderId(activeOrder.id)}
          onChanged={() => setReloadTick((t) => t + 1)}
        />

        {/* Danh sách đơn đã giao (Drawer/Slide-over) */}
        <DeliveredOrdersDrawer
          open={showDeliveredDrawer}
          onClose={() => setShowDeliveredDrawer(false)}
          orders={deliveredOrders}
          onSelectOrder={(id) => setSelectedOrderId(id)}
        />

        {/* Delivery drawer */}
        <DeliveryDrawer
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
        />

        {/* ≡≡≡≡≡ MOBILE BOTTOM NAV ≡≡≡≡≡ */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
          <Link
            href="/dashboard"
            className="flex flex-col items-center text-[10px] text-[#ff6b35] no-underline"
          >
            <span className="text-[22px]">🏠</span>
            <span>Trang chủ</span>
          </Link>
          <Link
            href="/orders"
            className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
          >
            <span className="text-[22px]">📦</span>
            <span>Đơn hàng</span>
          </Link>
          <Link
            href="/map"
            className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
          >
            <span className="text-[22px]">🗺️</span>
            <span>Bản đồ</span>
          </Link>
          <Link
            href="/earnings"
            className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
          >
            <span className="text-[22px]">💰</span>
            <span>Thu nhập</span>
          </Link>
          <Link
            href="/profile"
            className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
          >
            <span className="text-[22px]">👤</span>
            <span>Tài khoản</span>
          </Link>
        </nav>
      </div>
    </>
  );
}
