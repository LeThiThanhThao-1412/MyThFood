"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { merchantApi } from "@mythfood/api-client";
import {
  useAuthStore,
  useCartStore,
  useLocationStore,
  useSearchHistoryStore,
  useFavoritesStore,
  haversineKm,
  formatDistance,
} from "@mythfood/frontend-shared";
import { calculateShippingFeeSync } from "@/app/checkout/shipping-utils";
import RestaurantFilterBar, {
  NEAR_ME_RADIUS_KM,
  type SortOption,
} from "@/components/RestaurantFilterBar";
import SearchHistoryDropdown from "@/components/SearchHistoryDropdown";
import CurrentLocationChip from "@/components/CurrentLocationChip";
import { resolveConsumerId } from "@/lib/consumer";

const gradientPalette = [
  "from-[#f093fb] to-[#f5576c]",
  "from-[#43e97b] to-[#38f9d7]",
  "from-[#fa709a] to-[#fee140]",
  "from-[#a18cd1] to-[#fbc2eb]",
  "from-[#ff6b35] to-[#ff8f65]",
  "from-[#fbc2eb] to-[#a6c1ee]",
];

/** Sorts that the backend can resolve in SQL. */
const SERVER_SORTS: Record<string, "rating" | "popular" | "newest"> = {
  rating: "rating",
  popular: "popular",
  newest: "newest",
};

const DEFAULT_SHIP_FEE = 15000;

