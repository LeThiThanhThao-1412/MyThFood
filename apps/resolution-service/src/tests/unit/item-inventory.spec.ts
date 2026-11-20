import type { CaseOrderItem } from "../../modules/assistant/domain/assistant.types";
import type { InventoryLabel } from "../../modules/assistant/domain/item-inventory";
import {
  compareInventory,
  describeInventory,
  itemNamesMatch,
  normalizeItemName,
  toVisibleItemsText,
} from "../../modules/assistant/domain/item-inventory";

/** Đơn ord-A trong bộ test-data/ai-eval: 2 mì xào bò + 1 gà rán. */
const ORDER_A: CaseOrderItem[] = [
  { menuItemId: "m-mi-bo", name: "Mì xào bò", quantity: 2, unitPrice: 55000 },
  { menuItemId: "m-ga-ran", name: "Gà rán", quantity: 1, unitPrice: 75000 },
];

/** Đơn ord-B: 1 cơm gà xối mỡ + 2 trà đào. */
const ORDER_B: CaseOrderItem[] = [
  {
    menuItemId: "m-com-ga",
    name: "Cơm gà xối mỡ",
    quantity: 1,
    unitPrice: 65000,
  },
  { menuItemId: "m-tra-dao", name: "Trà đào", quantity: 2, unitPrice: 40000 },
];

function label(
  partial: Partial<InventoryLabel> & Pick<InventoryLabel, "items">,
): InventoryLabel {
  return {
    countable: true,
    coverage: "all_items",
    sealed: false,
    ...partial,
  };
}

describe("item-inventory / normalizeItemName", () => {
  it("bỏ dấu, hạ chữ thường", () => {
    expect(normalizeItemName("Mì Xào Bò")).toBe("mi xao bo");
    expect(normalizeItemName("Đặc Biệt")).toBe("dac biet");
  });

  it("bỏ nhãn phần/hộp/suất và dấu câu", () => {
    expect(normalizeItemName("Mì xào bò (phần)")).toBe("mi xao bo");
    expect(normalizeItemName("Gà rán - hộp 1")).toBe("ga ran 1");
  });

  it("chuỗi rỗng/rác trả chuỗi rỗng, không throw", () => {
    expect(normalizeItemName("")).toBe("");
    expect(normalizeItemName("   ")).toBe("");
    expect(normalizeItemName(null as unknown as string)).toBe("");
  });
});

describe("item-inventory / itemNamesMatch", () => {
  it("trùng khít sau chuẩn hoá", () => {
    expect(itemNamesMatch("Mì xào bò", "mì xào bò")).toBe(true);
  });

  it("một bên là tên dài hơn của cùng món", () => {
    expect(itemNamesMatch("Mì xào bò", "Mì xào bò đặc biệt")).toBe(true);
    expect(itemNamesMatch("Cơm gà", "Cơm gà xối mỡ")).toBe(true);
    expect(itemNamesMatch("Há cảo hấp", "há cảo")).toBe(true);
  });

  it("KHÁC protein thì phải KHÔNG khớp (đây là cái vụ SAI MÓN cần phân biệt)", () => {
    expect(itemNamesMatch("Mì xào bò", "Mì xào gà")).toBe(false);
    expect(itemNamesMatch("Cơm tấm", "Cơm gà xối mỡ")).toBe(false);
    expect(itemNamesMatch("Gà rán", "Gà quay")).toBe(false);
  });

  it("một bên rỗng thì không khớp", () => {
    expect(itemNamesMatch("", "Mì xào bò")).toBe(false);
    expect(itemNamesMatch("Mì xào bò", "   ")).toBe(false);
  });
});

