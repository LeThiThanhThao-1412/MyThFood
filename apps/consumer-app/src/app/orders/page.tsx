'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { orderApi } from '@mythfood/api-client';
import { useAuthStore } from '@mythfood/frontend-shared';

const STATUS_LABELS: Record<string, { icon: string; label: string; cls: string }> = {
  PENDING: { icon: '⏳', label: 'Chờ xác nhận', cls: 'bg-yellow-100 text-yellow-700' },
  CONFIRMED: { icon: '✅', label: 'Đã xác nhận', cls: 'bg-blue-100 text-blue-700' },
  PREPARING: { icon: '👨‍🍳', label: 'Đang chuẩn bị', cls: 'bg-blue-100 text-blue-700' },
  READY_FOR_PICKUP: { icon: '📦', label: 'Sẵn sàng', cls: 'bg-green-100 text-green-700' },
  OUT_FOR_DELIVERY: { icon: '🛵', label: 'Đang giao', cls: 'bg-purple-100 text-purple-700' },
  DELIVERED: { icon: '🏠', label: 'Đã giao', cls: 'bg-green-100 text-green-700' },
  CANCELLED: { icon: '❌', label: 'Đã hủy', cls: 'bg-gray-100 text-gray-500' },
  REJECTED: { icon: '🚫', label: 'Từ chối', cls: 'bg-red-100 text-red-700' },
};

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

export default function OrdersPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    async function load() {
      try {
        const res = await orderApi.list({ take: 50 });
        const items = (res as any).items || res || [];
        setOrders(Array.isArray(items) ? items : []);
      } catch {} finally { setLoading(false); }
    }
    load();
  }, [isAuthenticated, router]);

  const filtered = filter === 'ALL' ? orders : orders.filter(o => {
    if (filter === 'ACTIVE') return !['DELIVERED', 'CANCELLED', 'REJECTED'].includes(o.status);
    return o.status === filter;
  });

  return (
    <div className="min-h-screen bg-[#f0f2f5] max-w-[420px] mx-auto relative pb-24">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="px-4 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="text-gray-400 hover:text-[#ff6b35] text-lg transition">←</Link>
          <h1 className="text-lg font-bold text-[#1a1a2e]">📦 Đơn hàng</h1>
          <div className="w-6" />
        </div>
      </header>

      <main className="px-4 py-6">
        {/* Filter tabs */}
        <div className="flex gap-2 mb-5 overflow-x-auto hide-scrollbar pb-1">
          {[
            { key: 'ALL', label: 'Tất cả' },
            { key: 'ACTIVE', label: 'Đang xử lý' },
            { key: 'DELIVERED', label: 'Đã giao' },
            { key: 'CANCELLED', label: 'Đã hủy' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap transition ${
                filter === f.key ? 'bg-[#ff6b35] text-white shadow-md' : 'bg-white text-gray-500 border border-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl shadow-sm p-5 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
                <div className="h-3 bg-gray-200 rounded w-1/2 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-3/4" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow-sm">
            <p className="text-5xl mb-3">📦</p>
            <p className="text-gray-400 text-base font-medium">Chưa có đơn hàng nào</p>
            <Link href="/restaurants" className="mt-4 inline-block bg-[#ff6b35] text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-orange-600 transition">
              Đặt món ngay →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((o: any) => {
              const s = STATUS_LABELS[o.status] || STATUS_LABELS.PENDING;
              return (
                <div
                  key={o.id}
                  onClick={() => router.push(`/orders/${o.id}`)}
                  className="bg-white rounded-2xl shadow-sm p-4 hover:shadow-md transition cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-800">#{o.id?.slice(0, 8)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.icon} {s.label}</span>
                    </div>
                    <span className="text-[#ff6b35] font-bold">{toNum(o.totalAmount).toLocaleString('vi-VN')}₫</span>
                  </div>
                  <div className="text-sm text-gray-500 line-clamp-2">
                    🛒 {o.items?.map((i: any) => `${i.quantity}x ${i.name}`).join(', ')}
                  </div>
                  {o.deliveryAddress && (
                    <div className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                      <span>📍</span>
                      <span className="truncate">{o.deliveryAddress}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        <Link href="/dashboard" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">🏠</span><span>Trang chủ</span></Link>
        <Link href="/restaurants" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">🔍</span><span>Tìm kiếm</span></Link>
        <Link href="/cart" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">🛒</span><span>Giỏ hàng</span></Link>
        <Link href="/orders" className="flex flex-col items-center text-[10px] text-[#ff6b35] no-underline"><span className="text-[22px]">📦</span><span>Đơn hàng</span></Link>
        <Link href="/dashboard" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">👤</span><span>Tài khoản</span></Link>
      </nav>
    </div>
  );
}