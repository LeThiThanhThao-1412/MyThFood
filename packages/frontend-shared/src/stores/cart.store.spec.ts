import {
  computeUnitPrice,
  buildVariantKey,
  computeCartItemPricing,
  computeCartLinePricing,
  computeCartSubtotal,
  useCartStore,
} from "./cart.store";
import type { CartItem } from "./cart.store";
import type { MenuItem, SelectedOptionGroup } from "@mythfood/api-client";

const menuItem = { id: "m1", price: 50000 } as MenuItem;

const groups: SelectedOptionGroup[] = [
  {
    groupId: "g1",
    groupName: "Vị",
    type: "CHOICE",
    options: [
      {
        optionId: "o1",
        groupId: "g1",
        groupName: "Vị",
        name: "Cay vừa",
        priceDelta: 0,
      },
    ],
  },
  {
    groupId: "g2",
    groupName: "Món thêm",
    type: "MULTI_CHOICE",
    options: [
      {
        optionId: "o2",
        groupId: "g2",
        groupName: "Món thêm",
        name: "Thịt bò",
        priceDelta: 20000,
      },
    ],
  },
  {
    groupId: "g3",
    groupName: "Bò viên",
    type: "QUANTITY",
    options: [
      {
        optionId: "o3",
        groupId: "g3",
        groupName: "Bò viên",
        name: "Bò viên",
        priceDelta: 7500,
        quantity: 2,
      },
    ],
  },
];

describe("computeUnitPrice", () => {
  it("returns base price when no groups", () => {
    expect(computeUnitPrice(menuItem)).toBe(50000);
  });

  it("sums price deltas across groups (including quantity multiplier)", () => {
    // 50000 + 0 + 20000 + (7500 * 2) = 85000
    expect(computeUnitPrice(menuItem, groups)).toBe(85000);
  });

  it("handles negative price deltas", () => {
    const g: SelectedOptionGroup[] = [
      {
        groupId: "g",
        groupName: "Giảm",
        type: "CHOICE",
        options: [
          {
            optionId: "o",
            groupId: "g",
            groupName: "Giảm",
            name: "Ít",
            priceDelta: -5000,
          },
        ],
      },
    ];
    expect(computeUnitPrice(menuItem, g)).toBe(45000);
  });
});

describe("buildVariantKey", () => {
  it("includes menu item id in the key", () => {
    expect(buildVariantKey(menuItem, groups).startsWith("m1::")).toBe(true);
  });

  it("produces the same key regardless of group order", () => {
    const a = buildVariantKey(menuItem, groups);
    const b = buildVariantKey(menuItem, [...groups].reverse());
    expect(a).toBe(b);
  });

  it("produces different keys for different selections", () => {
    const a = buildVariantKey(menuItem, groups);
    const b = buildVariantKey(menuItem, []);
    expect(a).not.toBe(b);
  });
});

describe("useCartStore addItem (variant merging)", () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], merchantId: null, merchantName: null });
  });

  it("merges quantity for identical variants", () => {
    useCartStore.getState().addItem({
      menuItem,
      quantity: 1,
      selectedGroups: groups,
      merchantId: "mer1",
      merchantName: "Mer 1",
    });
    useCartStore.getState().addItem({
      menuItem,
      quantity: 1,
      selectedGroups: groups,
      merchantId: "mer1",
      merchantName: "Mer 1",
    });

    const items = useCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(2);
    expect(items[0]!.unitPrice).toBe(85000);
    expect(items[0]!.variantKey).toBe("m1::g1:o1:1|g2:o2:1|g3:o3:2");
  });

  it("keeps separate items for different variants", () => {
    useCartStore.getState().addItem({
      menuItem,
      quantity: 1,
      selectedGroups: groups,
      merchantId: "mer1",
      merchantName: "Mer 1",
    });
    useCartStore.getState().addItem({
      menuItem,
      quantity: 1,
      selectedGroups: [],
      merchantId: "mer1",
      merchantName: "Mer 1",
    });

    expect(useCartStore.getState().items).toHaveLength(2);
  });

  it("computes subtotal using unitPrice", () => {
    useCartStore.getState().addItem({
      menuItem,
      quantity: 2,
      selectedGroups: groups,
      merchantId: "mer1",
      merchantName: "Mer 1",
    });
    expect(useCartStore.getState().getSubtotal()).toBe(170000); // 85000 * 2
  });

  it("clears cart when adding from a different merchant", () => {
    useCartStore.getState().addItem({
      menuItem,
      quantity: 1,
      selectedGroups: groups,
      merchantId: "mer1",
      merchantName: "Mer 1",
    });
    useCartStore.getState().addItem({
      menuItem,
      quantity: 1,
      selectedGroups: groups,
      merchantId: "mer2",
      merchantName: "Mer 2",
    });

    const items = useCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]!.merchantId).toBe("mer2");
  });
});

