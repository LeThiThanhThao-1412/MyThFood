'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { merchantApi } from '@mythfood/api-client';
import { useAuthStore, useCartStore } from '@mythfood/frontend-shared';

export default function RestaurantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const { addItem, items } = useCartStore();
  const [merchant, setMerchant] = useState<any>(null);
  const [menu, setMenu] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [currentCategory, setCurrentCategory] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const m = await merchantApi.getById(id);
        setMerchant(m);
        const menuData = await merchantApi.getMenu(id);
        const menuArr = Array.isArray(menuData) ? menuData : [];
        setMenu(menuArr);
        // Set first category as active
        const cats = new Set(menuArr.map((i: any) => i.category || 'Khác'));
        const firstCat = [...cats][0] || '';
        setCurrentCategory(firstCat);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    }
    if (id) load();
  }, [id]);

  const handleAddToCart = (menuItem: any) => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    addItem({
      menuItem,
      quantity: 1,
      merchantId: id,
      merchantName: merchant?.name || '',
    });
    setAddedIds((prev) => new Set(prev).add(menuItem.id));
    setTimeout(() => {
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.delete(menuItem.id);
        return next;
      });
    }, 1500);
  };

  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

  // Group menu by category
  const groupedMenu: Record<string, any[]> = {};
  const categoryOrder: string[] = [];
  menu.forEach((item) => {
    const cat = item.category || 'Khác';
    if (!groupedMenu[cat]) {
      groupedMenu[cat] = [];
      categoryOrder.push(cat);
    }
    groupedMenu[cat].push(item);
  });

  // Loading skeleton
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f2f5]">
        <header className="bg-white shadow-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
            <div className="h-5 bg-gray-200 rounded w-48 animate-pulse" />
          </div>
        </header>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 animate-pulse">
            <div className="h-7 bg-gray-200 rounded w-1/3 mb-3" />
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
            <div className="h-4 bg-gray-200 rounded w-3/4" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-2xl shadow-sm p-5 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-1/3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Not found
  if (!merchant) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center">
        <div className="text-center bg-white rounded-2xl shadow-sm p-10">
          <p className="text-5xl mb-4">🔍</p>
          <p className="text-gray-500 text-lg font-medium">Không tìm thấy nhà hàng</p>
          <Link
            href="/restaurants"
            className="mt-4 inline-block bg-[#ff6b35] text-white px-6 py-2.5 rounded-full font-semibold text-sm hover:bg-orange-600 transition"
          >
            ← Quay lại danh sách
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      {/* ===== TOP NAVBAR ===== */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Left: Back + Restaurant name */}
            <div className="flex items-center gap-3 min-w-0">
              <Link
                href="/restaurants"
                className="text-gray-400 hover:text-[#ff6b35] text-lg transition shrink-0"
              >
                ←
              </Link>
              <h1 className="text-lg font-bold text-[#1a1a2e] truncate">
                {merchant.name}
              </h1>
            </div>

            {/* Right */}
            <div className="flex items-center gap-3 sm:gap-4">
              {isAuthenticated ? (
                <>
                  <Link
                    href="/cart"
                    className="relative text-xl hover:scale-110 transition-transform"
                  >
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
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Restaurant Info Card */}
        <div className="bg-gradient-to-br from-[#f093fb] to-[#f5576c] rounded-2xl p-6 sm:p-8 text-white shadow-lg mb-6 relative overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />

          <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold mb-2">{merchant.name}</h2>
              <div className="flex flex-wrap items-center gap-3 text-sm text-white/80">
                <span className="bg-white/20 px-2.5 py-0.5 rounded-full font-semibold">
                  ⭐ {Number(merchant.rating || 0).toFixed(1)}
                </span>
                <span>📍 {merchant.address}</span>
              </div>
              {merchant.phone && (
                <p className="text-sm text-white/60 mt-1">📞 {merchant.phone}</p>
              )}
              {merchant.description && (
                <p className="text-sm text-white/70 mt-3 max-w-lg line-clamp-2">{merchant.description}</p>
              )}
            </div>
            <div className="text-5xl sm:text-6xl">🍽️</div>
          </div>
        </div>

        {/* Menu section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-extrabold text-[#1a1a2e]">
              📋 Thực đơn <span className="text-gray-400 text-sm font-normal">({menu.length} món)</span>
            </h2>
          </div>

          {/* Category tabs */}
          {categoryOrder.length > 1 && (
            <div className="flex gap-2 mb-5 overflow-x-auto hide-scrollbar pb-1">
              {categoryOrder.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCurrentCategory(cat)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0 ${
                    currentCategory === cat
                      ? 'bg-[#ff6b35] text-white shadow-md shadow-orange-200'
                      : 'bg-white text-gray-600 border border-gray-100 hover:border-orange-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {menu.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-gray-400 font-medium">Nhà hàng chưa có thực đơn</p>
            </div>
          ) : (
            <div className="space-y-8">
              {(currentCategory ? [currentCategory] : categoryOrder).map((cat) => {
                const catItems = groupedMenu[cat] || [];
                if (catItems.length === 0) return null;
                return (
                  <div key={cat}>
                    <h3 className="text-base font-bold text-[#ff6b35] mb-3 flex items-center gap-2">
                      <span>🍽️</span>
                      {cat}
                      <span className="text-xs text-gray-400 font-normal">({catItems.length})</span>
                    </h3>
                    <div className="space-y-3">
                      {catItems.map((item: any) => {
                        const isAdded = addedIds.has(item.id);
                        return (
                          <div
                            key={item.id}
                            className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 flex items-center justify-between hover:shadow-md transition-all"
                          >
                            <div className="flex-1 min-w-0 mr-4">
                              <h4 className="font-semibold text-gray-800">{item.name}</h4>
                              {item.description && (
                                <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{item.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                              <span className="font-bold text-[#ff6b35] text-base whitespace-nowrap">
                                {item.price?.toLocaleString('vi-VN')}₫
                              </span>
                              <button
                                onClick={() => handleAddToCart(item)}
                                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                                  isAdded
                                    ? 'bg-green-500 text-white scale-105'
                                    : 'bg-[#ff6b35] text-white hover:bg-orange-600 shadow-md shadow-orange-200'
                                }`}
                              >
                                {isAdded ? '✅ Đã thêm' : '+ Thêm'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Spacer */}
        <div className="h-6" />
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