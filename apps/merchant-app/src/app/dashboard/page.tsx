"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { merchantApi, orderApi } from "@mythfood/api-client";
import { useAuthStore, canAccessApp } from "@mythfood/frontend-shared";
import TopNav from "@/components/TopNav";
import OrderDetailDrawer from "@/components/OrderDetailDrawer";

// ─── Helpers ────────────────────────────────────────────────
function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

const STATUS_BADGES: Record<string, { cls: string; label: string }> = {
  PENDING: { cls: "bg-[#fff3e0] text-[#e67e22]", label: "⏳ Chờ xác nhận" },
  CONFIRMED: { cls: "bg-[#e3f2fd] text-[#1976d2]", label: "✅ Đã xác nhận" },
  PREPARING: { cls: "bg-[#e3f2fd] text-[#1976d2]", label: "🔪 Đang chuẩn bị" },
  READY_FOR_PICKUP: {
    cls: "bg-[#e8f5e9] text-[#2e7d32]",
    label: "📦 Sẵn sàng",
  },
  OUT_FOR_DELIVERY: {
    cls: "bg-[#fce4ec] text-[#c62828]",
    label: "🚚 Đang giao",
  },
  DELIVERED: { cls: "bg-[#e8f5e9] text-[#2e7d32]", label: "🏠 Đã giao" },
  CANCELLED: { cls: "bg-[#f5f5f5] text-[#888]", label: "❌ Đã hủy" },
  CANCELLED_NO_DRIVER: {
    cls: "bg-[#f5f5f5] text-[#888]",
    label: "🛑 Đã hủy - Không có tài xế",
  },
  DELIVERY_FAILED: {
    cls: "bg-[#f5f5f5] text-[#888]",
    label: "❌ Giao hàng thất bại",
  },
  REJECTED: { cls: "bg-[#f5f5f5] text-[#888]", label: "🚫 Từ chối" },
};

const GRADIENT_BG = [
  "from-[#f093fb] to-[#f5576c]",
  "from-[#43e97b] to-[#38f9d7]",
  "from-[#fa709a] to-[#fee140]",
  "from-[#a18cd1] to-[#fbc2eb]",
  "from-[#ff6b35] to-[#ff8f65]",
  "from-[#fbc2eb] to-[#a6c1ee]",
];

function todayStr(): string {
  const d = new Date();
  const days = [
    "Chủ Nhật",
    "Thứ 2",
    "Thứ 3",
    "Thứ 4",
    "Thứ 5",
    "Thứ 6",
    "Thứ 7",
  ];
  return `${days[d.getDay()]}, ${d.getDate()} tháng ${d.getMonth() + 1}, ${d.getFullYear()}`;
}

// ≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡
export default function MerchantDashboardPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();

  const [merchant, setMerchant] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<"overview" | "orders">("overview");
  const [orderFilter, setOrderFilter] = useState<string>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (!canAccessApp(user?.roles, "MERCHANT")) {
      clearAuth();
      router.push("/login");
      return;
    }
    let interval: any;
    async function load() {
      try {
        const res = await merchantApi.list({ take: 200 });
        const m =
          (res.items || []).find((m2: any) => m2.userId === user?.id) || null;
        setMerchant(m);
        if (m && m.status === "APPROVED") {
          const [orderRes, menuData] = await Promise.all([
            orderApi.listByMerchant(m.id),
            merchantApi.getMenu(m.id),
          ]);
          setOrders(Array.isArray(orderRes) ? orderRes : []);
          setMenuItems(Array.isArray(menuData) ? menuData : []);
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
    // Poll every 10s so new orders appear without manual reload
    interval = setInterval(load, 10000);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAuthenticated, user, router]);

  // ─── Computed stats ──────────────────────────────────────
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const todayOrders = orders.filter((o) => {
    const t = o.createdAt ? new Date(o.createdAt).getTime() : 0;
    return t >= todayStart;
  });
  const todayRevenue = orders
    .filter((o) => o.status === "DELIVERED")
    .reduce((sum, o) => {
      const foodTotal =
        o.items?.reduce(
          (s: number, i: any) => s + toNum(i.unitPrice) * (i.quantity || 1),
          0,
        ) || 0;
      return sum + Math.round(foodTotal * 0.7 * 0.9); // 70% split minus 10% VAT
    }, 0);
  const activeCount = orders.filter(
    (o) => !["DELIVERED", "CANCELLED", "REJECTED"].includes(o.status),
  ).length;
  const pendingCount = orders.filter((o) => o.status === "PENDING").length;

  const filteredOrders =
    orderFilter === "ALL"
      ? orders
      : orders.filter((o) => o.status === orderFilter);

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

  // ─── No merchant ──────────────────────────────────────────
  if (!merchant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5] px-4">
        <div className="text-center bg-white rounded-2xl shadow-sm p-8 sm:p-10 max-w-md">
          <p className="text-5xl mb-4">🏪</p>
          <p className="text-xl font-bold text-[#1a1a2e] mb-2">
            Bạn chưa đăng ký nhà hàng
          </p>
          <p className="text-gray-500 text-sm mb-6">
            Đăng ký để bắt đầu kinh doanh trên MyThFood
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

  // ─── Pending approval ─────────────────────────────────────
  if (merchant.status === "PENDING") {
    return (
      <div className="min-h-screen bg-[#f0f2f5]">
        <header className="bg-white shadow-sm px-4 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="text-xl font-extrabold">
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
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
            <div className="text-6xl mb-6">⏳</div>
            <h2 className="text-2xl font-bold text-[#e67e22] mb-3">
              Đang chờ duyệt
            </h2>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 mb-6">
              <p className="text-orange-800 font-medium mb-2">
                Tài khoản của bạn đang chờ Admin duyệt
              </p>
              <p className="text-orange-700 text-sm">
                Admin sẽ duyệt nhà hàng trong 24-48h. Bạn sẽ nhận thông báo khi
                tài khoản được kích hoạt.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm text-gray-500 mb-6">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="font-medium text-gray-700">Tên</p>
                <p>{merchant.name}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="font-medium text-gray-700">Địa chỉ</p>
                <p>{merchant.address}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="font-medium text-gray-700">SĐT</p>
                <p>{merchant.phone}</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ═══════════════ APPROVED DASHBOARD ═══════════════════════
  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <TopNav merchantName={merchant.name} isOpen={merchant.isOpen} />
      <main className="w-full max-w-[1600px] mx-auto">
        {/* ─── TOP BAR ─── */}
        <header className="bg-white rounded-2xl shadow-sm mx-4 mt-5 px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {merchant.logoUrl ? (
              <img
                src={merchant.logoUrl}
                alt={merchant.name}
                className="w-11 h-11 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-[#ff6b35] text-white flex items-center justify-center font-bold text-lg shrink-0">
                {(merchant.name || "?")[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-[#1a1a2e] truncate">
                👋 Xin chào, {merchant.name}!
              </h1>
              <p className="text-sm text-gray-400">
                {activeCount > 0
                  ? `Hôm nay có ${pendingCount} đơn hàng mới`
                  : "Chưa có đơn hàng mới"}
              </p>
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                📍 {merchant.address || "Chưa có địa chỉ"}
                {merchant.latitude != null && merchant.longitude != null
                  ? ` (${Number(merchant.latitude).toFixed(6)}, ${Number(merchant.longitude).toFixed(6)})`
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            <button className="relative text-xl">
              🔔
              {pendingCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#ff6b35] rounded-full" />
              )}
            </button>
            <Link
              href="/menu"
              className="hidden sm:inline-block bg-[#ff6b35] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-orange-600 transition"
            >
              + Thêm món
            </Link>
            <button
              onClick={() => {
                clearAuth();
                router.push("/");
              }}
              className="text-xs text-gray-400 hover:text-red-500 transition bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg"
            >
              Đăng xuất
            </button>
          </div>
        </header>

        <div className="px-4 py-6">
          {/* ─── STATS ─── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              {
                icon: "📦",
                label: "Đơn hàng hôm nay",
                value: todayOrders.length,
                sub: `${pendingCount} đơn mới`,
                color: "text-[#3b82f6]",
              },
              {
                icon: "💰",
                label: "Doanh thu",
                value: `${(todayRevenue / 1_000_000).toFixed(1)}trđ`,
                sub: "từ các đơn hàng",
                color: "text-[#2ecc71]",
              },
              {
                icon: "⭐",
                label: "Đánh giá",
                value: (merchant.rating || 0).toFixed(1),
                sub: `${merchant.totalReviews || 0} đánh giá`,
                color: "text-[#f5a623]",
              },
              {
                icon: "🔄",
                label: "Đơn đang xử lý",
                value: activeCount,
                sub:
                  pendingCount > 2
                    ? `⚠️ ${pendingCount} đơn chờ xác nhận`
                    : "Đang xử lý",
                color: "text-[#e67e22]",
              },
            ].map((s, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl shadow-sm p-5 relative overflow-hidden"
              >
                <span className="absolute top-3 right-4 text-3xl opacity-10">
                  {s.icon}
                </span>
                <p className="text-[13px] text-gray-400 font-medium">
                  {s.label}
                </p>
                <p className={`text-[28px] font-extrabold mt-1 ${s.color}`}>
                  {s.value}
                </p>
                <p className="text-xs text-gray-500 mt-1">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* ═══════════ OVERVIEW TAB ═══════════ */}
          {activeTab === "overview" && (
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Orders Table */}
              <div className="lg:col-span-2">
                <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                    <h3 className="text-lg font-bold text-[#1a1a2e]">
                      📦 Đơn hàng mới nhất
                    </h3>
                    <div className="flex gap-1.5 bg-gray-100 rounded-xl p-1 overflow-x-auto hide-scrollbar">
                      {[
                        { key: "ALL", label: "Tất cả" },
                        { key: "PENDING", label: "Chờ xác nhận" },
                        { key: "PREPARING", label: "Đang chuẩn bị" },
                        { key: "DELIVERED", label: "Hoàn thành" },
                      ].map((f) => (
                        <button
                          key={f.key}
                          onClick={() => setOrderFilter(f.key)}
                          className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition ${
                            orderFilter === f.key
                              ? "bg-white text-[#1a1a2e] shadow-sm"
                              : "text-gray-500 hover:text-gray-700"
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredOrders.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-4xl mb-3">📦</p>
                      <p className="text-gray-400">Chưa có đơn hàng nào</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 text-left">
                            <th className="pb-3 font-semibold text-gray-400 text-xs uppercase tracking-wider px-2">
                              Mã đơn
                            </th>
                            <th className="pb-3 font-semibold text-gray-400 text-xs uppercase tracking-wider px-2 hidden sm:table-cell">
                              Khách hàng
                            </th>
                            <th className="pb-3 font-semibold text-gray-400 text-xs uppercase tracking-wider px-2">
                              Tổng tiền
                            </th>
                            <th className="pb-3 font-semibold text-gray-400 text-xs uppercase tracking-wider px-2">
                              Trạng thái
                            </th>
                            <th className="pb-3 font-semibold text-gray-400 text-xs uppercase tracking-wider px-2 text-right">
                              Thao tác
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {filteredOrders.slice(0, 10).map((o: any) => {
                            const badge =
                              STATUS_BADGES[o.status] || STATUS_BADGES.PENDING;
                            return (
                              <tr
                                key={o.id}
                                onClick={(e) => {
                                  if (
                                    (e.target as HTMLElement).closest("button")
                                  )
                                    return;
                                  setSelectedId(o.id);
                                }}
                                className="hover:bg-gray-50/50 transition cursor-pointer"
                              >
                                <td className="py-3 px-2 font-semibold">
                                  #{o.id?.slice(0, 8)}
                                </td>
                                <td className="py-3 px-2 text-gray-500 hidden sm:table-cell">
                                  {o.deliveryAddress || "—"}
                                </td>
                                <td className="py-3 px-2 font-bold text-[#ff6b35]">
                                  {toNum(o.totalAmount).toLocaleString("vi-VN")}
                                  ₫
                                </td>
                                <td className="py-3 px-2">
                                  <span
                                    className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${badge.cls}`}
                                  >
                                    {badge.label}
                                  </span>
                                </td>
                                <td className="py-3 px-2 text-right">
                                  {o.status === "PENDING" ? (
                                    <button
                                      onClick={async () => {
                                        try {
                                          await orderApi.confirm(o.id);
                                          setOrders(
                                            orders.map((x) =>
                                              x.id === o.id
                                                ? { ...x, status: "CONFIRMED" }
                                                : x,
                                            ),
                                          );
                                        } catch {}
                                      }}
                                      className="bg-[#ff6b35] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-orange-600 transition font-medium"
                                    >
                                      Xác nhận
                                    </button>
                                  ) : o.status === "CONFIRMED" ? (
                                    <button
                                      onClick={async () => {
                                        try {
                                          await orderApi.preparing(o.id);
                                          setOrders(
                                            orders.map((x) =>
                                              x.id === o.id
                                                ? { ...x, status: "PREPARING" }
                                                : x,
                                            ),
                                          );
                                        } catch {}
                                      }}
                                      className="bg-[#1976d2] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-blue-700 transition font-medium"
                                    >
                                      Chuẩn bị
                                    </button>
                                  ) : o.status === "PREPARING" ? (
                                    <button
                                      onClick={async () => {
                                        try {
                                          await orderApi.ready(o.id);
                                          setOrders(
                                            orders.map((x) =>
                                              x.id === o.id
                                                ? {
                                                    ...x,
                                                    status: "READY_FOR_PICKUP",
                                                  }
                                                : x,
                                            ),
                                          );
                                        } catch {}
                                      }}
                                      className="bg-[#2ecc71] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-green-600 transition font-medium"
                                    >
                                      Sẵn sàng
                                    </button>
                                  ) : o.status === "READY_FOR_PICKUP" ||
                                    o.status === "OUT_FOR_DELIVERY" ? (
                                    <span className="text-xs text-gray-400">
                                      Đang chờ tài xế
                                    </span>
                                  ) : (
                                    <span className="text-xs text-gray-400">
                                      Đã hoàn thành
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Menu Grid */}
              <div>
                <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-[#1a1a2e]">
                      📋 Thực đơn
                    </h3>
                    <Link
                      href="/menu"
                      className="text-sm font-semibold text-[#ff6b35] hover:underline"
                    >
                      Quản lý →
                    </Link>
                  </div>
                  {menuItems.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-3xl mb-2">📋</p>
                      <p className="text-gray-400 text-sm">Chưa có món nào</p>
                      <Link
                        href="/menu"
                        className="text-[#ff6b35] text-sm font-semibold hover:underline mt-2 inline-block"
                      >
                        + Thêm món mới
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {menuItems.slice(0, 6).map((item: any, idx: number) => (
                        <div
                          key={item.id}
                          className="bg-gray-50 rounded-xl p-3 text-center border border-transparent hover:border-[#ff6b35] transition cursor-pointer animate-fade-in-up"
                          style={{ animationDelay: `${idx * 0.05}s` }}
                        >
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="h-20 w-full object-cover rounded-lg mb-2"
                            />
                          ) : (
                            <div
                              className={`h-20 bg-gradient-to-br ${GRADIENT_BG[idx % GRADIENT_BG.length]} rounded-lg mb-2`}
                            />
                          )}
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {item.name}
                          </p>
                          <p className="text-sm font-bold text-[#ff6b35] mt-0.5">
                            {item.price?.toLocaleString("vi-VN")}₫
                          </p>
                          <p
                            className={`text-xs mt-1 font-semibold ${item.available !== false ? "text-[#2ecc71]" : "text-[#e74c3c]"}`}
                          >
                            {item.available !== false
                              ? "🟢 Đang bán"
                              : "🔴 Tạm ngừng"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════ ORDERS TAB ═══════════ */}
          {activeTab === "orders" && (
            <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6">
              <h3 className="text-lg font-bold text-[#1a1a2e] mb-5">
                📦 Tất cả đơn hàng
              </h3>
              {orders.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-4xl mb-3">📦</p>
                  <p className="text-gray-400">Chưa có đơn hàng nào</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left">
                        <th className="pb-3 font-semibold text-gray-400 text-xs uppercase tracking-wider px-2">
                          Mã đơn
                        </th>
                        <th className="pb-3 font-semibold text-gray-400 text-xs uppercase tracking-wider px-2 hidden sm:table-cell">
                          Địa chỉ
                        </th>
                        <th className="pb-3 font-semibold text-gray-400 text-xs uppercase tracking-wider px-2">
                          Tổng tiền
                        </th>
                        <th className="pb-3 font-semibold text-gray-400 text-xs uppercase tracking-wider px-2">
                          Trạng thái
                        </th>
                        <th className="pb-3 font-semibold text-gray-400 text-xs uppercase tracking-wider px-2 text-right">
                          Thao tác
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {orders.map((o: any) => {
                        const badge =
                          STATUS_BADGES[o.status] || STATUS_BADGES.PENDING;
                        return (
                          <tr
                            key={o.id}
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest("button"))
                                return;
                              setSelectedId(o.id);
                            }}
                            className="hover:bg-gray-50/50 transition cursor-pointer"
                          >
                            <td className="py-3 px-2 font-semibold">
                              #{o.id?.slice(0, 8)}
                            </td>
                            <td className="py-3 px-2 text-gray-500 hidden sm:table-cell max-w-[150px] truncate">
                              {o.deliveryAddress || "—"}
                            </td>
                            <td className="py-3 px-2 font-bold text-[#ff6b35]">
                              {toNum(o.totalAmount).toLocaleString("vi-VN")}₫
                            </td>
                            <td className="py-3 px-2">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${badge.cls}`}
                              >
                                {badge.label}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right">
                              {o.status === "PENDING" ? (
                                <button
                                  onClick={async () => {
                                    try {
                                      await orderApi.confirm(o.id);
                                      setOrders(
                                        orders.map((x) =>
                                          x.id === o.id
                                            ? { ...x, status: "CONFIRMED" }
                                            : x,
                                        ),
                                      );
                                    } catch {}
                                  }}
                                  className="bg-[#ff6b35] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-orange-600 transition font-medium"
                                >
                                  Xác nhận
                                </button>
                              ) : o.status === "CONFIRMED" ? (
                                <button
                                  onClick={async () => {
                                    try {
                                      await orderApi.preparing(o.id);
                                      setOrders(
                                        orders.map((x) =>
                                          x.id === o.id
                                            ? { ...x, status: "PREPARING" }
                                            : x,
                                        ),
                                      );
                                    } catch {}
                                  }}
                                  className="bg-[#1976d2] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-blue-700 transition font-medium"
                                >
                                  Chuẩn bị
                                </button>
                              ) : o.status === "PREPARING" ? (
                                <button
                                  onClick={async () => {
                                    try {
                                      await orderApi.ready(o.id);
                                      setOrders(
                                        orders.map((x) =>
                                          x.id === o.id
                                            ? {
                                                ...x,
                                                status: "READY_FOR_PICKUP",
                                              }
                                            : x,
                                        ),
                                      );
                                    } catch {}
                                  }}
                                  className="bg-[#2ecc71] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-green-600 transition font-medium"
                                >
                                  Sẵn sàng
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <OrderDetailDrawer
        orderId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