describe("computeCartItemPricing (flash sale limit per user)", () => {
  const flashItem = (overrides: Partial<CartItem> = {}): CartItem => ({
    menuItem,
    quantity: 1,
    unitPrice: 25000,
    originalUnitPrice: 50000,
    flashSaleLimitPerUser: 1,
    variantKey: "m1::",
    merchantId: "mer1",
    merchantName: "Mer 1",
    ...overrides,
  });

  it("applies sale price only to the quota, the rest at normal price", () => {
    const pricing = computeCartItemPricing(flashItem({ quantity: 3 }));
    expect(pricing.saleQuantity).toBe(1);
    expect(pricing.regularQuantity).toBe(2);
    expect(pricing.saleUnitPrice).toBe(25000);
    expect(pricing.regularUnitPrice).toBe(50000);
    // 1 * 25000 + 2 * 50000
    expect(pricing.amount).toBe(125000);
    expect(pricing.originalAmount).toBe(150000);
  });

  it("applies sale price to the whole quantity when under the limit", () => {
    const pricing = computeCartItemPricing(flashItem({ quantity: 1 }));
    expect(pricing.saleQuantity).toBe(1);
    expect(pricing.regularQuantity).toBe(0);
    expect(pricing.amount).toBe(25000);
  });

  it("uses the server quota when provided", () => {
    // Khách đã dùng hết suất trước đó → toàn bộ tính giá thường.
    const pricing = computeCartItemPricing(flashItem({ quantity: 2 }), 0);
    expect(pricing.saleQuantity).toBe(0);
    expect(pricing.regularQuantity).toBe(2);
    expect(pricing.amount).toBe(100000);
  });

  it("keeps regular items untouched", () => {
    const pricing = computeCartItemPricing({
      menuItem,
      quantity: 2,
      unitPrice: 50000,
      variantKey: "m1::",
      merchantId: "mer1",
      merchantName: "Mer 1",
    });
    expect(pricing.isFlashSale).toBe(false);
    expect(pricing.amount).toBe(100000);
  });
});

describe("computeCartSubtotal (flash sale quota per menu item)", () => {
  const flashItem = (overrides: Partial<CartItem> = {}): CartItem => ({
    menuItem,
    quantity: 1,
    unitPrice: 25000,
    originalUnitPrice: 50000,
    flashSaleLimitPerUser: 1,
    variantKey: "m1::",
    merchantId: "mer1",
    merchantName: "Mer 1",
    ...overrides,
  });

  it("splits quota across lines of the same menu item", () => {
    const items = [
      flashItem({ variantKey: "m1::a" }),
      flashItem({ variantKey: "m1::b" }),
    ];
    // 1 suất sale cho dòng đầu, dòng sau giá thường.
    expect(computeCartSubtotal(items)).toBe(25000 + 50000);
  });

  it("returns per-line pricing consistent with the subtotal", () => {
    const items = [
      flashItem({ variantKey: "m1::a" }),
      flashItem({ variantKey: "m1::b" }),
    ];
    const lines = computeCartLinePricing(items);
    expect(lines.map((l) => l.pricing.saleQuantity)).toEqual([1, 0]);
    expect(lines.map((l) => l.pricing.amount)).toEqual([25000, 50000]);
    expect(lines.reduce((s, l) => s + l.pricing.amount, 0)).toBe(
      computeCartSubtotal(items),
    );
  });

  it("prefers the server quota when given", () => {
    const items = [flashItem({ quantity: 3 })];
    expect(computeCartSubtotal(items, { m1: 2 })).toBe(2 * 25000 + 1 * 50000);
    expect(computeCartSubtotal(items, { m1: 0 })).toBe(3 * 50000);
  });

  it("falls back to the legacy behaviour for carts without the limit", () => {
    const items = [
      flashItem({ quantity: 3, flashSaleLimitPerUser: undefined }),
    ];
    expect(computeCartSubtotal(items)).toBe(3 * 25000);
  });
});
