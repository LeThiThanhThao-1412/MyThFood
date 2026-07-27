'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { orderApi } from '@mythfood/api-client';
import { useAuthStore } from '@mythfood/frontend-shared';

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

export default function PaymentSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuthStore();
  const orderId = searchParams.get('orderId');

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    if (!orderId) { setLoading(false); return; }
    async function load() {
      try {
        const o = await orderApi.getById(orderId!);
        setOrder(o);
      } catch {} finally { setLoading(false); }
    }
    load();
  }, [orderId, isAuthenticated, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl p-6 sm:p-8 text-center relative overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-green-100 rounded-full opacity-50" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-orange-100 rounded-full opacity-50" />

          <div className="relative z-10">
            {/* Success icon */}
            <div className="w-24 h-24 mx-auto bg-gradient-to-br from-[#2ecc71] to-[#27ae60] rounded-full flex items-center justify-center shadow-lg shadow-green-300 mb-6">
              <span className="text-4xl">✅</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1a1a2e] mb-2">
              Thanh toán thành công!
            </h1>
            <p className="text-gray-500 mb-5">
              Đơn hàng của bạn đã được xác nhận và đang được xử lý
            </p>

            {order ? (
              <div className="bg-[#f8fafb] rounded-2xl p-5 mb-5 text-left text-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-gray-500">Mã đơn hàng</span>
                  <span className="font-bold text-[#ff6b35] text-base">#{order.id?.slice(0, 8)}</span>
                </div>
                <div className="h-px bg-gray-100 mb-3" />
                {order.items?.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-400 mb-2">🛒 Món đã đặt</p>
                    <div className="space-y-1.5">
                      {order.items.map((item: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-gray-700">{item.quantity}x {item.name}</span>
                          <span className="text-gray-600 font-medium">{((item.unitPrice || 0) * item.quantity).toLocaleString('vi-VN')}₫</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="h-px bg-gray-100 mb-3" />
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-gray-500">
                    <span>Địa chỉ giao hàng</span>
                    <span className="text-right max-w-[180px] truncate">{order.deliveryAddress || '—'}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Phương thức thanh toán</span>
                    <span className="font-medium text-gray-700">💳 Stripe</span>
                  </div>
                </div>
                <div className="h-px bg-gray-100 my-3" />
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 font-semibold">Tổng thanh toán</span>
                  <span className="text-xl font-extrabold text-[#ff6b35]">{toNum(order.totalAmount).toLocaleString('vi-VN')}₫</span>
                </div>
              </div>
            ) : (
              <div className="bg-green-50 rounded-2xl p-5 mb-5 text-center">
                <p className="text-green-700 text-sm">Đơn hàng của bạn đã được ghi nhận!</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="space-y-3">
              {order && (
                <Link
                  href={`/orders/${order.id}`}
                  className="block w-full bg-[#ff6b35] text-white py-3.5 rounded-xl font-bold text-base hover:bg-orange-600 transition shadow-md shadow-orange-200"
                >
                  Theo dõi đơn hàng →
                </Link>
              )}
              <Link
                href="/dashboard"
                className="block w-full bg-white border-2 border-gray-200 text-gray-700 py-3.5 rounded-xl font-semibold text-base hover:bg-gray-50 transition"
              >
                ← Về trang chủ
              </Link>
            </div>

            <p className="mt-4 text-xs text-gray-400">
              Cảm ơn bạn đã đặt hàng tại MyThFood! 🧡
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}