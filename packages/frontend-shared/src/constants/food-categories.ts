/**
 * Food categories — single source of truth shared by consumer & merchant apps.
 *
 * `key` is what gets persisted in `merchants.primary_category` /
 * `merchants.secondary_categories` and what the API expects in
 * `?category=` / `?categories=`.
 *
 * Structure:
 *  - 1 danh mục CHÍNH (primary) duy nhất — "linh hồn" ẩm thực của quán.
 *  - 1..3 danh mục PHỤ (secondary/tags) — bổ sung ngách món, có thể thuộc bất
 *    kỳ danh mục chính nào.
 *  - "Khác" (OTHER) để nhà hàng mô tả món đặc biệt chưa có trong danh sách.
 */
export interface FoodCategory {
  key: string;
  icon: string;
  label: string;
  subCategories: FoodSubCategory[];
}

export interface FoodSubCategory {
  key: string;
  label: string;
  /** key của danh mục chính chứa danh mục phụ này. */
  parentKey: string;
}

export const OTHER_CATEGORY_KEY = "other";

export const PRIMARY_CATEGORIES: FoodCategory[] = [
  {
    key: "rice",
    icon: "🍚",
    label: "Cơm - Xôi - Cháo",
    subCategories: [
      { key: "com-tam", label: "Cơm tấm / Cơm văn phòng", parentKey: "rice" },
      { key: "com-ga", label: "Cơm gà / Cơm chiên", parentKey: "rice" },
      { key: "com-tron", label: "Cơm trộn / Cơm Hàn Quốc", parentKey: "rice" },
      { key: "xoi", label: "Xôi mặn / Xôi ngọt", parentKey: "rice" },
      { key: "chao", label: "Cháo lòng / Cháo dinh dưỡng / Cháo hàu", parentKey: "rice" },
    ],
  },
  {
    key: "noodles",
    icon: "🍜",
    label: "Bún - Phở - Mì - Hủ Tiếu",
    subCategories: [
      { key: "pho", label: "Phở (bò, gà, trộn)", parentKey: "noodles" },
      { key: "bun-bo-hue", label: "Bún bò Huế", parentKey: "noodles" },
      { key: "bun-rieu", label: "Bún riêu", parentKey: "noodles" },
      { key: "bun-mam", label: "Bún mắm", parentKey: "noodles" },
      { key: "bun-dau", label: "Bún đậu mắm tôm", parentKey: "noodles" },
      { key: "mi-quang", label: "Mì Quảng", parentKey: "noodles" },
      { key: "mi-xao", label: "Mì xào", parentKey: "noodles" },
      { key: "mi-ramen", label: "Mì Ramen / Mì Udon", parentKey: "noodles" },
      { key: "hu-tieu", label: "Hủ tiếu Nam Vang / Hủ tiếu gõ", parentKey: "noodles" },
      { key: "banh-da-cua", label: "Bánh đa cua", parentKey: "noodles" },
      { key: "banh-canh", label: "Bánh canh", parentKey: "noodles" },
    ],
  },
  {
    key: "drinks",
    icon: "🥤",
    label: "Trà sữa & Đồ uống",
    subCategories: [
      { key: "tra-sua", label: "Trà sữa trân châu", parentKey: "drinks" },
      { key: "tra-nuong", label: "Trà nướng", parentKey: "drinks" },
      { key: "tra-trai-cay", label: "Trà trái cây", parentKey: "drinks" },
      { key: "ca-phe", label: "Cà phê (sữa đá, bạc xỉu, espresso, cold brew)", parentKey: "drinks" },
      { key: "sinh-to", label: "Sinh tố", parentKey: "drinks" },
      { key: "nuoc-ep", label: "Nước ép", parentKey: "drinks" },
      { key: "do-uong-dua", label: "Đồ uống dừa", parentKey: "drinks" },
      { key: "rau-ma", label: "Rau má", parentKey: "drinks" },
      { key: "milk-tea-topping", label: "Milk tea & Topping", parentKey: "drinks" },
    ],
  },
  {
    key: "snacks",
    icon: "🍢",
    label: "Bánh mì & Ăn vặt",
    subCategories: [
      { key: "banh-mi", label: "Bánh mì Việt Nam", parentKey: "snacks" },
      { key: "banh-kep", label: "Bánh kẹp", parentKey: "snacks" },
      { key: "burger", label: "Burger / Sandwich", parentKey: "snacks" },
      { key: "an-vat-duong-pho", label: "Ăn vặt đường phố", parentKey: "snacks" },
      { key: "ga-ran", label: "Gà rán", parentKey: "snacks" },
      { key: "khoai-tay-chien", label: "Khoai tây chiên", parentKey: "snacks" },
    ],
  },
  {
    key: "international",
    icon: "🌍",
    label: "Ẩm thực Quốc tế",
    subCategories: [
      { key: "mon-viet", label: "Món Việt", parentKey: "international" },
      { key: "mon-han", label: "Món Hàn Quốc", parentKey: "international" },
      { key: "mon-nhat", label: "Món Nhật Bản", parentKey: "international" },
      { key: "mon-trung", label: "Món Trung Hoa", parentKey: "international" },
      { key: "mon-au-my", label: "Món Âu - Mỹ", parentKey: "international" },
      { key: "mon-thai", label: "Món Thái", parentKey: "international" },
      { key: "mon-an-do", label: "Món Ấn Độ", parentKey: "international" },
    ],
  },
  {
    key: "hotpot",
    icon: "🍲",
    label: "Lẩu & Nướng",
    subCategories: [
      { key: "lau-thai", label: "Lẩu Thái", parentKey: "hotpot" },
      { key: "lau-tu-xuyen", label: "Lẩu Tứ Xuyên", parentKey: "hotpot" },
      { key: "lau-mam", label: "Lẩu mắm", parentKey: "hotpot" },
      { key: "lau-bo", label: "Lẩu bò", parentKey: "hotpot" },
      { key: "do-nuong-bbq", label: "Đồ nướng BBQ", parentKey: "hotpot" },
      { key: "xien-nuong", label: "Xiên nướng", parentKey: "hotpot" },
      { key: "mon-nhau", label: "Món nhậu", parentKey: "hotpot" },
      { key: "hai-san", label: "Hải sản tươi sống", parentKey: "hotpot" },
    ],
  },
  {
    key: "dessert",
    icon: "🍰",
    label: "Tráng miệng",
    subCategories: [
      { key: "banh-kem", label: "Bánh kem / Bánh sinh nhật", parentKey: "dessert" },
      { key: "pastry", label: "Pastry", parentKey: "dessert" },
      { key: "che", label: "Chè", parentKey: "dessert" },
      { key: "tau-pho", label: "Tàu phớ", parentKey: "dessert" },
      { key: "suong-sa", label: "Sương sa hạt lựu", parentKey: "dessert" },
      { key: "kem", label: "Kem", parentKey: "dessert" },
      { key: "bingsu", label: "Bingsu", parentKey: "dessert" },
      { key: "yogurt", label: "Yogurt", parentKey: "dessert" },
    ],
  },
  {
    key: "healthy",
    icon: "🥗",
    label: "Healthy & Chay",
    subCategories: [
      { key: "com-chay", label: "Cơm chay", parentKey: "healthy" },
      { key: "bun-chay", label: "Bún chay", parentKey: "healthy" },
      { key: "salad", label: "Salad", parentKey: "healthy" },
      { key: "poke-bowl", label: "Poke Bowl", parentKey: "healthy" },
      { key: "clean-eating", label: "Clean Eating", parentKey: "healthy" },
      { key: "mon-chay-thuc-duong", label: "Món Chay Thực Dưỡng", parentKey: "healthy" },
    ],
  },
];

