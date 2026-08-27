"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { merchantApi, orderApi } from "@mythfood/api-client";
import {
  useAuthStore,
  useCartStore,
  useLocationStore,
  LocationGate,
  canAccessApp,
  haversineKm,
  NotificationBell,
} from "@mythfood/frontend-shared";
import { calculateShippingFeeSync } from "@/app/checkout/shipping-utils";
import CartDrawer from "@/components/CartDrawer";
import OrderDetailDrawer from "@/components/OrderDetailDrawer";
import RecentOrdersDrawer from "@/components/RecentOrdersDrawer";

const categories = [
  { key: "main", icon: "🍜", label: "Món chính" },
  { key: "drink", icon: "🥤", label: "Đồ uống" },
  { key: "dessert", icon: "🍰", label: "Tráng miệng" },
  { key: "side", icon: "🥗", label: "Món ăn kèm" },
  { key: "combo", icon: "🍱", label: "Combo" },
  { key: "special", icon: "🌶️", label: "Đặc sắc" },
];

const gradientPalette = [
  "from-[#f093fb] to-[#f5576c]",
  "from-[#43e97b] to-[#38f9d7]",
  "from-[#fa709a] to-[#fee140]",
  "from-[#a18cd1] to-[#fbc2eb]",
  "from-[#ff6b35] to-[#ff8f65]",
  "from-[#fbc2eb] to-[#a6c1ee]",
];

