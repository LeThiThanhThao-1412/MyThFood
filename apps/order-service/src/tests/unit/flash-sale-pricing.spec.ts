import { splitFlashSaleLines } from "../../modules/order/domain/flash-sale-pricing";

describe("splitFlashSaleLines", () => {
  const pricing = {
    originalPrice: 50000,
    salePrice: 25000,
    fundedBy: "MERCHANT",
    saleQuantity: 1,
  };

  it("keeps the whole line at normal price when there is no flash sale", () => {
    const lines = splitFlashSaleLines({ quantity: 3, unitPrice: 50000 }, null);
    expect(lines).toEqual([
      {
        quantity: 3,
        unitPrice: 50000,
        originalPrice: null,
        flashSaleFundedBy: null,
      },
    ]);
  });

  it("splits into a sale line and a normal-price line when over the limit", () => {
    const lines = splitFlashSaleLines(
      { quantity: 3, unitPrice: 25000 },
      pricing,
    );
    expect(lines).toEqual([
      {
        quantity: 1,
        unitPrice: 25000,
        originalPrice: 50000,
        flashSaleFundedBy: "MERCHANT",
      },
      {
        quantity: 2,
        unitPrice: 50000,
        originalPrice: null,
        flashSaleFundedBy: null,
      },
    ]);
    const foodTotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    expect(foodTotal).toBe(125000); // 1 * 25000 + 2 * 50000
  });

  it("keeps a single sale line when the whole quantity fits the quota", () => {
    const lines = splitFlashSaleLines(
      { quantity: 1, unitPrice: 25000 },
      pricing,
    );
    expect(lines).toEqual([
      {
        quantity: 1,
        unitPrice: 25000,
        originalPrice: 50000,
        flashSaleFundedBy: "MERCHANT",
      },
    ]);
  });

  it("charges normal price for everything when the quota is exhausted", () => {
    const lines = splitFlashSaleLines(
      { quantity: 2, unitPrice: 25000 },
      {
        ...pricing,
        saleQuantity: 0,
      },
    );
    // Giá client gửi là giá sale → phải dùng giá gốc do server biết.
    expect(lines).toEqual([
      {
        quantity: 2,
        unitPrice: 50000,
        originalPrice: null,
        flashSaleFundedBy: null,
      },
    ]);
  });

  it("never applies more sale units than the requested quantity", () => {
    const lines = splitFlashSaleLines(
      { quantity: 1, unitPrice: 25000 },
      {
        ...pricing,
        saleQuantity: 5,
      },
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      quantity: 1,
      unitPrice: 25000,
      originalPrice: 50000,
      flashSaleFundedBy: "MERCHANT",
    });
  });
});
