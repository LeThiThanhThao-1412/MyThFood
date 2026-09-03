/**
 * Food categories — single source of truth shared by consumer & merchant apps.
 *
 * `key` is what gets persisted in `merchants.primary_category` /
 * `merchants.secondary_categories` and what the API expects in
 * `?category=` / `?categories=`.
 */
export interface FoodCategory {
  key: string;
  icon: string;
  label: string;
}

export const FOOD_CATEGORIES: FoodCategory[] = [
  { key: "pho", icon: "🍜", label: "Phở" },
  { key: "rice", icon: "🍚", label: "Cơm" },
  { key: "drink", icon: "🥤", label: "Đồ uống" },
  { key: "snack", icon: "🍢", label: "Ăn vặt" },
  { key: "sushi", icon: "🍣", label: "Nhật" },
];

/** Pseudo-category used by list screens to clear the category filter. */
export const ALL_CATEGORY: FoodCategory = {
  key: "",
  icon: "🍽️",
  label: "Tất cả",
};

export function getFoodCategoryLabel(key?: string | null): string {
  if (!key) return "";
  const found = FOOD_CATEGORIES.find((c) => c.key === key);
  return found ? found.label : key;
}