describe("item-inventory / compareInventory — các cửa chặn UNCLEAR", () => {
  it("D1 không có món đã đặt ⇒ UNCLEAR, không có trần bồi thường", () => {
    const cmp = compareInventory(
      [],
      label({ items: [{ name: "Mì xào bò", quantity: 2 }] }),
    );
    expect(cmp.verdict).toBe("UNCLEAR");
    expect(cmp.missingValue).toBeNull();
    expect(cmp.reasons[0]).toContain("D1");
  });

  it("orderItems undefined ⇒ UNCLEAR (không đoán)", () => {
    expect(compareInventory(undefined, label({ items: [] })).verdict).toBe(
      "UNCLEAR",
    );
  });

  it("không có ảnh ⇒ UNCLEAR", () => {
    const cmp = compareInventory(ORDER_A, null);
    expect(cmp.verdict).toBe("UNCLEAR");
    expect(cmp.reasons[0]).toContain("Không có ảnh");
  });

  it("ảnh không thấy món nào ⇒ UNCLEAR", () => {
    expect(compareInventory(ORDER_A, label({ items: [] })).verdict).toBe(
      "UNCLEAR",
    );
  });

  it("ảnh chỉ bày MỘT PHẦN đơn ⇒ UNCLEAR (không kết luận thiếu)", () => {
    const cmp = compareInventory(
      ORDER_B,
      label({
        items: [{ name: "Cơm gà xối mỡ", quantity: 1 }],
        coverage: "partial",
      }),
    );
    expect(cmp.verdict).toBe("UNCLEAR");
    expect(cmp.reasons[0]).toContain("MỘT PHẦN");
  });

  it("không đếm được (túi kín/ảnh mờ) ⇒ UNCLEAR — luật 33", () => {
    const cmp = compareInventory(
      ORDER_A,
      label({ items: [{ name: "Mì xào bò", quantity: 2 }], countable: false }),
    );
    expect(cmp.verdict).toBe("UNCLEAR");
    expect(cmp.reasons[0]).toContain("không đếm được");
  });

  it("nhãn toàn dòng tên rỗng ⇒ UNCLEAR chứ không throw", () => {
    const cmp = compareInventory(
      ORDER_A,
      label({ items: [{ name: "   ", quantity: 2 }] }),
    );
    expect(cmp.verdict).toBe("UNCLEAR");
  });
});

describe("item-inventory / compareInventory — khớp đúng", () => {
  it("ảnh đủ 3 món như đơn ⇒ MATCH", () => {
    const cmp = compareInventory(
      ORDER_A,
      label({
        items: [
          { menuItemId: "m-mi-bo", name: "Mì xào bò", quantity: 2 },
          { menuItemId: "m-ga-ran", name: "Gà rán", quantity: 1 },
        ],
        boxes: 3,
        sealed: true,
      }),
    );
    expect(cmp.verdict).toBe("MATCH");
    expect(cmp.missing).toEqual([]);
    expect(cmp.extra).toEqual([]);
    expect(cmp.matchedQuantity).toBe(3);
    expect(cmp.missingValue).toBe(0);
    expect(cmp.faultHint).toBeNull();
  });

  it("menuItemId thắng tên (model đọc tên lệch vẫn khớp đúng)", () => {
    const cmp = compareInventory(
      ORDER_A,
      label({
        items: [
          { menuItemId: "m-mi-bo", name: "Bún xào", quantity: 2 },
          { menuItemId: "m-ga-ran", name: "Gà chiên", quantity: 1 },
        ],
      }),
    );
    expect(cmp.verdict).toBe("MATCH");
    expect(cmp.matchedQuantity).toBe(3);
  });

  it("ảnh chỉ có 1 trong 2 mì ⇒ MISSING 1 phần, matchedQuantity = 2", () => {
    const cmp = compareInventory(
      ORDER_A,
      label({
        items: [
          { name: "Mì xào bò", quantity: 1 },
          { name: "Gà rán", quantity: 1 },
        ],
      }),
    );
    expect(cmp.verdict).toBe("MISSING");
    expect(cmp.missing).toEqual([
      { menuItemId: "m-mi-bo", name: "Mì xào bò", quantity: 1 },
    ]);
    expect(cmp.matchedQuantity).toBe(2);
  });
});

