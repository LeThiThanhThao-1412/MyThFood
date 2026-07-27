'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { orderApi } from '@mythfood/api-client';
import { useAuthStore } from '@mythfood/frontend-shared';

const STEPS = [
  { key: 'PENDING', icon: '📦', label: 'Chờ xác nhận' },
  { key: 'CONFIRMED', icon: '✅', label: 'Đã xác nhận' },
  { key: 'PREPARING', icon: '👨‍🍳', label: 'Đang chuẩn bị' },
  { key: 'READY_FOR_PICKUP', icon: '📦', label: 'Sẵn sàng' },
  { key: 'OUT_FOR_DELIVERY', icon: '🛵', label: 'Đang giao' },
  { key: 'DELIVERED', icon: '🏠', label: 'Đã giao' },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  CONFIRMED: 'bg-blue-50 border-blue-200 text-blue-700',
  PREPARING: 'bg-blue-50 border-blue-200 text-blue-700',
  READY_FOR_PICKUP: 'bg-green-50 border-green-200 text-green-700',
  OUT_FOR_DELIVERY: 'bg-purple-50 border-purple-200 text-purple-700',
  DELIVERED: 'bg-green-50 border-green-200 text-green-700',
  CANCELLED: 'bg-red-50 border-red-200 text-red-700',
  REJECTED: 'bg-red-50 border-red-200 text-red-700',
};

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    const poll = setInterval(async () => {
      try { const o = await orderApi.getById(id); setOrder(o); } catch {}
    }, 5000);
    (async () => { try { const o = await orderApi.getById(id); setOrder(o); } catch {} finally { setLoading(false); } })();
    return () => clearInterval(poll);
  }, [id, isAuthenticated, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5] px-4">
        <div className="text-center bg-white rounded-2xl shadow-sm p-8 max-w-md">
          <p className="text-5xl mb-4">🔍</p>
          <p className="text-xl font-bold text-[#1a1a2e]">Không tìm thấy đơn hàng</p>
          <Link href="/dashboard" className="mt-4 inline-block bg-[#ff6b35] text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-orange-600 transition">← Về trang chủ</Link>
        </div>
      </div>
    );
  }

  const currentStepIdx = STEPS.findIndex(s => s.key === order.status);
  const isCancelled = order.status === 'CANCELLED' || order.status === 'REJECTED';
  const isDelivered = order.status === 'DELIVERED';

  return (
    <div className="min-h-screen bg-[#f0f2f5] max-w-[420px] mx-auto relative pb-24">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="px-4 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="text-gray-400 hover:text-[#ff6b35] text-lg transition">←</Link>
          <h1 className="text-lg font-bold text-[#1a1a2e]">Đơn #{order.id?.slice(0, 8)}</h1>
          <div className="w-6" />
        </div>
      </header>

      <main className="px-4 py-6 space-y-5">
        {/* Status Banner */}
        <div className={`rounded-2xl p-6 text-center border ${STATUS_COLORS[order.status] || STATUS_COLORS.PENDING}`}>
          <p className="text-4xl mb-2">
            {isDelivered ? '🎉' : isCancelled ? '❌' : '🔄'}
          </p>
          <p className="text-xl font-bold">{STEPS.find(s => s.key === order.status)?.icon} {STEPS.find(s => s.key === order.status)?.label}</p>
          <p className="text-sm mt-1 opacity-70">
            {isDelivered ? 'Đơn hàng đã giao thành công!' :
             isCancelled ? 'Đơn hàng đã bị hủy' :
             'Đơn hàng đang được xử lý. Tự động cập nhật mỗi 5s.'}
          </p>
        </div>

        {/* Progress Tracker */}
        {!isCancelled && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h3 className="font-bold text-[#1a1a2e] mb-4">📋 Tiến trình đơn hàng</h3>
            <div className="space-y-0">
              {STEPS.map((step, idx) => {
                const isDone = idx <= currentStepIdx;
                const isCurrent = idx === currentStepIdx;
                return (
                  <div key={step.key} className="flex items-start gap-3 relative">
                    {/* Connector line */}
                    {idx < STEPS.length - 1 && (
                      <div className={`absolute left-[18px] top-9 w-0.5 h-full -translate-x-1/2 ${
                        idx < currentStepIdx ? 'bg-[#ff6b35]' : 'bg-gray-200'
                      }`} />
                    )}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0 z-10 ${
                      isDone ? 'bg-[#ff6b35] text-white' : 'bg-gray-100 text-gray-400'
                    } ${isCurrent ? 'ring-4 ring-orange-200' : ''}`}>
                      {step.icon}
                    </div>
                    <div className="pb-5 pt-1">
                      <p className={`text-sm font-semibold ${isDone ? 'text-[#1a1a2e]' : 'text-gray-400'}`}>
                        {step.label}
                      </p>
                      <p className="text-xs text-gray-400">
                        {isDone ? (isCurrent ? 'Đang xử lý...' : '✅ Hoàn thành') : 'Đang chờ'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Items */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-[#1a1a2e] mb-3">🛒 Món đã đặt</h3>
          <div className="space-y-2">
            {order.items?.map((item: any, i: number) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-700">{item.quantity}x {item.name}</span>
                <span className="text-gray-600 font-medium">{((item.unitPrice || 0) * item.quantity).toLocaleString('vi-VN')}₫</span>
              </div>
            ))}
          </div>
        </div>

        {/* Delivery Info */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-[#1a1a2e] mb-3">📍 Giao hàng</h3>
          <p className="text-sm text-gray-600">{order.deliveryAddress}</p>
          {order.notes && <p className="text-xs text-gray-400 mt-2 bg-gray-50 rounded-lg px-3 py-1.5 inline-block">📝 {order.notes}</p>}
        </div>

        {/* Payment Summary */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-[#1a1a2e] mb-3">💰 Thanh toán</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Tạm tính</span>
              <span className="font-medium">{Math.max(0, toNum(order.totalAmount) - toNum(order.deliveryFee) - toNum(order.serviceFee) + toNum(order.discount)).toLocaleString('vi-VN')}₫</span>
            </div>
            <div className="flex justify-between text-gray-600"><span>Phí giao hàng</span><span className="font-medium">{toNum(order.deliveryFee).toLocaleString('vi-VN')}₫</span></div>
            <div className="border-t pt-2 mt-1 flex justify-between font-bold">
              <span>Tổng cộng</span>
              <span className="text-[#ff6b35] text-lg">{toNum(order.totalAmount).toLocaleString('vi-VN')}₫</span>
            </div>
          </div>
        </div>

        <Link href="/dashboard" className="block text-center bg-[#ff6b35] text-white py-3.5 rounded-xl font-semibold hover:bg-orange-600 transition">
          ← Về trang chủ
        </Link>
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        <Link href="/dashboard" className="flex flex-col items-center text-[10px] text-[#ff6b35] no-underline"><span className="text-[22px]">🏠</span><span>Trang chủ</span></Link>
        <Link href="/restaurants" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">🔍</span><span>Tìm kiếm</span></Link>
        <Link href="/cart" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">🛒</span><span>Giỏ hàng</span></Link>
        <Link href="/orders" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">📦</span><span>Đơn hàng</span></Link>
        <Link href="/dashboard" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">👤</span><span>Tài khoản</span></Link>
      </nav>
    </div>
  );
}