export default function RestaurantsPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const { items: cartItems } = useCartStore();
  const cartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);

  const [merchants, setMerchants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  // --- Filters & sorting ---
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [nearMe, setNearMe] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [maxShipFee, setMaxShipFee] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("distance");

  const { location, hasLocation } = useLocationStore();
  const addKeyword = useSearchHistoryStore((s) => s.addKeyword);
  const favorites = useFavoritesStore();

  // Load favourites so the ❤️ shows correctly on each card
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    (async () => {
      const cid = await resolveConsumerId(user.id);
      if (cid) await favorites.load(cid);
    })();
  }, [isAuthenticated, user, favorites.load]);

  const toggleFavorite = async (merchantId: string) => {
    if (!isAuthenticated || !user) {
      router.push("/login");
      return;
    }
    const cid = await resolveConsumerId(user.id);
    if (cid) await favorites.toggle(cid, merchantId);
  };

  // Deep link: /restaurants?q=...&category=...
  // Read from window instead of useSearchParams() to avoid needing a Suspense
  // boundary during prerender.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const category = params.get("category");
    if (q) {
      setSearchInput(q);
      setSearch(q);
    }
    if (category) {
      setSelectedCategories([category]);
    }
  }, []);

  // Debounce search input (avoid API spam on every keystroke)
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Remember committed keywords (feature: lịch sử tìm kiếm)
  useEffect(() => {
    if (search.trim()) {
      addKeyword(search);
    }
  }, [search, addKeyword]);

  // FIX #5: Load merchants with category/search/rating/open/sort filters
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params: any = { take: 100 };
        if (selectedCategories.length > 0) {
          params.categories = selectedCategories.join(",");
        }
        if (search) {
          params.search = search;
        }
        if (minRating > 0) {
          params.minRating = minRating;
        }
        if (openOnly) {
          params.openNow = true;
        }
        const serverSort = SERVER_SORTS[sortBy];
        if (serverSort) {
          params.sortBy = serverSort;
        }
        const res = await merchantApi.list(params);
        const list = res.items || [];
        setMerchants(list.filter((m: any) => m.status === "APPROVED"));
      } catch {
        setMerchants([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [selectedCategories, search, minRating, openOnly, sortBy]);

  // Compute distance + estimated ship fee, then apply client-side filters/sorts
  const displayedMerchants = useMemo(() => {
    const enriched = merchants.map((m: any) => {
      let distanceKm: number | null = null;
      if (
        hasLocation &&
        location &&
        m.latitude != null &&
        m.longitude != null
      ) {
        distanceKm = haversineKm(
          location.latitude,
          location.longitude,
          Number(m.latitude),
          Number(m.longitude),
        );
      }
      const shipFee =
        distanceKm != null
          ? calculateShippingFeeSync(distanceKm)
          : DEFAULT_SHIP_FEE;
      return { ...m, distanceKm, shipFee };
    });

    let result = enriched;
    if (nearMe) {
      result = result.filter(
        (m: any) => m.distanceKm != null && m.distanceKm <= NEAR_ME_RADIUS_KM,
      );
    }
    if (maxShipFee != null) {
      result = result.filter((m: any) => m.shipFee <= maxShipFee);
    }

    // `rating` / `popular` / `newest` are already ordered by the API
    if (sortBy === "distance") {
      result = [...result].sort(
        (a: any, b: any) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999),
      );
    } else if (sortBy === "shipFee") {
      result = [...result].sort((a: any, b: any) => a.shipFee - b.shipFee);
    }
    return result;
  }, [merchants, hasLocation, location, nearMe, maxShipFee, sortBy]);

  const activeFilterCount =
    (nearMe ? 1 : 0) +
    (openOnly ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (maxShipFee != null ? 1 : 0) +
    selectedCategories.length;

  const toggleCategory = (key: string) => {
    if (key === "") {
      setSelectedCategories([]);
      return;
    }
    setSelectedCategories((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key],
    );
  };

  const clearAllFilters = () => {
    setNearMe(false);
    setOpenOnly(false);
    setMinRating(0);
    setMaxShipFee(null);
    setSelectedCategories([]);
  };

  const clearSearch = () => {
    setSearchInput("");
    setSearch("");
  };

  const pickHistoryKeyword = (keyword: string) => {
    setSearchInput(keyword);
    setSearch(keyword);
    setHistoryOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      {/* ===== TOP NAVBAR ===== */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Left: Back + Logo */}
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="text-gray-400 hover:text-[#ff6b35] text-lg transition"
              >
                ←
              </Link>
              <Link
                href="/dashboard"
                className="text-2xl font-extrabold text-[#ff6b35] shrink-0"
              >
                MyTh<span className="text-[#1a1a2e]">Food</span>
              </Link>
            </div>

            {/* Search bar */}
            <div className="hidden sm:flex flex-1 max-w-lg relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-[#ff6b35] z-10">
                🔍
              </span>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={() => setHistoryOpen(true)}
                onBlur={() => setHistoryOpen(false)}
                placeholder="Tìm món ăn, nhà hàng..."
                className="w-full bg-[#f5f5f5] rounded-xl pl-11 pr-4 py-2.5 text-sm border-none outline-none focus:ring-2 focus:ring-orange-200 transition"
              />
              {searchInput && (
                <button
                  onClick={clearSearch}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10"
                >
                  ✕
                </button>
              )}
              <SearchHistoryDropdown
                visible={historyOpen && searchInput.length === 0}
                onPick={pickHistoryKeyword}
                onClose={() => setHistoryOpen(false)}
              />
            </div>

            {/* Right side */}
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
                      {user?.fullName?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <button
                      onClick={() => {
                        clearAuth();
                        router.push("/");
                      }}
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
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page title + count */}
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h1 className="text-2xl font-extrabold text-[#1a1a2e]">
              🏪 Nhà hàng
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              {displayedMerchants.length} nhà hàng đang hoạt động
            </p>
          </div>
          {/* Vị trí giao hàng — đổi được ngay tại đây vì khoảng cách, phí ship
              và bộ lọc "gần tôi" đều tính từ toạ độ này. */}
          <CurrentLocationChip />
        </div>

        {/* Mobile search */}
        <div className="sm:hidden mb-4 relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-[#ff6b35] z-10">
            🔍
          </span>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onFocus={() => setHistoryOpen(true)}
            onBlur={() => setHistoryOpen(false)}
            placeholder="Tìm món ăn, nhà hàng..."
            className="w-full bg-white rounded-xl pl-11 pr-10 py-3 text-sm border border-gray-100 outline-none focus:ring-2 focus:ring-orange-200 transition shadow-sm"
          />
          {searchInput && (
            <button
              onClick={clearSearch}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10"
            >
              ✕
            </button>
          )}
          <SearchHistoryDropdown
            visible={historyOpen && searchInput.length === 0}
            onPick={pickHistoryKeyword}
            onClose={() => setHistoryOpen(false)}
          />
        </div>

        {/* Filters: rating / open now / ship fee / sort / categories */}
        <RestaurantFilterBar
          nearMe={nearMe}
          onNearMeChange={setNearMe}
          openOnly={openOnly}
          onOpenOnlyChange={setOpenOnly}
          minRating={minRating}
          onMinRatingChange={setMinRating}
          maxShipFee={maxShipFee}
          onMaxShipFeeChange={setMaxShipFee}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          selectedCategories={selectedCategories}
          onToggleCategory={toggleCategory}
          onClearAll={clearAllFilters}
          activeFilterCount={activeFilterCount}
          hasLocation={hasLocation}
        />

        {/* Content */}
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl overflow-hidden shadow-sm animate-pulse"
              >
                <div className="h-[180px] bg-gray-200" />
                <div className="p-5">
                  <div className="h-5 bg-gray-200 rounded w-1/2 mb-3" />
                  <div className="h-3 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : displayedMerchants.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl shadow-sm">
            <p className="text-5xl mb-4">🍽️</p>
            <p className="text-gray-400 text-lg font-medium">
              {search
                ? "Không tìm thấy nhà hàng hoặc món ăn phù hợp"
                : activeFilterCount > 0
                  ? "Không có nhà hàng nào khớp bộ lọc"
                  : "Chưa có nhà hàng nào"}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              {search
                ? "Thử tìm kiếm với từ khóa khác"
                : activeFilterCount > 0
                  ? "Thử nới lỏng hoặc xoá bớt bộ lọc"
                  : "Vui lòng quay lại sau"}
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              {search && (
                <button
                  onClick={clearSearch}
                  className="bg-[#ff6b35] text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-orange-600 transition"
                >
                  Xóa tìm kiếm
                </button>
              )}
              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="bg-white border border-gray-200 text-gray-600 px-5 py-2 rounded-lg text-sm font-medium hover:border-orange-300 hover:text-[#ff6b35] transition"
                >
                  Xoá bộ lọc ({activeFilterCount})
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {displayedMerchants.map((m: any, idx: number) => (
              <div
                key={m.id}
                onClick={() => router.push(`/restaurants/${m.id}`)}
                className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-1 transition-all cursor-pointer group"
              >
                {/* Image */}
                <div
                  className={`h-[180px] relative ${m.coverImageUrl ? "" : `bg-gradient-to-br ${gradientPalette[idx % gradientPalette.length]}`}`}
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
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(m.id);
                    }}
                    aria-label={
                      favorites.isFavorite(m.id) ? "Bỏ yêu thích" : "Yêu thích"
                    }
                    title={
                      favorites.isFavorite(m.id)
                        ? "Bỏ yêu thích"
                        : "Yêu thích nhà hàng"
                    }
                    className={`absolute top-2.5 right-2.5 z-20 bg-black/50 backdrop-blur rounded-full w-9 h-9 flex items-center justify-center text-base transition-transform hover:scale-110 ${
                      favorites.isFavorite(m.id) ? "" : "grayscale opacity-80"
                    }`}
                  >
                    {favorites.isFavorite(m.id) ? "❤️" : "🤍"}
                  </button>
                  {m.distanceKm != null && (
                    <span className="absolute top-3 right-3 bg-black/70 text-white px-2.5 py-0.5 rounded-full text-[10px] font-semibold">
                      📍 {formatDistance(m.distanceKm)}
                    </span>
                  )}
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
                    <h3 className="font-bold text-gray-800 text-base group-hover:text-[#ff6b35] transition-colors truncate">
                      {m.name}
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mb-2">
                    <span className="text-yellow-500 font-medium">
                      ⭐ {Number(m.rating || 0).toFixed(1)}
                    </span>
                    <span className="text-gray-300">•</span>
                    <span>🚚 {m.shipFee.toLocaleString("vi-VN")}đ</span>
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
                        🟢 Đang mở
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <span>📍</span>
                    <span className="truncate">{m.address}</span>
                  </div>
                  {m.phone && (
                    <p className="text-xs text-gray-400 mt-1">📞 {m.phone}</p>
                  )}

                  {/* Matched dishes (feature: tìm kiếm theo món ăn) */}
                  {m.matchedMenuItems?.length > 0 && (
                    <div className="mt-2.5 pt-2.5 border-t border-dashed border-gray-100">
                      <p className="text-[11px] text-gray-400 mb-1">
                        🍲 Có món bạn tìm:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {m.matchedMenuItems.map((item: any) => (
                          <span
                            key={item.id}
                            className="bg-orange-50 text-[#ff6b35] text-[11px] font-medium px-2 py-0.5 rounded-full"
                          >
                            {item.name} · {item.price.toLocaleString("vi-VN")}đ
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ===== MOBILE BOTTOM NAV ===== */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        <Link
          href="/dashboard"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">🏠</span>
          <span>Trang chủ</span>
        </Link>
        <Link
          href="/restaurants"
          className="flex flex-col items-center text-[10px] text-[#ff6b35] no-underline"
        >
          <span className="text-[22px]">🔍</span>
          <span>Tìm kiếm</span>
        </Link>
        <Link
          href="/cart"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline relative"
        >
          <span className="text-[22px]">🛒</span>
          <span>Giỏ hàng</span>
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-2 bg-[#ff6b35] text-white text-[10px] font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </Link>
        <Link
          href="/orders"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">📦</span>
          <span>Đơn hàng</span>
        </Link>
        <button
          onClick={() => {
            if (isAuthenticated) {
              clearAuth();
              router.push("/");
            } else router.push("/login");
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
