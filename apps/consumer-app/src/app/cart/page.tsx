'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCartStore, useAuthStore } from '@mythfood/frontend-shared';

export default function CartPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const { items, updateQuantity, removeItem, clearCart, getSubtotal } = useCartStore();

  if (!isAuthenticated) {
    router.push('/login');
    return null;
  }

  const subtotal = getSubtotal();
  const deliveryFee = items.length > 0 ? 15000 : 0;
  const serviceFee = items.length > 0 ? Math.round(subtotal * 0.02) : 0;
  const total = subtotal + deliveryFee + serviceFee;
  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      {/* ===== TOP NAVBAR ===== */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-gray-400 hover:text-[#ff6b35] text-lg transition">←</Link>
            <h1 className="text-lg font-bold text-[#1a1a2e]">
              🛒 Giỏ hàng
              {cartCount > 0 && <span className="text-sm font-normal text-gray-400 ml-2">({cartCount} món)</span>}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#ff6b35] rounded-full flex items-center justify-center text-white font-bold text-sm">
              {user?.fullName?.charAt(0)?.toUpperCase() || '?'}
            </div>
          </div>
        </div>
      </header>

      {/* ===== MAIN ===== */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {items.length === 0 ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center bg-white rounded-2xl shadow-sm p-10 sm:p-12 max-w-md w-full">
              <div className="w-20 h-20 mx-auto bg-[#fff7ed] rounded-2xl flex items-center justify-center text-4xl mb-5">🛒</div>
              <h2 className="text-xl font-extrabold text-[#1a1a2e] mb-2">Giỏ hàng trống</h2>
              <p className="text-gray-400 text-sm mb-6">Khám phá nhà hàng và thêm món vào giỏ!</p>
              <Link
                href="/restaurants"
                className="inline-block bg-[#ff6b35] text-white px-8 py-3 rounded-xl font-semibold text-sm hover:bg-orange-600 transition shadow-md shadow-orange-200"
              >
                🍽️ Xem nhà hàng
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* LEFT: Cart Items */}
            <div className="lg:col-span-2 space-y-4">
              {/* Merchant info */}
              <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#fff7ed] rounded-xl flex items-center justify-center text-xl">
                    🏪
                  </div>
                  <div>
                    <p className="font-bold text-gray-800">{items[0]?.merchantName || 'Nhà hàng'}</p>
                    <p className="text-xs text-gray-400">{items.length} loại món • {cartCount} phần</p>
                  </div>
                </div>
                <button
                  onClick={() => clearCart()}
                  className="text-sm text-gray-400 hover:text-red-500 transition flex items-center gap-1"
                >
                  <span>🗑️</span>
                  <span className="hidden sm:inline">Xóa tất cả</span>
                </button>
              </div>

              {/* Items */}
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div
                    key={item.menuItem.id}
                    className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 hover:shadow-md transition-all animate-fade-in-up"
                    style={{ animationDelay: `${idx * 0.05}s` }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Item image placeholder */}
                      <div className="hidden sm:flex w-16 h-16 bg-[#fff7ed] rounded-xl items-center justify-center text-2xl shrink-0">
                        🍽️
                      </div>

                      {/* Item info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-800">{item.menuItem.name}</h3>
                        <p className="text-sm text-gray-400 mt-0.5">
                          {item.menuItem.price?.toLocaleString('vi-VN')}₫ / phần
                        </p>
                        {item.specialInstructions && (
                          <p className="text-xs text-gray-400 mt-2 bg-gray-50 rounded-lg px-3 py-1.5 inline-block">
                            📝 {item.specialInstructions}
                          </p>
                        )}
                      </div>

                      {/* Quantity + Price */}
                      <div className="flex flex-col items-end gap-3 shrink-0">
                        {/* Quantity controls */}
                        <div className="flex items-center gap-1.5 bg-gray-50 rounded-xl p-1">
                          <button
                            onClick={() => updateQuantity(item.menuItem.id, Math.max(0, item.quantity - 1))}
                            className="w-8 h-8 rounded-lg bg-white hover:bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600 shadow-sm transition"
                          >
                            −
                          </button>
                          <span className="text-sm font-bold text-gray-800 w-8 text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.menuItem.id, item.quantity + 1)}
                            className="w-8 h-8 rounded-lg bg-[#ff6b35] hover:bg-orange-600 flex items-center justify-center text-sm font-medium text-white shadow-sm transition"
                          >
                            +
                          </button>
                        </div>

                        {/* Item total */}
                        <div className="text-right">
                          <span className="font-bold text-[#ff6b35] text-base">
                            {((item.menuItem.price || 0) * item.quantity).toLocaleString('vi-VN')}₫
                          </span>
                        </div>

                        {/* Remove button */}
                        <button
                          onClick={() => removeItem(item.menuItem.id)}
                          className="text-xs text-gray-400 hover:text-red-500 transition"
                        >
                          🗑️ Xóa
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Continue shopping */}
              <Link
                href="/restaurants"
                className="flex items-center gap-2 text-sm text-[#ff6b35] hover:text-orange-600 font-semibold transition"
              >
                <span>←</span>
                <span>Thêm món khác</span>
              </Link>
            </div>

            {/* RIGHT: Summary */}
            <div>
              <div className="sticky top-20 space-y-4">
                {/* Order Summary */}
                <section className="bg-white rounded-2xl shadow-sm p-5 sm:p-6">
                  <h2 className="text-lg font-bold text-[#1a1a2e] mb-4 flex items-center gap-2">
                    <span className="w-8 h-8 bg-[#fff7ed] rounded-xl flex items-center justify-center text-lg">📋</span>
                    Tổng đơn hàng
                  </h2>

                  <div className="space-y-2.5 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Tạm tính</span>
                      <span className="font-medium">{subtotal.toLocaleString('vi-VN')}₫</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Phí giao hàng</span>
                      <span className="font-medium">{deliveryFee.toLocaleString('vi-VN')}₫</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Phí dịch vụ (2%)</span>
                      <span className="font-medium">{serviceFee.toLocaleString('vi-VN')}₫</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t-2 border-gray-100 flex justify-between items-center">
                    <span className="text-base font-bold text-[#1a1a2e]">Tổng cộng</span>
                    <span className="text-xl font-extrabold text-[#ff6b35]">{total.toLocaleString('vi-VN')}₫</span>
                  </div>
                </section>

                {/* Checkout button */}
                <Link
                  href="/checkout"
                  className="block w-full bg-gradient-to-r from-[#ff6b35] to-[#ff8f65] text-white py-4 rounded-2xl font-bold text-base text-center hover:shadow-lg hover:shadow-orange-300 transition-all"
                >
                  🛵 Thanh toán • {total.toLocaleString('vi-VN')}₫
                </Link>

                <p className="text-center text-xs text-gray-400">
                  Phí giao hàng và dịch vụ sẽ được tính khi thanh toán
                </p>
              </div>
            </div>
          </div>
        )}
        <div className="h-6" />
      </main>

      {/* ===== MOBILE BOTTOM NAV ===== */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        <Link href="/dashboard" className="flex flex-col items-center text-[10px] text-gray-400 no-underline">
          <span className="text-[22px]">🏠</span>
          <span>Trang chủ</span>
        </Link>
        <Link href="/restaurants" className="flex flex-col items-center text-[10px] text-gray-400 no-underline">
          <span className="text-[22px]">🔍</span>
          <span>Tìm kiếm</span>
        </Link>
        <Link href="/cart" className="flex flex-col items-center text-[10px] text-[#ff6b35] no-underline relative">
          <span className="text-[22px]">🛒</span>
          <span>Giỏ hàng</span>
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-2 bg-[#ff6b35] text-white text-[10px] font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </Link>
        <Link href="/orders" className="flex flex-col items-center text-[10px] text-gray-400 no-underline">
          <span className="text-[22px]">📦</span>
          <span>Đơn hàng</span>
        </Link>
        <Link href="/dashboard" className="flex flex-col items-center text-[10px] text-gray-400 no-underline">
          <span className="text-[22px]">👤</span>
          <span>Tài khoản</span>
        </Link>
      </nav>

      <div className="lg:hidden h-20" />
    </div>
  );
}