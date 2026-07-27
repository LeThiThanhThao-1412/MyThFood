'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { driverApi, orderApi } from '@mythfood/api-client';
import { useAuthStore } from '@mythfood/frontend-shared';

// ─── Helpers ────────────────────────────────────────────────
function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
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

  // Stats (computed from real data)
  const todayEarnings = activeOrders
    .filter(o => o.status === 'DELIVERED')
    .reduce((sum, o) => sum + Math.round(toNum(o.deliveryFee || 15000) * 0.75), 0);
  const weekEarnings = activeOrders
    .filter(o => o.status === 'DELIVERED')
    .reduce((sum, o) => sum + Math.round(toNum(o.deliveryFee || 15000) * 0.75), 0);
  const completedOrders = activeOrders.filter(o => o.status === 'DELIVERED').length;

  // Load driver data
  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    let interval: any;
    async function load() {
      try {
        const dRes = await driverApi.getByUserId(user?.id || '');
        const d = (dRes as any).data ?? dRes;
        setDriver(d);
        if (d && d.status === 'ACTIVE') {
          const [availRes, activeRes] = await Promise.all([
            orderApi.list({ status: 'READY_FOR_PICKUP', take: 20 }),
            orderApi.listByDriver(d.id),
          ]);
          const availItems = (availRes as any).items || [];
          setAvailableOrders(Array.isArray(availItems) ? availItems : []);
          // activeRes may return all orders assigned to this driver (including DELIVERED)
          const allDriverOrders = Array.isArray(activeRes) ? activeRes : [];
          setActiveOrders(allDriverOrders);
        }
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    }
    load();
    interval = setInterval(load, 10000);
    return () => { if (interval) clearInterval(interval); };
  }, [isAuthenticated, user, router]);

  // ─── Actions ──────────────────────────────────────────────
  async function toggleOnline() {
    if (!driver) return;
    try {
      const isOnline = driver.onlineStatus === 'ONLINE';
      const res = isOnline
        ? await driverApi.goOffline(driver.id)
        : await driverApi.goOnline(driver.id);
      setDriver((res as any).data ?? res);
    } catch { /* ignore */ }
  }

  async function acceptOrder(orderId: string) {
    if (!driver) return;
    try {
      await orderApi.outForDelivery(orderId, { driverId: driver.id });
      setAvailableOrders(availableOrders.filter(o => o.id !== orderId));
      router.push(`/delivery/${orderId}`);
    } catch { /* ignore */ }
  }

  async function declineOrder(orderId: string) {
    setAvailableOrders(availableOrders.filter(o => o.id !== orderId));
  }

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
          <p className="text-xl font-bold text-[#1a1a2e] mb-2">Bạn chưa đăng ký tài xế</p>
          <p className="text-gray-500 text-sm mb-6">Đăng ký để bắt đầu nhận đơn và kiếm tiền</p>
          <Link href="/register" className="bg-[#ff6b35] text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-orange-600 transition">
            Đăng ký ngay
          </Link>
        </div>
      </div>
    );
  }

  // ─── Inactive / Pending approval ──────────────────────────
  if (driver.status === 'INACTIVE') {
    return (
      <div className="min-h-screen bg-[#f0f2f5]">
        <header className="bg-[#1a1a2e] px-4 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="text-xl font-extrabold text-white">MyTh<span className="text-[#ff6b35]">Food</span></div>
            <button onClick={() => { clearAuth(); router.push('/'); }} className="text-sm text-gray-400 hover:text-red-500 transition">Đăng xuất</button>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-16">
          <div className="bg-white rounded-2xl shadow-sm p-8 sm:p-10 text-center">
            <div className="text-6xl mb-6">⏳</div>
            <h2 className="text-2xl font-bold text-[#e67e22] mb-3">Đang chờ duyệt</h2>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 mb-6">
              <p className="text-orange-800 font-medium mb-2">Hồ sơ của bạn đang chờ Admin duyệt</p>
              <p className="text-orange-700 text-sm">Admin sẽ duyệt hồ sơ trong 24-48h. Bạn sẽ nhận thông báo khi tài khoản được kích hoạt.</p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm text-gray-500 mb-6">
              <div className="bg-gray-50 rounded-xl p-3"><p className="font-medium text-gray-700">Tên</p><p>{driver.fullName}</p></div>
              <div className="bg-gray-50 rounded-xl p-3"><p className="font-medium text-gray-700">Loại xe</p><p>{driver.vehicleType}</p></div>
              <div className="bg-gray-50 rounded-xl p-3"><p className="font-medium text-gray-700">Biển số</p><p>{driver.vehicleRegistrationNumber}</p></div>
              <div className="bg-gray-50 rounded-xl p-3"><p className="font-medium text-gray-700">SĐT</p><p>{driver.phoneNumber}</p></div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const isOnline = driver.onlineStatus === 'ONLINE';

  // ═══════════════ ACTIVE DASHBOARD ═══════════════════════════
  return (
    <div className="min-h-screen bg-[#f0f2f5] max-w-[1400px] mx-auto pb-20 lg:pb-0 w-full">
      {/* ≡≡≡≡≡ HEADER ≡≡≡≡≡ */}
      <header className="bg-[#1a1a2e] px-4 sm:px-6 py-4 text-white w-full">
        <div className="max-w-5xl mx-auto w-full">
          <div className="flex items-center justify-between">
            <div className="text-xl sm:text-2xl font-extrabold">
              MyTh<span className="text-[#ff6b35]">Food</span>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/location" className="text-xl hover:scale-110 transition-transform" title="Cập nhật vị trí">📍</Link>
              <button className="text-xl">💬</button>
              <button className="text-xl">🔔</button>
              <button onClick={() => { clearAuth(); router.push('/'); }} className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition">
                Đăng xuất
              </button>
            </div>
          </div>

          {/* Driver status card */}
          <div className="mt-3 flex items-center gap-4 bg-white/8 rounded-2xl p-3 sm:p-4">
            <div className="w-11 h-11 bg-[#ff6b35] rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0">
              {(driver.fullName || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm sm:text-base truncate">{driver.fullName}</p>
              <p className={`text-xs font-medium ${isOnline ? 'text-[#2ecc71]' : 'text-gray-400'}`}>
                {isOnline ? '🟢 Đang online' : '⚫ Đang offline'}
              </p>
            </div>
            <button
              onClick={toggleOnline}
              className={`px-4 sm:px-6 py-2 rounded-full text-sm font-bold transition-all ${
                isOnline
                  ? 'bg-[#e74c3c] hover:bg-red-600 text-white'
                  : 'bg-[#2ecc71] hover:bg-green-600 text-white'
              }`}
            >
              {isOnline ? 'Offline' : 'Online'}
            </button>
          </div>
        </div>
      </header>

      {/* ≡≡≡≡≡ MAIN ≡≡≡≡≡ */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 w-full">
        {/* ─── QUICK ACTIONS ─── */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3 mb-6">
          {[
            { icon: '💰', label: 'Ví', href: '/wallet', color: 'from-green-500 to-emerald-600' },
            { icon: '🗺️', label: 'Bản đồ', href: '/location', color: 'from-blue-500 to-cyan-600' },
            { icon: '📊', label: 'Thu nhập', href: '/earnings', color: 'from-purple-500 to-pink-600' },
            { icon: '📦', label: 'Đơn hàng', href: '/orders', color: 'from-orange-500 to-red-500' },
          ].map(a => (
            <Link key={a.href} href={a.href} className={`bg-gradient-to-br ${a.color} rounded-2xl p-4 text-center text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all`}>
              <span className="text-2xl block mb-1">{a.icon}</span>
              <span className="text-xs font-semibold">{a.label}</span>
            </Link>
          ))}
        </div>

        {/* ─── EARNINGS ─── */}
        <div className="bg-white rounded-2xl shadow-sm p-5 grid grid-cols-3 gap-4 text-center mb-6">
          {[
            { label: 'Hôm nay', value: `${(todayEarnings / 1000).toFixed(0)}.000đ`, color: 'text-[#ff6b35]' },
            { label: 'Tuần này', value: `${(weekEarnings / 1_000_000).toFixed(1)}trđ`, color: 'text-[#1a1a2e]' },
            { label: 'Đơn hoàn thành', value: completedOrders.toLocaleString('vi-VN'), color: 'text-[#2ecc71]' },
          ].map((s, i) => (
            <div key={i}>
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className={`text-lg sm:text-xl font-extrabold mt-0.5 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* ─── LOCATION STATUS ─── */}
        <Link href="/location" className="block bg-gradient-to-br from-[#1a1a2e] to-[#2d2d44] rounded-2xl p-6 text-white text-center mb-6 relative overflow-hidden hover:shadow-lg transition-shadow cursor-pointer">
          <div className="absolute top-3 right-4 bg-white/15 px-3 py-1 rounded-full text-xs font-semibold">
            {isOnline ? '🟢 Đang hoạt động' : '⚫ Offline'}
          </div>
          <div className="text-4xl mb-2">📍</div>
          <p className="font-semibold text-lg">
            {isOnline ? (activeOrders.length > 0 ? 'Đang trên đường giao hàng' : 'Đang chờ đơn hàng mới') : 'Hãy bật Online để nhận đơn'}
          </p>
          <p className="text-sm text-white/50 mt-1">
            {isOnline ? `${availableOrders.length} đơn đang chờ gần bạn` : 'Nhấn nút Online để bắt đầu'}
          </p>
          <div className="mt-3 text-xs text-white/30">👆 Nhấn để cập nhật vị trí của bạn</div>
        </Link>

        {/* ─── ACTIVE DELIVERIES ─── */}
        {activeOrders.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-[#1a1a2e] mb-3">🚚 Đơn đang giao ({activeOrders.length})</h2>
            <div className="space-y-3">
              {activeOrders.map((o: any) => (
                <div key={o.id} className="bg-white rounded-2xl shadow-sm p-4 border-l-4 border-[#ff6b35]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-800">#{o.id?.slice(0, 8)}</span>
                    <span className="text-xs bg-[#fce4ec] text-[#c62828] px-2.5 py-0.5 rounded-full font-semibold">🚚 Đang giao</span>
                  </div>
                  <div className="text-sm text-gray-500 space-y-1">
                    <p>📍 Giao đến: {o.deliveryAddress}</p>
                    <p className="font-bold text-[#ff6b35]">💰 {toNum(o.totalAmount).toLocaleString('vi-VN')}₫</p>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={async () => {
                        try { await orderApi.delivered(o.id); setActiveOrders(activeOrders.filter(x => x.id !== o.id)); } catch {}
                      }}
                      className="flex-1 bg-[#2ecc71] text-white py-2 rounded-xl text-sm font-semibold hover:bg-green-600 transition"
                    >
                      ✅ Đã giao
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── AVAILABLE ORDERS ─── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-[#1a1a2e]">📦 Đơn hàng gần bạn ({availableOrders.length})</h2>
            {availableOrders.length > 0 && (
              <Link href="/orders" className="text-sm font-semibold text-[#ff6b35] hover:underline">Xem tất cả →</Link>
            )}
          </div>

          {!isOnline ? (
            <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
              <p className="text-3xl mb-2">🔒</p>
              <p className="text-gray-400 text-sm">Bật Online để xem đơn hàng gần bạn</p>
            </div>
          ) : availableOrders.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
              <p className="text-3xl mb-2">📦</p>
              <p className="text-gray-400 text-sm">Chưa có đơn hàng nào sẵn sàng gần bạn</p>
              <p className="text-xs text-gray-400 mt-1">Hãy đợi thêm đơn mới...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {availableOrders.map((o: any) => (
                <div key={o.id} className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="font-semibold text-gray-800">#{o.id?.slice(0, 8)}</span>
                      <span className="text-xs bg-[#e8f5e9] text-[#2e7d32] px-2.5 py-0.5 rounded-full font-semibold ml-2">📦 Sẵn sàng</span>
                    </div>
                    <span className="text-[#ff6b35] font-bold text-lg shrink-0 ml-3">{toNum(o.totalAmount).toLocaleString('vi-VN')}₫</span>
                  </div>
                  <div className="text-sm text-gray-500 space-y-1.5 mb-3">
                    <p className="flex items-center gap-1"><span>📍</span> <span className="truncate">Giao đến: {o.deliveryAddress}</span></p>
                    {o.items && (
                      <p className="flex items-center gap-1"><span>🛒</span> {o.items.slice(0, 3).map((i: any) => `${i.quantity}x ${i.name}`).join(', ')}{o.items.length > 3 ? '...' : ''}</p>
                    )}
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

      {/* ≡≡≡≡≡ MOBILE BOTTOM NAV ≡≡≡≡≡ */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        <Link href="/dashboard" className="flex flex-col items-center text-[10px] text-[#ff6b35] no-underline">
          <span className="text-[22px]">🏠</span><span>Trang chủ</span>
        </Link>
        <Link href="/orders" className="flex flex-col items-center text-[10px] text-gray-400 no-underline">
          <span className="text-[22px]">📦</span><span>Đơn hàng</span>
        </Link>
        <Link href="/map" className="flex flex-col items-center text-[10px] text-gray-400 no-underline">
          <span className="text-[22px]">🗺️</span><span>Bản đồ</span>
        </Link>
        <Link href="/earnings" className="flex flex-col items-center text-[10px] text-gray-400 no-underline">
          <span className="text-[22px]">💰</span><span>Thu nhập</span>
        </Link>
        <button onClick={() => { clearAuth(); router.push('/'); }} className="flex flex-col items-center text-[10px] text-gray-400 bg-transparent border-none font-sans cursor-pointer">
          <span className="text-[22px]">👤</span><span>Tài khoản</span>
        </button>
      </nav>
    </div>
  );
}