describe("item-inventory / compareInventory — tên CHUNG hơn thực đơn (đo thật 07/11/2026)", () => {
  const ORDER_BUN_DAU: CaseOrderItem[] = [
    { menuItemId: "m-bun-la", name: "bún lá", quantity: 1, unitPrice: 10000 },
    {
      menuItemId: "m-dau-hu",
      name: "đậu hũ chiên",
      quantity: 1,
      unitPrice: 15000,
    },
    {
      menuItemId: "m-thit-luoc",
      name: "thịt luộc",
      quantity: 1,
      unitPrice: 25000,
    },
    { menuItemId: "m-mam-tom", name: "mắm tôm", quantity: 1, unitPrice: 5000 },
  ];

  it("ảnh ghi 'bún'/'đậu' (tên chung) vẫn khớp đúng món đơn", () => {
    const cmp = compareInventory(
      ORDER_BUN_DAU,
      label({
        items: [
          { name: "bún", quantity: 1 },
          { name: "đậu", quantity: 1 },
          { name: "thịt lợn", quantity: 1 },
          { name: "mắm tôm", quantity: 1 },
        ],
        boxes: 4,
        sealed: true,
      }),
    );
    // "thịt lợn" KHÔNG phải tập con của "thịt luộc" ⇒ vẫn thiếu 1 phần thịt luộc
    // và dòng "thịt lợn" thành món THỪA ⇒ verdict EXTRA (thừa thắng thiếu)
    expect(cmp.matchedQuantity).toBe(3);
    expect(cmp.missing).toEqual([
      { menuItemId: "m-thit-luoc", name: "thịt luộc", quantity: 1 },
    ]);
    expect(cmp.extra).toEqual([
      { menuItemId: null, name: "thịt lợn", quantity: 1 },
    ]);
    expect(cmp.missingValue).toBe(25000);
    expect(cmp.verdict).toBe("EXTRA");
  });

  it("tên chung MƠ HỒ (đơn có cả 'bún lá' và 'bún chả') ⇒ không khớp bừa", () => {
    const cmp = compareInventory(
      [
        { menuItemId: "m-bun-la", name: "bún lá", quantity: 1 },
        { menuItemId: "m-bun-cha", name: "bún chả", quantity: 1 },
        { menuItemId: "m-mam-tom", name: "mắm tôm", quantity: 1 },
      ],
      label({
        items: [
          { name: "bún", quantity: 1 },
          { name: "mắm tôm", quantity: 1 },
        ],
      }),
    );
    expect(cmp.matchedQuantity).toBe(1);
    expect(cmp.missing.map((item) => item.name)).toEqual(["bún lá", "bún chả"]);
  });

  it("tên khác 2 token KHÔNG được coi là tập con ('chả giò' ≠ 'chả cốm')", () => {
    const cmp = compareInventory(
      [
        { menuItemId: "m-cha-com", name: "chả cốm", quantity: 1 },
        { menuItemId: "m-mam-tom", name: "mắm tôm", quantity: 1 },
      ],
      label({
        items: [
          { name: "chả giò", quantity: 1 },
          { name: "mắm tôm", quantity: 1 },
        ],
      }),
    );
    expect(cmp.matchedQuantity).toBe(1);
    expect(cmp.missing.map((item) => item.name)).toEqual(["chả cốm"]);
    expect(cmp.extra.map((item) => item.name)).toEqual(["chả giò"]);
  });
});

describe("item-inventory / compareInventory — lỗi TỪ VỰNG không được thành cáo buộc", () => {
  it("model gọi tên khác ngôn ngữ ⇒ UNCLEAR, KHÔNG phải EXTRA", () => {
    const cmp = compareInventory(
      [
        { menuItemId: "m-mi-y", name: "mì ý", quantity: 1 },
        { menuItemId: "m-khoai", name: "khoai tây chiên", quantity: 1 },
        { menuItemId: "m-nuoc", name: "nước ngọt", quantity: 1 },
      ],
      label({
        items: [
          { name: "spaghetti", quantity: 1 },
          { name: "fries", quantity: 1 },
          { name: "drinks", quantity: 1 },
        ],
        boxes: 3,
        sealed: true,
      }),
    );
    expect(cmp.verdict).toBe("UNCLEAR");
    expect(cmp.matchedQuantity).toBe(0);
    expect(cmp.missing).toEqual([]);
    expect(cmp.extra).toEqual([]);
    expect(cmp.missingValue).toBeNull();
    expect(cmp.faultHint).toBeNull();
    expect(cmp.reasons[0]).toContain("Không đối chiếu được tên món");
  });

  it("khớp được 1 món ⇒ vẫn kết luận bình thường (không chặn oan)", () => {
    const cmp = compareInventory(
      [
        { menuItemId: "m-ga", name: "gà rán", quantity: 1 },
        { menuItemId: "m-khoai", name: "khoai tây chiên", quantity: 1 },
      ],
      label({
        items: [
          { name: "gà rán", quantity: 1 },
          { name: "fries", quantity: 1 },
        ],
      }),
    );
    expect(cmp.verdict).toBe("EXTRA");
    expect(cmp.matchedQuantity).toBe(1);
    expect(cmp.missing.map((item) => item.name)).toEqual(["khoai tây chiên"]);
    expect(cmp.extra.map((item) => item.name)).toEqual(["fries"]);
  });
});

