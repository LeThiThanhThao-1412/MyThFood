import { MenuItem } from "../../modules/merchant/domain/menu-item.entity";
import { MerchantId } from "../../modules/merchant/domain/merchant-id";

describe("MenuItem (option groups)", () => {
  const merchantId = MerchantId.create();

  const validGroup: any = {
    name: "Vị",
    type: "CHOICE",
    required: true,
    options: [
      { name: "Không cay", priceDelta: 0 },
      { name: "Cay vừa", priceDelta: 0 },
      { name: "Cay", priceDelta: 5000 },
    ],
  };

  describe("sanitizeOptionGroups", () => {
    it("returns empty array for undefined or empty input", () => {
      expect(MenuItem.sanitizeOptionGroups(undefined)).toEqual([]);
      expect(MenuItem.sanitizeOptionGroups([])).toEqual([]);
    });

    it("normalizes groups (generates ids, coerces priceDelta, defaults booleans)", () => {
      const groups = MenuItem.sanitizeOptionGroups([
        {
          name: "Món thêm",
          type: "MULTI_CHOICE",
          required: false,
          options: [{ name: "Thịt bò", priceDelta: 20000 }],
        } as any,
      ]);

      expect(groups).toHaveLength(1);
      const g = groups[0]!;
      expect(g.id).toBeTruthy();
      expect(g.name).toBe("Món thêm");
      expect(g.type).toBe("MULTI_CHOICE");
      expect(g.required).toBe(false);
      expect(g.minSelections).toBeNull();
      expect(g.maxSelections).toBeNull();
      expect(g.options).toHaveLength(1);
      expect(g.options[0]!.id).toBeTruthy();
      expect(g.options[0]!.priceDelta).toBe(20000);
      expect(g.options[0]!.isDefault).toBe(false);
      expect(g.options[0]!.minQuantity).toBeNull();
      expect(g.options[0]!.maxQuantity).toBeNull();
    });

    it("coerces string priceDelta to number", () => {
      const groups = MenuItem.sanitizeOptionGroups([
        {
          name: "Vị",
          type: "CHOICE",
          required: true,
          options: [{ name: "Cay", priceDelta: "5000" as any }],
        } as any,
      ]);
      expect(groups[0]!.options[0]!.priceDelta).toBe(5000);
    });

    it("throws when group name is empty", () => {
      expect(() =>
        MenuItem.sanitizeOptionGroups([
          {
            name: "  ",
            type: "CHOICE",
            required: true,
            options: [{ name: "Cay", priceDelta: 0 }],
          } as any,
        ]),
      ).toThrow("Option group name cannot be empty");
    });

    it("throws for invalid group type", () => {
      expect(() =>
        MenuItem.sanitizeOptionGroups([
          {
            name: "Vị",
            type: "INVALID",
            required: true,
            options: [{ name: "Cay", priceDelta: 0 }],
          } as any,
        ]),
      ).toThrow("Invalid option group type");
    });

    it("throws when an option name is empty", () => {
      expect(() =>
        MenuItem.sanitizeOptionGroups([
          {
            name: "Vị",
            type: "CHOICE",
            required: true,
            options: [{ name: "", priceDelta: 0 }],
          } as any,
        ]),
      ).toThrow("Option name cannot be empty");
    });

    it("throws when a group has no options", () => {
      expect(() =>
        MenuItem.sanitizeOptionGroups([
          { name: "Vị", type: "CHOICE", required: true, options: [] } as any,
        ]),
      ).toThrow('Option group "Vị" must have at least one option');
    });
  });

  describe("create with option groups", () => {
    it("stores and exposes option groups", () => {
      const item = MenuItem.create({
        merchantId,
        category: "MAIN_COURSE",
        name: "Bún Bò Huế",
        price: 50000,
        optionGroups: [validGroup],
      });

      expect(item.itemOptionGroups).toHaveLength(1);
      expect(item.itemOptionGroups[0]!.name).toBe("Vị");
      expect(item.itemOptionGroups[0]!.type).toBe("CHOICE");
      expect(item.itemOptionGroups[0]!.options).toHaveLength(3);
    });

    it("defaults to empty option groups when omitted", () => {
      const item = MenuItem.create({
        merchantId,
        category: "MAIN_COURSE",
        name: "Phở",
        price: 40000,
      });
      expect(item.itemOptionGroups).toEqual([]);
    });
  });

  describe("update option groups", () => {
    it("replaces option groups on update", () => {
      const item = MenuItem.create({
        merchantId,
        category: "MAIN_COURSE",
        name: "Bún Bò Huế",
        price: 50000,
        optionGroups: [validGroup],
      });

      item.update({
        optionGroups: [
          {
            name: "Hành",
            type: "TOGGLE",
            required: true,
            options: [{ name: "Có hành", priceDelta: 0 }],
          } as any,
        ],
      });

      expect(item.itemOptionGroups).toHaveLength(1);
      expect(item.itemOptionGroups[0]!.name).toBe("Hành");
      expect(item.itemOptionGroups[0]!.type).toBe("TOGGLE");
    });
  });

  describe("availability status", () => {
    it("defaults to AVAILABLE", () => {
      const item = MenuItem.create({
        merchantId,
        category: "X",
        name: "Y",
        price: 10000,
      });
      expect(item.available).toBe(true);
      expect(item.availabilityStatus).toBe("AVAILABLE");
      expect(item.outOfStockUntil).toBeNull();
    });

    it("markOutOfStock hides the item", () => {
      const item = MenuItem.create({
        merchantId,
        category: "X",
        name: "Y",
        price: 10000,
      });
      item.markOutOfStock();
      expect(item.available).toBe(false);
      expect(item.availabilityStatus).toBe("OUT_OF_STOCK");
    });

    it("markOutOfStockToday reopens after the due date", () => {
      const item = MenuItem.create({
        merchantId,
        category: "X",
        name: "Y",
        price: 10000,
      });
      item.markOutOfStockToday();
      expect(item.availabilityStatus).toBe("OUT_OF_STOCK_TODAY");
      expect(item.available).toBe(false);

      const until = item.outOfStockUntil!;
      expect(until.getTime()).toBeGreaterThan(Date.now());

      expect(item.reopenIfDue(new Date(until.getTime() - 1000))).toBe(false);
      expect(item.available).toBe(false);

      expect(item.reopenIfDue(new Date(until.getTime() + 1000))).toBe(true);
      expect(item.availabilityStatus).toBe("AVAILABLE");
      expect(item.available).toBe(true);
      expect(item.outOfStockUntil).toBeNull();
    });

    it("toggleAvailable toggles AVAILABLE <-> OUT_OF_STOCK", () => {
      const item = MenuItem.create({
        merchantId,
        category: "X",
        name: "Y",
        price: 10000,
      });
      item.toggleAvailable();
      expect(item.availabilityStatus).toBe("OUT_OF_STOCK");
      item.toggleAvailable();
      expect(item.availabilityStatus).toBe("AVAILABLE");
    });
  });
});