/**
 * Danh sách phẳng toàn bộ danh mục phụ (secondary) trên tất cả danh mục chính.
 * Dùng cho form đăng ký / cài đặt nhà hàng.
 */
export const SECONDARY_CATEGORIES: FoodSubCategory[] = PRIMARY_CATEGORIES.flatMap(
  (p) => p.subCategories.map((s) => ({ ...s, parentKey: p.key })),
);

/**
 * Danh sách danh mục CHÍNH — dùng cho bộ lọc tìm kiếm của khách hàng
 * (dashboard + RestaurantFilterBar) và lựa chọn primary của nhà hàng.
 */
export const FOOD_CATEGORIES: FoodCategory[] = PRIMARY_CATEGORIES;

/** Pseudo-category used by list screens to clear the category filter. */
export const ALL_CATEGORY: FoodCategory = {
  key: "",
  icon: "🍽️",
  label: "Tất cả",
  subCategories: [],
};

const PRIMARY_KEY_INDEX = new Map(
  PRIMARY_CATEGORIES.map((c) => [c.key, c] as const),
);
const SECONDARY_KEY_INDEX = new Map(
  SECONDARY_CATEGORIES.map((c) => [c.key, c] as const),
);

export function getFoodCategoryLabel(key?: string | null): string {
  if (!key) return "";
  if (key === OTHER_CATEGORY_KEY) return "Khác";
  return (
    PRIMARY_KEY_INDEX.get(key)?.label ??
    SECONDARY_KEY_INDEX.get(key)?.label ??
    key
  );
}

export function getSecondaryCategoryLabel(key?: string | null): string {
  if (!key) return "";
  if (key === OTHER_CATEGORY_KEY) return "Khác";
  return SECONDARY_KEY_INDEX.get(key)?.label ?? key;
}