describe("item-inventory / compareInventory — quy trách nhiệm theo dấu niêm phong", () => {
  const shortByOne: InventoryLabel = label({
    items: [
      { name: "Mì xào bò", quantity: 1 },
      { name: "Gà rán", quantity: 1 },
    ],
  });

  it("túi đã mở ⇒ DRIVER (luật 33)", () => {
    const cmp = compareInventory(ORDER_A, { ...shortByOne, sealed: false });
    expect(cmp.faultHint).toBe("DRIVER");
    expect(cmp.reasons.join(" | ")).toContain("Túi đã mở");
  });

  it("túi còn niêm phong ⇒ MERCHANT (luật 33)", () => {
    const cmp = compareInventory(ORDER_A, { ...shortByOne, sealed: true });
    expect(cmp.faultHint).toBe("MERCHANT");
    expect(cmp.reasons.join(" | ")).toContain("niêm phong");
  });

  it("không rõ niêm phong ⇒ không quy trách nhiệm", () => {
    const cmp = compareInventory(ORDER_A, { ...shortByOne, sealed: null });
    expect(cmp.faultHint).toBeNull();
    expect(cmp.reasons.join(" | ")).toContain("chưa đủ căn cứ");
  });

  it("món thừa khi túi còn niêm phong ⇒ MERCHANT", () => {
    const cmp = compareInventory(
      ORDER_B,
      label({
        items: [
          { name: "Cơm sườn", quantity: 1 },
          { name: "Trà đào", quantity: 2 },
        ],
      }),
    );
    expect(cmp.verdict).toBe("EXTRA");
    expect(cmp.extra).toEqual([
      { menuItemId: null, name: "Cơm sườn", quantity: 1 },
    ]);
    expect(cmp.faultHint).toBe("MERCHANT");
  });

  it("món thừa khi túi đã mở trước ảnh giao hàng ⇒ DRIVER", () => {
    const cmp = compareInventory(
      ORDER_B,
      label({
        items: [
          { name: "Cơm sườn", quantity: 1 },
          { name: "Trà đào", quantity: 2 },
        ],
      }),
      { sealedAfterProof: false },
    );
    expect(cmp.verdict).toBe("EXTRA");
    expect(cmp.faultHint).toBe("DRIVER");
  });
});

describe("item-inventory / compareInventory — tiền bồi thường", () => {
  it("thiếu 1 mì ⇒ missingValue = 55 000", () => {
    const cmp = compareInventory(
      ORDER_A,
      label({
        items: [
          { name: "Mì xào bò", quantity: 1 },
          { name: "Gà rán", quantity: 1 },
        ],
      }),
    );
    expect(cmp.missingValue).toBe(55000);
  });

  it("không có đơn giá ⇒ missingValue null + cảnh báo, không đoán giá", () => {
    const cmp = compareInventory(
      [{ name: "Mì xào bò", quantity: 2 }],
      label({ items: [{ name: "Mì xào bò", quantity: 0 }] }),
    );
    expect(cmp.verdict).toBe("MISSING");
    expect(cmp.missingValue).toBeNull();
    expect(cmp.reasons.join(" | ")).toContain("đơn giá");
  });

  it("trần bồi thường không vượt tổng tiền đơn (luật 34)", () => {
    const cmp = compareInventory(
      [{ name: "Mì xào bò", quantity: 3, unitPrice: 55000 }],
      label({ items: [{ name: "Mì xào bò", quantity: 0 }] }),
      { orderTotalAmount: 100000 },
    );
    expect(cmp.missingValue).toBe(100000);
  });

  it("số lượng rác (âm / không phải số) coi như 0 ⇒ MISSING cả phần", () => {
    const cmp = compareInventory(
      ORDER_A,
      label({
        items: [
          { name: "Mì xào bò", quantity: -1 },
          { name: "Gà rán", quantity: Number.NaN },
        ],
      }),
    );
    expect(cmp.verdict).toBe("MISSING");
    expect(cmp.missingValue).toBe(185000);
  });
});

describe("item-inventory / tiện ích hiển thị", () => {
  it("describeInventory trả thiếu trước, thừa sau", () => {
    const cmp = compareInventory(
      ORDER_B,
      label({
        items: [
          { name: "Trà đào", quantity: 2 },
          { name: "Cơm sườn", quantity: 1 },
        ],
      }),
    );
    expect(describeInventory(cmp)).toEqual([
      { menuItemId: "m-com-ga", name: "Cơm gà xối mỡ", quantity: 1 },
      { menuItemId: null, name: "Cơm sườn", quantity: 1 },
    ]);
  });

  it("toVisibleItemsText gộp món + ghi chú hộp/niêm phong", () => {
    const lbl = label({
      items: [
        { name: "Mì xào bò", quantity: 2 },
        { name: "Gà rán", quantity: 1 },
      ],
      boxes: 3,
      sealed: true,
    });
    const cmp = compareInventory(ORDER_A, lbl);
    expect(toVisibleItemsText(cmp, lbl)).toBe(
      "Mì xào bò x2; Gà rán x1 (3 hộp/túi, còn niêm phong)",
    );
  });

  it("toVisibleItemsText với ảnh không có món", () => {
    expect(toVisibleItemsText(compareInventory(ORDER_A, null), null)).toBe(
      "không thấy món nào",
    );
  });

  it("không throw với dữ liệu rác", () => {
    const cmp = compareInventory([{ name: "Mì xào bò", quantity: 1 }], {
      items: [null as unknown as { name: string; quantity: number }],
      countable: true,
    });
    expect(cmp.verdict).toBe("UNCLEAR");
  });
});
