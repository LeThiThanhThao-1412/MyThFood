"use client";
import { FOOD_CATEGORIES } from "@mythfood/frontend-shared";

/**
 * Sort options for the restaurant list.
 * - `rating` / `popular` / `newest` are resolved by the backend (SQL)
 * - `distance` / `shipFee` are resolved on the client (they depend on the
 *   user's GPS position and the client-side shipping formula)
 */
export type SortOption =
  | "distance"
  | "rating"
  | "shipFee"
  | "popular"
  | "newest";

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "distance", label: "📍 Gần nhất" },
  { value: "rating", label: "⭐ Đánh giá cao" },
  { value: "shipFee", label: "🚚 Phí ship thấp" },
  { value: "popular", label: "🔥 Phổ biến" },
  { value: "newest", label: "🆕 Mới nhất" },
];

export const RATING_OPTIONS = [0, 3, 3.5, 4, 4.5];
export const SHIP_FEE_OPTIONS = [null, 15000, 20000, 30000];

/** Radius used by the "Gần tôi" quick filter. */
export const NEAR_ME_RADIUS_KM = 10;

interface RestaurantFilterBarProps {
  nearMe: boolean;
  onNearMeChange: (value: boolean) => void;
  openOnly: boolean;
  onOpenOnlyChange: (value: boolean) => void;
  minRating: number;
  onMinRatingChange: (value: number) => void;
  maxShipFee: number | null;
  onMaxShipFeeChange: (value: number | null) => void;
  sortBy: SortOption;
  onSortByChange: (value: SortOption) => void;
  selectedCategories: string[];
  onToggleCategory: (key: string) => void;
  onClearAll: () => void;
  activeFilterCount: number;
  hasLocation: boolean;
}

const chipBase =
  "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0";
const selectBase =
  "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap shrink-0 border outline-none cursor-pointer transition-all appearance-none";

export default function RestaurantFilterBar({
  nearMe,
  onNearMeChange,
  openOnly,
  onOpenOnlyChange,
  minRating,
  onMinRatingChange,
  maxShipFee,
  onMaxShipFeeChange,
  sortBy,
  onSortByChange,
  selectedCategories,
  onToggleCategory,
  onClearAll,
  activeFilterCount,
  hasLocation,
}: RestaurantFilterBarProps) {
  return (
    <div className="mb-6 space-y-3">
      {/* ===== Row 1: quick filters + sort ===== */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1 items-center">
        {/* Near me */}
        <button
          type="button"
          onClick={() => onNearMeChange(!nearMe)}
          title={
            hasLocation
              ? `Chỉ hiện nhà hàng trong ${NEAR_ME_RADIUS_KM}km`
              : "Cần bật vị trí để dùng bộ lọc này"
          }
          className={`${chipBase} ${
            nearMe
              ? "bg-[#2ecc71] text-white shadow-md shadow-green-200"
              : "bg-white text-gray-600 border border-gray-100 hover:border-green-200"
          }`}
        >
          <span className="text-base">📍</span>
          Gần tôi
        </button>

        {/* Open now */}
        <button
          type="button"
          onClick={() => onOpenOnlyChange(!openOnly)}
          className={`${chipBase} ${
            openOnly
              ? "bg-[#2ecc71] text-white shadow-md shadow-green-200"
              : "bg-white text-gray-600 border border-gray-100 hover:border-green-200"
          }`}
        >
          <span className="text-base">🟢</span>
          Đang mở
        </button>

        {/* Min rating */}
        <select
          value={minRating}
          onChange={(e) => onMinRatingChange(Number(e.target.value))}
          aria-label="Lọc theo đánh giá"
          className={`${selectBase} ${
            minRating > 0
              ? "bg-[#ff6b35] text-white border-[#ff6b35] shadow-md shadow-orange-200"
              : "bg-white text-gray-600 border-gray-100 hover:border-orange-200"
          }`}
        >
          {RATING_OPTIONS.map((r) => (
            <option key={r} value={r} className="text-gray-700 bg-white">
              {r === 0 ? "⭐ Mọi đánh giá" : `⭐ Từ ${r.toFixed(1)} trở lên`}
            </option>
          ))}
        </select>

        {/* Max ship fee */}
        <select
          value={maxShipFee ?? ""}
          onChange={(e) =>
            onMaxShipFeeChange(
              e.target.value === "" ? null : Number(e.target.value),
            )
          }
          aria-label="Lọc theo phí ship"
          className={`${selectBase} ${
            maxShipFee != null
              ? "bg-[#ff6b35] text-white border-[#ff6b35] shadow-md shadow-orange-200"
              : "bg-white text-gray-600 border-gray-100 hover:border-orange-200"
          }`}
        >
          {SHIP_FEE_OPTIONS.map((fee) => (
            <option
              key={fee ?? "all"}
              value={fee ?? ""}
              className="text-gray-700 bg-white"
            >
              {fee == null
                ? "🚚 Mọi phí ship"
                : `🚚 Dưới ${(fee / 1000).toFixed(0)}k`}
            </option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => onSortByChange(e.target.value as SortOption)}
          aria-label="Sắp xếp"
          className={`${selectBase} bg-white text-gray-600 border-gray-100 hover:border-orange-200`}
        >
          {SORT_OPTIONS.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              disabled={
                (opt.value === "distance" || opt.value === "shipFee") &&
                !hasLocation
              }
              className="text-gray-700 bg-white"
            >
              Sắp xếp: {opt.label}
            </option>
          ))}
        </select>

        {/* Clear all */}
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className={`${chipBase} bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500`}
          >
            ✕ Xoá bộ lọc
            <span className="ml-0.5 bg-[#ff6b35] text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center">
              {activeFilterCount}
            </span>
          </button>
        )}
      </div>

      {/* ===== Row 2: categories (multi-select) ===== */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1 items-center">
        <button
          type="button"
          onClick={() => onToggleCategory("")}
          className={`${chipBase} ${
            selectedCategories.length === 0
              ? "bg-[#ff6b35] text-white shadow-md shadow-orange-200"
              : "bg-white text-gray-600 border border-gray-100 hover:border-orange-200"
          }`}
        >
          <span className="text-base">🍽️</span>
          Tất cả
        </button>
        {FOOD_CATEGORIES.map((cat) => {
          const active = selectedCategories.includes(cat.key);
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => onToggleCategory(cat.key)}
              className={`${chipBase} ${
                active
                  ? "bg-[#ff6b35] text-white shadow-md shadow-orange-200"
                  : "bg-white text-gray-600 border border-gray-100 hover:border-orange-200"
              }`}
            >
              <span className="text-base">{cat.icon}</span>
              {cat.label}
              {active && <span className="text-xs">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