const statusLabels: Record<string, string> = {
  PENDING: "⏳ Chờ xác nhận",
  CONFIRMED: "✅ Đã xác nhận",
  PREPARING: "👨‍🍳 Đang chuẩn bị",
  READY_FOR_PICKUP: "📦 Sẵn sàng",
  OUT_FOR_DELIVERY: "🛵 Đang giao",
  DELIVERED: "🏠 Đã giao",
  CANCELLED: "❌ Đã hủy",
  REJECTED: "🚫 Từ chối",
};

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const { items: cartItems, getSubtotal } = useCartStore();
  const cartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);
  const cartTotal = getSubtotal();
  const { location, hasLocation } = useLocationStore();

  const [merchants, setMerchants] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCartPreview, setShowCartPreview] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [recentOrdersOpen, setRecentOrdersOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/");
      return;
    }
    if (!canAccessApp(user?.roles, "CONSUMER")) {
      clearAuth();
      router.replace("/login");
      return;
    }
  }, [isAuthenticated, user, clearAuth, router]);

  useEffect(() => {
    async function load() {
      try {
        const res = await merchantApi.list({ take: 50 });
        const list = res.items || [];
        setMerchants(list.filter((m: any) => m.status === "APPROVED"));
        if (user) {
          try {
            const oRes = await orderApi.list({ take: 20 });
            setOrders(
              (oRes.items || []).filter((o: any) => o.consumerId === user.id),
            );
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  // Delivery fee from restaurant → customer's current location (distance-based)
  const feeFor = (m: any) => {
    if (hasLocation && location && m.latitude != null && m.longitude != null) {
      const km = haversineKm(
        location.latitude,
        location.longitude,
        Number(m.latitude),
        Number(m.longitude),
      );
      return calculateShippingFeeSync(km);
    }
    return 15000;
  };

  if (!isAuthenticated) return null;

  return (
    <>
      <LocationGate />
      <div className="min-h-screen bg-[#f0f2f5]">
        {/* ===== TOP NAVBAR ===== */}
        <header className="bg-white shadow-sm sticky top-0 z-50">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16 gap-4">
              {/* Logo */}
              <Link
                href="/dashboard"
                className="text-2xl font-extrabold text-[#ff6b35] shrink-0"
              >
                MyTh<span className="text-[#1a1a2e]">Food</span>
              </Link>

              {/* Search - hidden on small screens */}
              <Link
                href="/restaurants"
                className="hidden md:flex flex-1 max-w-md items-center gap-2.5 bg-[#f5f5f5] rounded-xl px-4 py-2.5 text-sm text-gray-400 hover:bg-gray-100 transition"
              >
                <span className="text-lg text-[#ff6b35]">🔍</span>
                <span>Tìm món, nhà hàng...</span>
              </Link>

              {/* Right side */}
              <div className="flex items-center gap-3 sm:gap-4">
                {/* Orders + Cart (drawer triggers) */}
                <button
                  onClick={() => setRecentOrdersOpen(true)}
                  className="relative text-xl hover:scale-110 transition-transform"
                  title="Đơn hàng gần đây"
                >
                  📋
                </button>
                <button
                  onClick={() => setCartOpen(true)}
                  className="relative text-xl hover:scale-110 transition-transform"
                >
                  🛒
                  {cartCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-[#ff6b35] text-white text-[10px] font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center">
                      {cartCount}
                    </span>
                  )}
                </button>

                {/* Notifications */}
                <div className="hidden sm:block">
                  <NotificationBell userId={user?.id} />
                </div>

                {/* User menu */}
                <div className="flex items-center gap-2 sm:gap-3">
                  <Link
                    href="/profile"
                    className="w-9 h-9 bg-[#ff6b35] rounded-full flex items-center justify-center text-white font-bold text-sm hover:scale-105 transition-transform"
                  >
                    {user?.fullName?.charAt(0)?.toUpperCase() || "?"}
                  </Link>
                  <div className="hidden sm:block">
                    <Link
                      href="/profile"
                      className="text-sm font-semibold text-gray-800 leading-tight hover:text-[#ff6b35] transition block"
                    >
                      {user?.fullName || "Người dùng"}
                    </Link>
                    <button
                      onClick={() => {
                        clearAuth();
                        router.push("/");
                      }}
                      className="text-xs text-gray-400 hover:text-red-500 transition"
                    >
                      Đăng xuất
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ===== MAIN CONTENT ===== */}
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* ===== WELCOME & BANNER ===== */}
          <div className="mb-6">
            {/* Welcome Card */}
            <div className="bg-gradient-to-br from-[#ff6b35] to-[#ff8f65] rounded-2xl p-6 sm:p-8 text-white shadow-lg shadow-orange-200">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <p className="text-white/80 text-sm mb-1">👋 Xin chào,</p>
                  <h1 className="text-2xl sm:text-3xl font-bold">
                    {user?.fullName}!
                  </h1>
                  <p className="text-white/70 text-sm mt-2">
                    Khám phá nhà hàng và đặt món yêu thích ngay hôm nay
                  </p>
                  <p className="text-white/90 text-xs mt-2">
                    {hasLocation && location ? (
                      <>
                        📍 {location.address || "Vị trí hiện tại"}{" "}
                        <span className="font-mono text-white/60">
                          ({Number(location.latitude).toFixed(6)},{" "}
                          {Number(location.longitude).toFixed(6)})
                        </span>
                      </>
                    ) : (
                      "📍 Đang lấy vị trí của bạn..."
                    )}
                  </p>
                  <Link
                    href="/restaurants"
                    className="inline-block mt-4 bg-white text-[#ff6b35] px-6 py-2.5 rounded-full font-semibold text-sm hover:bg-gray-100 transition shadow-md"
                  >
                    🍽️ Đặt món ngay
                  </Link>
                </div>
                <div className="text-6xl sm:text-7xl">🍜</div>
              </div>
            </div>
          </div>

          {/* ===== CATEGORIES ===== */}
          <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#1a1a2e]">🍽️ Danh mục</h2>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {categories.map((cat) => (
                <div
                  key={cat.key}
                  onClick={() => router.push("/restaurants")}
                  className="bg-[#fafafa] rounded-2xl p-4 text-center cursor-pointer hover:bg-[#fff7ed] hover:-translate-y-0.5 transition-all border border-gray-100"
                >
                  <div className="text-2xl sm:text-3xl mb-2">{cat.icon}</div>
                  <div className="text-xs sm:text-sm font-semibold text-gray-700">
                    {cat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ===== MERCHANTS ===== */}
          <div className="grid gap-6">
            {/* Featured Merchants */}
            <div>
              <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-[#1a1a2e]">
                    ⭐ Nhà hàng gợi ý
                  </h2>
                  <Link
                    href="/restaurants"
                    className="text-sm font-semibold text-[#ff6b35] hover:underline"
                  >
                    Xem tất cả →
                  </Link>
                </div>

                {loading ? (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="bg-gray-100 rounded-2xl overflow-hidden animate-pulse"
                      >
                        <div className="h-[160px] bg-gray-200" />
                        <div className="p-4">
                          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
                          <div className="h-3 bg-gray-200 rounded w-3/4 mb-1" />
                          <div className="h-3 bg-gray-200 rounded w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : merchants.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-4xl mb-3">🍽️</p>
                    <p className="text-gray-400">Chưa có nhà hàng nào</p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {merchants.slice(0, 8).map((m, idx) => (
                      <div
                        key={m.id}
                        onClick={() => router.push(`/restaurants/${m.id}`)}
                        className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
                      >
                        <div
                          className={`h-[140px] sm:h-[160px] relative ${m.coverImageUrl ? "" : `bg-gradient-to-br ${gradientPalette[idx % gradientPalette.length]}`}`}
                          style={
                            m.coverImageUrl
                              ? {
                                  backgroundImage: `url(${m.coverImageUrl})`,
                                  backgroundSize: "cover",
                                  backgroundPosition: "center",
                                }
                              : undefined
                          }
                        >
                          <span className="absolute top-3 left-3 bg-black/70 text-white px-2.5 py-0.5 rounded-full text-[10px] font-semibold">
                            ⭐ {Number(m.rating || 0).toFixed(1)}
                          </span>
                          <span className="absolute bottom-3 right-3 bg-black/70 text-white px-2.5 py-1 rounded-full text-xs">
                            🕐 30-40 phút
                          </span>
                        </div>
                        <div className="p-4">
                          <div className="flex items-center gap-2 mb-1">
                            {m.logoUrl ? (
                              <img
                                src={m.logoUrl}
                                alt={m.name}
                                className="w-7 h-7 rounded-full object-cover shrink-0"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-[#ff6b35] text-white flex items-center justify-center text-xs font-bold shrink-0">
                                {(m.name || "?")[0]}
                              </div>
                            )}
                            <h3 className="font-bold text-gray-800 truncate">
                              {m.name}
                            </h3>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                            <span className="text-yellow-500">
                              ⭐ {Number(m.rating || 0).toFixed(1)}
                            </span>
                            <span className="text-gray-300">•</span>
                            <span>🚚 {feeFor(m).toLocaleString("vi-VN")}đ</span>
                            <span className="text-gray-300">•</span>
                            {m.isOpen === false ? (
                              <span className="text-red-500 font-semibold">
                                🔴 Tạm đóng
                              </span>
                            ) : m.isOpenNow === false ? (
                              <span className="text-gray-500 font-semibold">
                                🌙 Ngoài giờ
                              </span>
                            ) : (
                              <span className="text-green-500 font-semibold">
                                🟢 Đang mở cửa
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Drawers */}
        <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
        <RecentOrdersDrawer
          open={recentOrdersOpen}
          onClose={() => setRecentOrdersOpen(false)}
          orders={orders}
          onSelectOrder={(id) => setSelectedOrderId(id)}
        />
        <OrderDetailDrawer
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
        />

        {/* ===== MOBILE BOTTOM NAV ===== */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
          <Link
            href="/dashboard"
            className="flex flex-col items-center text-[10px] text-[#ff6b35] no-underline"
          >
            <span className="text-[22px]">🏠</span>
            <span>Trang chủ</span>
          </Link>
          <Link
            href="/restaurants"
            className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
          >
            <span className="text-[22px]">🔍</span>
            <span>Tìm kiếm</span>
          </Link>
          <button
            onClick={() => setCartOpen(true)}
            className="flex flex-col items-center text-[10px] text-gray-400 relative"
          >
            <span className="text-[22px]">🛒</span>
            <span>Giỏ hàng</span>
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-[#ff6b35] text-white text-[10px] font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setRecentOrdersOpen(true)}
            className="flex flex-col items-center text-[10px] text-gray-400"
          >
            <span className="text-[22px]">📦</span>
            <span>Đơn hàng</span>
          </button>
          <Link
            href="/profile"
            className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
          >
            <span className="text-[22px]">👤</span>
            <span>Tài khoản</span>
          </Link>
        </nav>

        {/* Spacer for bottom nav on mobile */}
        <div className="lg:hidden h-20" />
      </div>
    </>
  );
}
