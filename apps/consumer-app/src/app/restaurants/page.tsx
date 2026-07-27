'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { merchantApi } from '@mythfood/api-client';
import { useAuthStore, useCartStore } from '@mythfood/frontend-shared';

const gradientPalette = [
  'from-[#f093fb] to-[#f5576c]',
  'from-[#43e97b] to-[#38f9d7]',
  'from-[#fa709a] to-[#fee140]',
  'from-[#a18cd1] to-[#fbc2eb]',
  'from-[#ff6b35] to-[#ff8f65]',
  'from-[#fbc2eb] to-[#a6c1ee]',
];

const categories = [
  { key: '', icon: '🍽️', label: 'Tất cả' },
  { key: 'pho', icon: '🍜', label: 'Phở' },
  { key: 'rice', icon: '🍚', label: 'Cơm' },
  { key: 'drink', icon: '🥤', label: 'Đồ uống' },
  { key: 'snack', icon: '🍢', label: 'Ăn vặt' },
  { key: 'sushi', icon: '🍣', label: 'Nhật' },
];

export default function RestaurantsPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const { items: cartItems } = useCartStore();
  const cartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);

  const [merchants, setMerchants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await merchantApi.list({ take: 100 });
        const list = res.items || [];
        setMerchants(list.filter((m: any) => m.status === 'APPROVED'));
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = merchants.filter((m) => {
    const matchSearch = m.name.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      {/* ===== TOP NAVBAR ===== */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Left: Back + Logo */}
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="text-gray-400 hover:text-[#ff6b35] text-lg transition"
              >
                ←
              </Link>
              <Link href="/dashboard" className="text-2xl font-extrabold text-[#ff6b35] shrink-0">
                MyTh<span className="text-[#1a1a2e]">Food</span>
              </Link>
            </div>

            {/* Search bar */}
            <div className="hidden sm:flex flex-1 max-w-lg relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-[#ff6b35]">🔍</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm nhà hàng theo tên..."
                className="w-full bg-[#f5f5f5] rounded-xl pl-11 pr-4 py-2.5 text-sm border-none outline-none focus:ring-2 focus:ring-orange-200 transition"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3 sm:gap-4">
              {isAuthenticated ? (
                <>
                  <Link href="/cart" className="relative text-xl hover:scale-110 transition-transform">
                    🛒
                    {cartCount > 0 && (
                      <span className="absolute -top-1.5 -right-2 bg-[#ff6b35] text-white text-[10px] font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center">
                        {cartCount}
                      </span>
                    )}
                  </Link>
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 bg-[#ff6b35] rounded-full flex items-center justify-center text-white font-bold text-sm">
                      {user?.fullName?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <button
                      onClick={() => { clearAuth(); router.push('/'); }}
                      className="hidden sm:block text-xs text-gray-400 hover:text-red-500 transition"
                    >
                      Đăng xuất
                    </button>
                  </div>
                </>
              ) : (
                <Link
                  href="/login"
                  className="bg-[#ff6b35] text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-orange-600 transition shadow-md"
                >
                  Đăng nhập
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ===== MAIN ===== */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page title + count */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-extrabold text-[#1a1a2e]">🏪 Nhà hàng</h1>
            <p className="text-sm text-gray-400 mt-1">
              {filtered.length} nhà hàng đang hoạt động
            </p>
          </div>
        </div>

        {/* Mobile search */}
        <div className="sm:hidden mb-4 relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-[#ff6b35]">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm nhà hàng..."
            className="w-full bg-white rounded-xl pl-11 pr-10 py-3 text-sm border border-gray-100 outline-none focus:ring-2 focus:ring-orange-200 transition shadow-sm"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>

        {/* Categories filter pills */}
        <div className="flex gap-2 mb-6 overflow-x-auto hide-scrollbar pb-1">
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0 ${
                activeCategory === cat.key
                  ? 'bg-[#ff6b35] text-white shadow-md shadow-orange-200'
                  : 'bg-white text-gray-600 border border-gray-100 hover:border-orange-200'
              }`}
            >
              <span className="text-base">{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm animate-pulse">
                <div className="h-[180px] bg-gray-200" />
                <div className="p-5">
                  <div className="h-5 bg-gray-200 rounded w-1/2 mb-3" />
                  <div className="h-3 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl shadow-sm">
            <p className="text-5xl mb-4">🍽️</p>
            <p className="text-gray-400 text-lg font-medium">
              {search ? 'Không tìm thấy nhà hàng phù hợp' : 'Chưa có nhà hàng nào'}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              {search ? 'Thử tìm kiếm với từ khóa khác' : 'Vui lòng quay lại sau'}
            </p>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="mt-4 bg-[#ff6b35] text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-orange-600 transition"
              >
                Xóa tìm kiếm
              </button>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((m, idx) => (
              <div
                key={m.id}
                onClick={() => router.push(`/restaurants/${m.id}`)}
                className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-1 transition-all cursor-pointer group"
              >
                {/* Image */}
                <div
                  className={`h-[180px] bg-gradient-to-br ${gradientPalette[idx % gradientPalette.length]} relative`}
                >
                  <span className="absolute top-3 left-3 bg-black/70 text-white px-2.5 py-0.5 rounded-full text-[10px] font-semibold">
                    ⭐ {Number(m.rating || 0).toFixed(1)}
                  </span>
                  <span className="absolute bottom-3 right-3 bg-black/70 text-white px-2.5 py-1 rounded-full text-xs">
                    🕐 30-40 phút
                  </span>
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white text-[#ff6b35] px-4 py-2 rounded-full font-semibold text-sm shadow-lg">
                      Xem menu →
                    </span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="font-bold text-gray-800 text-base mb-1 group-hover:text-[#ff6b35] transition-colors">
                    {m.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mb-2">
                    <span className="text-yellow-500 font-medium">⭐ {Number(m.rating || 0).toFixed(1)}</span>
                    <span className="text-gray-300">•</span>
                    <span>🚚 15.000đ</span>
                    <span className="text-gray-300">•</span>
                    <span className="text-green-500 font-semibold">🟢 Đang mở</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <span>📍</span>
                    <span className="truncate">{m.address}</span>
                  </div>
                  {m.phone && (
                    <p className="text-xs text-gray-400 mt-1">📞 {m.phone}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ===== MOBILE BOTTOM NAV ===== */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        <Link href="/dashboard" className="flex flex-col items-center text-[10px] text-gray-400 no-underline">
          <span className="text-[22px]">🏠</span>
          <span>Trang chủ</span>
        </Link>
        <Link href="/restaurants" className="flex flex-col items-center text-[10px] text-[#ff6b35] no-underline">
          <span className="text-[22px]">🔍</span>
          <span>Tìm kiếm</span>
        </Link>
        <Link href="/cart" className="flex flex-col items-center text-[10px] text-gray-400 no-underline relative">
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
        <button
          onClick={() => {
            if (isAuthenticated) { clearAuth(); router.push('/'); }
            else router.push('/login');
          }}
          className="flex flex-col items-center text-[10px] text-gray-400 bg-transparent border-none font-sans cursor-pointer"
        >
          <span className="text-[22px]">👤</span>
          <span>Tài khoản</span>
        </button>
      </nav>

      <div className="lg:hidden h-20" />
    </div>
  );
}