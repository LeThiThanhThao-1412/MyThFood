import {
  getMealPeriod,
  MEAL_PERIODS,
  deriveFoodTheme,
  dedupeByMerchant,
} from "./discovery";

describe("discovery.getMealPeriod", () => {
  const at = (h: number, m = 0) => new Date(2026, 0, 1, h, m);

  it("defines four meal periods", () => {
    expect(MEAL_PERIODS).toHaveLength(4);
  });

  it("maps early morning to breakfast", () => {
    expect(getMealPeriod(at(5)).key).toBe("breakfast");
    expect(getMealPeriod(at(6, 30)).key).toBe("breakfast");
    expect(getMealPeriod(at(10, 29)).key).toBe("breakfast");
  });

  it("maps midday to lunch", () => {
    expect(getMealPeriod(at(10, 30)).key).toBe("lunch");
    expect(getMealPeriod(at(12)).key).toBe("lunch");
    expect(getMealPeriod(at(14, 29)).key).toBe("lunch");
  });

  it("maps evening to dinner", () => {
    expect(getMealPeriod(at(14, 30)).key).toBe("dinner");
    expect(getMealPeriod(at(18)).key).toBe("dinner");
    expect(getMealPeriod(at(20, 59)).key).toBe("dinner");
  });

  it("maps late night across midnight", () => {
    expect(getMealPeriod(at(21)).key).toBe("late_night");
    expect(getMealPeriod(at(23, 59)).key).toBe("late_night");
    expect(getMealPeriod(at(0)).key).toBe("late_night");
    expect(getMealPeriod(at(4, 59)).key).toBe("late_night");
  });
});

describe("discovery.deriveFoodTheme", () => {
  it("returns null when there is no history", () => {
    expect(deriveFoodTheme([], [])).toBeNull();
  });

  it("derives from search history", () => {
    expect(deriveFoodTheme([], ["cháo lòng"])).toBe("cháo");
  });

  it("derives from order item names", () => {
    expect(deriveFoodTheme([{ items: [{ name: "Phở Bò Tái" }] }], [])).toBe(
      "phở",
    );
  });

  it("weights search history higher than order history", () => {
    expect(deriveFoodTheme([{ items: [{ name: "Phở Bò" }] }], ["cháo"])).toBe(
      "cháo",
    );
  });

  it("handles empty items arrays gracefully", () => {
    expect(deriveFoodTheme([{ items: [] }, null], [])).toBeNull();
  });
});

describe("discovery.dedupeByMerchant", () => {
  it("keeps only the first item per merchant", () => {
    const items = [
      { id: "a", merchantId: "m1" },
      { id: "b", merchantId: "m2" },
      { id: "c", merchantId: "m1" },
    ];
    expect(dedupeByMerchant(items).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("returns an empty array for empty input", () => {
    expect(dedupeByMerchant([])).toEqual([]);
  });
});
