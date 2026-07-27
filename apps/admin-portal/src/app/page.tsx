'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { merchantApi, orderApi, paymentApi, driverApi } from '@mythfood/api-client';
import { useAuthStore } from '@mythfood/frontend-shared';

// ─── Constants ───────────────────────────────────────────────
const GRADIENT_BARS = [
  'from-[#ff6b35] to-[#ff8f65]',
  'from-[#f093fb] to-[#f5576c]',
  'from-[#43e97b] to-[#38f9d7]',
  'from-[#fa709a] to-[#fee140]',
  'from-[#a18cd1] to-[#fbc2eb]',
  'from-[#fbc2eb] to-[#a6c1ee]',
  'from-[#fddb92] to-[#d1fdff]',
];

const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// ─── Helper: safely parse API amount to number ───────────────
function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return 'Vừa xong';
  if (diff < 60) return `${diff} phút trước`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}

function today(): string {
  const d = new Date();
  const days = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  return `${days[d.getDay()]}, ${d.getDate()} tháng ${d.getMonth() + 1}, ${d.getFullYear()}`;
}

function formatVnd(amount: number): string {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}tỷđ`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}trđ`;
  return `${amount.toLocaleString('vi-VN')}đ`;
}

// ═══════════════════════════════════════════════════════════════
export default function AdminDashboardPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();

  const [tab, setTab] = useState<'overview' | 'merchants' | 'drivers'>('overview');
  const [loading, setLoading] = useState(true);

  const [merchants, setMerchants] = useState<any[]>([]);
  const [mStats, setMStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });

  const [drivers, setDrivers] = useState<any[]>([]);
  const [dStats, setDStats] = useState({ total: 0, inactive: 0, active: 0, suspended: 0 });

  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [todayOrders, setTodayOrders] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [weeklyRevenue, setWeeklyRevenue] = useState<number[]>(new Array(7).fill(0));
  const [topMerchants, setTopMerchants] = useState<{ id: string; name: string; orders: number; revenue: number }[]>([]);
  const [recentActivity, setRecentActivity] = useState<{ icon: string; text: React.ReactNode; time: string }[]>([]);

  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    async function load() {
      try {
        const [mRes, dRes, oRes] = await Promise.all([
          merchantApi.list({ take: 500 }),
          driverApi.list({}),
          orderApi.list({ take: 1000 }),
        ]);

        // Merchants
        const mList = mRes.items || [];
        setMerchants(mList);
        setMStats({
          total: mList.length,
          pending: mList.filter((m: any) => m.status === 'PENDING').length,
          approved: mList.filter((m: any) => m.status === 'APPROVED').length,
          rejected: mList.filter((m: any) => m.status === 'REJECTED').length,
        });

        // Drivers
        const dRaw = (dRes as any).data || (dRes as any).items || [];
        const dList = Array.isArray(dRaw) ? dRaw : [];
        setDrivers(dList);
        setDStats({
          total: dList.length,
          inactive: dList.filter((d: any) => d.status === 'INACTIVE').length,
          active: dList.filter((d: any) => d.status === 'ACTIVE').length,
          suspended: dList.filter((d: any) => d.status === 'SUSPENDED').length,
        });

        // Unique users
        const userIds = new Set<string>();
        mList.forEach((m: any) => { if (m.userId) userIds.add(m.userId); });
        dList.forEach((d: any) => { if (d.userId) userIds.add(d.userId); });
        setTotalUsers(userIds.size || 0);

        // Orders
        const oList = (oRes as any).items || oRes || [];
        const orders: any[] = Array.isArray(oList) ? oList : [];
        setAllOrders(orders);

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const todayEnd = todayStart + 86400000;

        let revToday = 0;
        let countToday = 0;
        const weekRev = new Array(7).fill(0);
        const dayOfWeek = now.getDay();

        // ─── Aggregate order data ───
        const merchantRevenue: Record<string, { name: string; orders: number; revenue: number }> = {};
        const mMap = new Map<string, string>();
        mList.forEach((m: any) => mMap.set(m.id, m.name));

        for (const o of orders) {
          const createdAt = o.createdAt ? new Date(o.createdAt).getTime() : 0;
          const amount = toNum(o.totalAmount);

          if (createdAt >= todayStart && createdAt < todayEnd) {
            revToday += amount;
            countToday++;
          }

          const diffDays = Math.floor((now.getTime() - createdAt) / 86400000);
          if (diffDays >= 0 && diffDays < 7) {
            const idx = (dayOfWeek - diffDays + 7) % 7;
            weekRev[idx] += amount;
          }

          // Merchant aggregation
          const mid = o.merchantId;
          if (mid) {
            if (!merchantRevenue[mid]) {
              merchantRevenue[mid] = { name: mMap.get(mid) || mid.slice(0, 8), orders: 0, revenue: 0 };
            }
            merchantRevenue[mid].orders++;
            merchantRevenue[mid].revenue += amount;
          }
        }

        setTodayRevenue(revToday);
        setTodayOrders(countToday);
        setWeeklyRevenue(weekRev);

        // Top merchants
        const top = Object.entries(merchantRevenue)
          .sort(([, a], [, b]) => b.orders - a.orders)
          .slice(0, 5)
          .map(([id, data]) => ({ id, ...data }));
        setTopMerchants(top);

        // Recent activity
        const recentOrders = [...orders]
          .filter((o: any) => o.createdAt)
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 8);

        const statusIcons: Record<string, string> = {
          PENDING: '📦', CONFIRMED: '✅', PREPARING: '👨‍🍳', READY_FOR_PICKUP: '📦',
          OUT_FOR_DELIVERY: '🛵', DELIVERED: '🏠', CANCELLED: '❌', REJECTED: '🚫',
        };

        const activity = recentOrders.map((o: any) => {
          const mName = mMap.get(o.merchantId) || 'Nhà hàng';
          const icon = statusIcons[o.status] || '📋';
          const amountStr = toNum(o.totalAmount).toLocaleString('vi-VN');
          return {
            icon,
            text: (
              <>
                <span className="font-semibold">{mName}</span>{' '}
                {o.status === 'PENDING' && <>có đơn hàng mới <span className="font-semibold">#{o.id?.slice(0, 8)}</span></>}
                {o.status === 'CONFIRMED' && <>đã xác nhận đơn <span className="font-semibold">#{o.id?.slice(0, 8)}</span></>}
                {o.status === 'DELIVERED' && <>đã giao thành công đơn <span className="font-semibold">#{o.id?.slice(0, 8)}</span></>}
                {o.status === 'CANCELLED' && <>đã hủy đơn <span className="font-semibold">#{o.id?.slice(0, 8)}</span></>}
                {o.status === 'OUT_FOR_DELIVERY' && <>đang giao đơn <span className="font-semibold">#{o.id?.slice(0, 8)}</span></>}
                {' - '}
                <span className="font-semibold">{amountStr}₫</span>
              </>
            ),
            time: timeAgo(o.createdAt),
          };
        });

        setRecentActivity(activity.length > 0 ? activity : [
          { icon: '📋', text: <span className="text-gray-400">Chưa có hoạt động nào</span>, time: '' },
        ]);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    }
    load();
  }, [isAuthenticated, router]);

  // ─── Merchant actions ─────────────────────────────────────
  async function handleApproveMerchant(id: string) {
    try {
      await merchantApi.approve(id);
      setMerchants(merchants.map(m => m.id === id ? { ...m, status: 'APPROVED' } : m));
      setMStats(s => ({ ...s, pending: s.pending - 1, approved: s.approved + 1 }));
    } catch { /* ignore */ }
  }

  async function handleRejectMerchant(id: string) {
    try {
      await (merchantApi as any).reject(id);
      setMerchants(merchants.map(m => m.id === id ? { ...m, status: 'REJECTED' } : m));
      setMStats(s => ({ ...s, pending: s.pending - 1, rejected: s.rejected + 1 }));
    } catch { /* ignore */ }
  }

  // ─── Driver actions ───────────────────────────────────────
  const DRIVER_API_URL = 'http://localhost:3007/api/v1';

  async function handleActivateDriver(id: string) {
    setActionError('');
    try {
      await fetch(`${DRIVER_API_URL}/drivers/${id}/complete-training`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${useAuthStore.getState().token}` },
      });
      const res = await fetch(`${DRIVER_API_URL}/drivers/${id}/activate`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${useAuthStore.getState().token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setActionError((err as any).message || 'Kích hoạt thất bại');
        return;
      }
      setDrivers(drivers.map(d => d.id === id ? { ...d, status: 'ACTIVE' } : d));
      setDStats(s => ({ ...s, inactive: s.inactive - 1, active: s.active + 1 }));
    } catch (err: any) {
      setActionError(err.message || 'Kích hoạt thất bại');
    }
  }

  async function handleSuspendDriver(id: string) {
    setActionError('');
    try {
      const res = await fetch(`${DRIVER_API_URL}/drivers/${id}/suspend`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${useAuthStore.getState().token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setActionError((err as any).message || 'Khóa thất bại');
        return;
      }
      setDrivers(drivers.map(d => d.id === id ? { ...d, status: 'SUSPENDED' } : d));
      setDStats(s => ({ ...s, active: s.active - 1, suspended: s.suspended + 1 }));
    } catch (err: any) {
      setActionError(err.message || 'Khóa thất bại');
    }
  }

  if (!isAuthenticated) return null;

  const statusBadge = (status: string, _type: 'merchant' | 'driver') => {
    const map: Record<string, { cls: string; label: string }> = {
      APPROVED: { cls: 'bg-green-100 text-green-700', label: '✅ Đã duyệt' },
      PENDING: { cls: 'bg-yellow-100 text-yellow-700', label: '⏳ Chờ duyệt' },
      REJECTED: { cls: 'bg-red-100 text-red-700', label: '❌ Từ chối' },
      ACTIVE: { cls: 'bg-green-100 text-green-700', label: '✅ ACTIVE' },
      INACTIVE: { cls: 'bg-yellow-100 text-yellow-700', label: '⏳ INACTIVE' },
      SUSPENDED: { cls: 'bg-red-100 text-red-700', label: '🚫 SUSPENDED' },
    };
    return map[status] || { cls: 'bg-gray-100 text-gray-700', label: status };
  };

  const maxWeekly = Math.max(...weeklyRevenue, 1);

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      {/* TOP BAR */}
      <header className="bg-white rounded-2xl shadow-sm mx-4 mt-5 px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 max-w-[1400px] xl:mx-auto">
        <div className="text-2xl font-extrabold">
          MyTh<span className="text-[#ff6b35]">Food</span>{' '}
          <span className="text-[#1a1a2e]">Admin</span>
        </div>
        <div className="flex items-center gap-5 sm:gap-6 flex-wrap">
          <span className="text-sm text-gray-400 whitespace-nowrap">📅 {today()}</span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">👋 {user?.fullName || 'Admin'}</span>
            <div className="w-9 h-9 bg-[#ff6b35] rounded-full flex items-center justify-center text-white font-bold text-sm">
              {user?.fullName?.charAt(0)?.toUpperCase() || 'A'}
            </div>
          </div>
          <button onClick={() => { clearAuth(); router.push('/login'); }} className="text-xs text-gray-400 hover:text-red-500 transition bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg">Đăng xuất</button>
        </div>
      </header>

      <div className="max-w-[1400px] xl:mx-auto px-4 py-6">
        {/* Tab Nav */}
        <div className="flex gap-2 mb-6 bg-white rounded-2xl p-1.5 shadow-sm w-fit">
          {([
            { key: 'overview', icon: '📊', label: 'Tổng quan' },
            { key: 'merchants', icon: '🏪', label: `Nhà hàng (${mStats.total})` },
            { key: 'drivers', icon: '🛵', label: `Tài xế (${dStats.total})` },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === t.key ? 'bg-[#ff6b35] text-white shadow-md shadow-orange-200' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-white rounded-2xl shadow-sm p-5 animate-pulse">
                  <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
                  <div className="h-8 bg-gray-200 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-2/3" />
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-6 animate-pulse h-48" />
          </div>
        ) : (
          <>
            {/* OVERVIEW TAB */}
            {tab === 'overview' && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {[
                    { icon: '👥', label: 'Người dùng', value: totalUsers.toLocaleString('vi-VN'), sub: 'đã đăng ký', up: true },
                    { icon: '🏪', label: 'Nhà hàng', value: mStats.total.toString(), sub: `${mStats.approved} đang hoạt động`, up: true },
                    { icon: '📦', label: 'Đơn hàng hôm nay', value: todayOrders.toString(), sub: `${allOrders.length} tổng`, up: true },
                    { icon: '💰', label: 'Doanh thu hôm nay', value: formatVnd(todayRevenue), sub: 'từ các đơn hàng', up: todayRevenue > 0 },
                  ].map((s, i) => (
                    <div key={i} className="bg-white rounded-2xl shadow-sm p-5 relative overflow-hidden">
                      <span className="absolute top-3 right-4 text-3xl opacity-10">{s.icon}</span>
                      <p className="text-[13px] text-gray-400 font-medium">{s.label}</p>
                      <p className="text-[28px] font-extrabold mt-1 text-[#1a1a2e]">{s.value}</p>
                      <p className={`text-xs mt-1 font-medium ${s.up ? 'text-[#2ecc71]' : 'text-gray-400'}`}>{s.sub}</p>
                    </div>
                  ))}
                </div>

                <div className="grid lg:grid-cols-3 gap-4 mb-6">
                  <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm p-5 sm:p-6">
                    <h3 className="text-base font-bold mb-5">📊 Doanh thu 7 ngày qua</h3>
                    {maxWeekly === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-12">Chưa có dữ liệu doanh thu</p>
                    ) : (
                      <div className="flex items-end gap-2 h-[170px] pt-2">
                        {weeklyRevenue.map((val, i) => (
                          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                            <span className="text-[10px] font-semibold text-[#1a1a2e] mb-1">{val > 0 ? formatVnd(val) : ''}</span>
                            <div className={`w-full bg-gradient-to-t ${GRADIENT_BARS[i]} rounded-t-md transition-all duration-500`} style={{ height: `${Math.max(4, (val / maxWeekly) * 130)}px` }} />
                            <span className="text-[10px] text-gray-400 mt-1.5">{DAY_NAMES[i]}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6">
                    <h3 className="text-base font-bold mb-4">🏆 Nhà hàng bán chạy</h3>
                    <div className="divide-y divide-gray-50">
                      {topMerchants.length > 0 ? topMerchants.map((m, i) => (
                        <div key={m.id} className="flex items-center justify-between py-2.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-bold text-sm text-gray-400 w-6">#{i + 1}</span>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-gray-800 truncate">{m.name}</p>
                              <p className="text-xs text-gray-400">{m.orders} đơn</p>
                            </div>
                          </div>
                          <span className="font-bold text-sm text-[#ff6b35] whitespace-nowrap ml-2">{formatVnd(m.revenue)}</span>
                        </div>
                      )) : <p className="text-sm text-gray-400 text-center py-6">Chưa có dữ liệu</p>}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6">
                  <h3 className="text-base font-bold mb-4">🔄 Hoạt động gần đây</h3>
                  <div className="divide-y divide-gray-50">
                    {recentActivity.map((a, i) => (
                      <div key={i} className="flex items-start gap-3 py-2.5 text-sm">
                        <span className="text-lg w-7 text-center shrink-0">{a.icon}</span>
                        <span className="flex-1 text-gray-700">{a.text}</span>
                        <span className="text-xs text-gray-400 whitespace-nowrap">{a.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* MERCHANTS TAB */}
            {tab === 'merchants' && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {[
                    { label: 'Tổng', value: mStats.total, color: 'bg-[#3b82f6]' },
                    { label: 'Chờ duyệt', value: mStats.pending, color: 'bg-[#e67e22]' },
                    { label: 'Đã duyệt', value: mStats.approved, color: 'bg-[#2ecc71]' },
                    { label: 'Từ chối', value: mStats.rejected, color: 'bg-[#e74c3c]' },
                  ].map((s, i) => (
                    <div key={i} className={`${s.color} text-white rounded-2xl p-5 shadow-sm`}>
                      <p className="text-sm opacity-80">{s.label}</p>
                      <p className="text-3xl font-extrabold mt-1">{s.value}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50/80 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-4 sm:px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Tên nhà hàng</th>
                        <th className="text-left px-4 sm:px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Địa chỉ</th>
                        <th className="text-left px-4 sm:px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">SĐT</th>
                        <th className="text-left px-4 sm:px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Trạng thái</th>
                        <th className="text-right px-4 sm:px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {merchants.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-12 text-gray-400">Chưa có nhà hàng nào</td></tr>
                      ) : merchants.map((m: any) => (
                        <tr key={m.id} className="hover:bg-gray-50/50 transition">
                          <td className="px-4 sm:px-6 py-4"><p className="font-semibold text-gray-800">{m.name}</p><p className="text-xs text-gray-400">{m.email}</p></td>
                          <td className="px-4 sm:px-6 py-4 text-sm text-gray-500 hidden md:table-cell max-w-[200px] truncate">{m.address}</td>
                          <td className="px-4 sm:px-6 py-4 text-sm text-gray-500 hidden lg:table-cell">{m.phone}</td>
                          <td className="px-4 sm:px-6 py-4"><span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${statusBadge(m.status, 'merchant').cls}`}>{statusBadge(m.status, 'merchant').label}</span></td>
                          <td className="px-4 sm:px-6 py-4 text-right">
                            {m.status === 'PENDING' ? (
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => handleApproveMerchant(m.id)} className="bg-[#2ecc71] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-green-600 transition font-medium">Duyệt</button>
                                <button onClick={() => handleRejectMerchant(m.id)} className="bg-[#e74c3c] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-red-600 transition font-medium">Từ chối</button>
                              </div>
                            ) : <span className="text-xs text-gray-400">Đã xử lý</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* DRIVERS TAB */}
            {tab === 'drivers' && (
              <>
                {actionError && <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl text-sm mb-4 flex items-start gap-2"><span>⚠️</span><span>{actionError}</span></div>}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {[
                    { label: 'Tổng', value: dStats.total, color: 'bg-[#3b82f6]' },
                    { label: 'Chờ duyệt', value: dStats.inactive, color: 'bg-[#e67e22]' },
                    { label: 'Đã kích hoạt', value: dStats.active, color: 'bg-[#2ecc71]' },
                    { label: 'Bị khóa', value: dStats.suspended, color: 'bg-[#e74c3c]' },
                  ].map((s, i) => (
                    <div key={i} className={`${s.color} text-white rounded-2xl p-5 shadow-sm`}><p className="text-sm opacity-80">{s.label}</p><p className="text-3xl font-extrabold mt-1">{s.value}</p></div>
                  ))}
                </div>
                {drivers.length === 0 ? (
                  <div className="bg-white rounded-2xl shadow-sm p-12 text-center"><p className="text-4xl mb-3">🛵</p><p className="text-gray-400 text-lg">Chưa có tài xế nào đăng ký</p></div>
                ) : (
                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50/80 border-b border-gray-100">
                        <tr>
                          <th className="text-left px-4 sm:px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Tên tài xế</th>
                          <th className="text-left px-4 sm:px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">SĐT</th>
                          <th className="text-left px-4 sm:px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Loại xe</th>
                          <th className="text-left px-4 sm:px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Biển số</th>
                          <th className="text-left px-4 sm:px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Trạng thái</th>
                          <th className="text-right px-4 sm:px-6 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Hành động</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {drivers.map((d: any) => (
                          <tr key={d.id} className="hover:bg-gray-50/50 transition">
                            <td className="px-4 sm:px-6 py-4"><p className="font-semibold text-gray-800">{d.fullName}</p><p className="text-xs text-gray-400">{d.email}</p></td>
                            <td className="px-4 sm:px-6 py-4 text-sm text-gray-500 hidden md:table-cell">{d.phoneNumber}</td>
                            <td className="px-4 sm:px-6 py-4 text-sm text-gray-500 hidden lg:table-cell">{d.vehicleType}</td>
                            <td className="px-4 sm:px-6 py-4 text-sm text-gray-500 hidden lg:table-cell">{d.vehicleRegistrationNumber}</td>
                            <td className="px-4 sm:px-6 py-4"><span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${statusBadge(d.status, 'driver').cls}`}>{statusBadge(d.status, 'driver').label}</span></td>
                            <td className="px-4 sm:px-6 py-4 text-right">
                              <div className="flex gap-2 justify-end">
                                {d.status === 'INACTIVE' && <button onClick={() => handleActivateDriver(d.id)} className="bg-[#2ecc71] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-green-600 transition font-medium">Kích hoạt</button>}
                                {d.status === 'ACTIVE' && <button onClick={() => handleSuspendDriver(d.id)} className="bg-[#e74c3c] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-red-600 transition font-medium">Khóa</button>}
                                {d.status === 'SUSPENDED' && <span className="text-xs text-gray-400">Đã khóa</span>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}