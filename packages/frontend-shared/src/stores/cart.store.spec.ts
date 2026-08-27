import { computeUnitPrice, buildVariantKey, useCartStore } from "./cart.store";
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
