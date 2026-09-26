/**
 * Discovery helpers for the consumer dashboard:
 * - meal-period resolution (breakfast / lunch / dinner / late-night)
 * - deriving a food theme from order + search history
 * - de-duplicating dish lists so each restaurant contributes at most one item.
 */

export interface MealPeriod {
  key: "breakfast" | "lunch" | "dinner" | "late_night";
  label: string;
  icon: string;
  /** Hour windows [start, end). Overnight periods are split into two windows. */
  hours: Array<[number, number]>;
  /** Dish keywords used to build the "món theo bữa" section. */
  keywords: string[];
}

export const MEAL_PERIODS: MealPeriod[] = [
  {
    key: "breakfast",
    label: "Bữa sáng",
    icon: "🌅",
    hours: [[5, 10.5]],
    keywords: ["cháo", "phở", "bánh mì", "xôi", "bún"],
  },
  {
    key: "lunch",
    label: "Bữa trưa",
    icon: "☀️",
    hours: [[10.5, 14.5]],
    keywords: ["cơm", "bún", "phở", "mì"],
  },
  {
    key: "dinner",
    label: "Bữa tối",
    icon: "🌙",
    hours: [[14.5, 21]],
    keywords: ["cơm", "lẩu", "bún", "gà", "bò"],
  },
  {
    key: "late_night",
    label: "Đêm khuya",
    icon: "🌃",
    hours: [
      [21, 24],
      [0, 5],
    ],
    keywords: ["cháo", "mì", "trà sữa", "xiên"],
  },
];

/** Resolve the current meal period for a given date (defaults to now). */
export function getMealPeriod(date: Date = new Date()): MealPeriod {
  const hour = date.getHours() + date.getMinutes() / 60;
  for (const period of MEAL_PERIODS) {
    for (const [start, end] of period.hours) {
      if (hour >= start && hour < end) {
        return period;
      }
    }
  }
  // Fallback (shouldn't happen given the windows cover 0-24).
  return MEAL_PERIODS[MEAL_PERIODS.length - 1];
}

/** Curated dish keywords, ordered by specificity (longer matches win ties). */
const FOOD_THEME_KEYWORDS = [
  "bánh mì",
  "bánh canh",
  "bánh cuốn",
  "bánh xèo",
  "bún",
  "phở",
  "cháo",
  "cơm tấm",
  "cơm",
  "mì",
  "hủ tiếu",
  "miến",
  "xôi",
  "lẩu",
  "gà",
  "bò",
  "trà sữa",
  "cà phê",
  "chè",
  "kem",
  "sushi",
  "ăn vặt",
];

/**
 * Derive a single food theme (e.g. "cháo") from the customer's search history
 * and order history. Search history is weighted higher than order items.
 * Returns null when there is not enough signal.
 */
export function deriveFoodTheme(
  orders: any[],
  searchKeywords: string[],
): string | null {
  const searchCorpus: string[] = (searchKeywords ?? [])
    .map((k) =>
      String(k ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);

  const orderCorpus: string[] = [];
  for (const order of orders ?? []) {
    for (const item of order?.items ?? []) {
      const name = String(item?.name ?? "")
        .trim()
        .toLowerCase();
      if (name) orderCorpus.push(name);
    }
  }

  if (searchCorpus.length === 0 && orderCorpus.length === 0) {
    return null;
  }

  let best: string | null = null;
  let bestScore = 0;

  for (const keyword of FOOD_THEME_KEYWORDS) {
    let score = 0;
    for (const text of searchCorpus) {
      if (text.includes(keyword)) score += 3;
    }
    for (const text of orderCorpus) {
      if (text.includes(keyword)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = keyword;
    }
  }

  return best;
}

/**
 * Keep only the first item per merchant (used so a dish list never shows
 * several dishes from the same restaurant).
 */
export function dedupeByMerchant<T extends { merchantId: string }>(
  items: T[],
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items ?? []) {
    const merchantId = item?.merchantId;
    if (!merchantId || seen.has(merchantId)) continue;
    seen.add(merchantId);
    result.push(item);
  }
  return result;
}
