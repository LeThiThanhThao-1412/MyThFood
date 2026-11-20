import type {
  CaseMenuItemSnapshot,
  CaseOrderItem,
} from "../../modules/assistant/domain/assistant.types";
import { planImagePairs } from "../../modules/assistant/application/pair-plan";

function menuItem(
  over: Partial<CaseMenuItemSnapshot> & { name: string },
): CaseMenuItemSnapshot {
  return {
    menuItemId: null,
    description: null,
    price: null,
    originalPrice: null,
    imageUrl: null,
    isAvailable: true,
    availabilityStatus: null,
    outOfStockUntil: null,
    preparationTime: null,
    isFeatured: null,
    optionGroups: [],
    orderedQuantity: 1,
    orderUnitPrice: null,
    priceMismatch: null,
    ...over,
  };
}

const MENU: CaseMenuItemSnapshot[] = [
  menuItem({
    menuItemId: "m-comga",
    name: "Cơm gà",
    description: "Cơm gà xối mỡ kèm canh rong biển",
    price: 45000,
    imageUrl: "https://cdn.mythfood.test/menu/com-ga.jpg",
  }),
  menuItem({
    menuItemId: "m-tradao",
    name: "Trà đào",
    price: 20000,
    imageUrl: "https://cdn.mythfood.test/menu/tra-dao.jpg",
  }),
  menuItem({
    menuItemId: "m-chethai",
    name: "Chè thái",
    price: 25000,
    imageUrl: null,
  }),
];

const REPORTER = ["https://cdn.mythfood.test/complaints/1.jpg"];

const ORDER: CaseOrderItem[] = [
  { menuItemId: "m-comga", name: "Cơm gà", quantity: 1, unitPrice: 45000 },
  { menuItemId: "m-tradao", name: "Trà đào", quantity: 1, unitPrice: 20000 },
  { menuItemId: "m-chethai", name: "Chè thái", quantity: 1, unitPrice: 25000 },
];

describe("planImagePairs", () => {
  it("ghép cặp theo menuItemId và mang theo mô tả + đơn giá + ảnh khách", () => {
    const plan = planImagePairs({
      snapshot: {
        orderItems: ORDER,
        menuItems: MENU,
        reporterImageUrls: REPORTER,
      },
      maxPairs: 4,
    });
    expect(plan.targets).toHaveLength(2);
    const first = plan.targets[0];
    expect(first?.orderItemId).toBe("#1");
    expect(first?.menuItemId).toBe("m-comga");
    expect(first?.name).toBe("Cơm gà");
    expect(first?.description).toBe("Cơm gà xối mỡ kèm canh rong biển");
    expect(first?.unitPrice).toBe(45000);
    expect(first?.referenceUrl).toBe(
      "https://cdn.mythfood.test/menu/com-ga.jpg",
    );
    expect(first?.evidenceUrls).toEqual(REPORTER);
    expect(plan.skipped.map((skip) => skip.orderItemId)).toEqual(["#3"]);
    expect(plan.skipped[0]?.reason).toContain("chưa upload ảnh");
  });

  it("hai dòng cùng món (khác options) ⇒ MỘT cặp, số lượng cộng lại", () => {
    const plan = planImagePairs({
      snapshot: {
        orderItems: [
          {
            menuItemId: "m-tradao",
            name: "Trà đào",
            quantity: 1,
            options: "ít đá",
          },
          {
            menuItemId: "m-tradao",
            name: "Trà đào",
            quantity: 2,
            options: "nhiều đá",
          },
        ],
        menuItems: MENU,
        reporterImageUrls: REPORTER,
      },
      maxPairs: 4,
    });
    expect(plan.targets).toHaveLength(1);
    expect(plan.targets[0]?.orderItemIds).toEqual(["#1", "#2"]);
    expect(plan.targets[0]?.orderedQuantity).toBe(3);
  });

  it("khách không có ảnh tải được ⇒ không có cặp nào và nêu lý do cho từng dòng", () => {
    const plan = planImagePairs({
      snapshot: { orderItems: ORDER, menuItems: MENU, reporterImageUrls: [] },
      maxPairs: 4,
    });
    expect(plan.targets).toEqual([]);
    expect(plan.skipped).toHaveLength(3);
    expect(plan.skipped[0]?.reason).toContain("không có ảnh");
  });

  it("cắt theo maxPairs: giữ món ĐẮT TIỀN nhất, nhưng trả về theo thứ tự dòng đơn", () => {
    const plan = planImagePairs({
      snapshot: {
        orderItems: ORDER,
        menuItems: MENU,
        reporterImageUrls: REPORTER,
      },
      maxPairs: 1,
    });
    expect(plan.truncated).toBe(1);
    expect(plan.targets).toHaveLength(1);
    // Cơm gà 45k > Trà đào 20k ⇒ giữ cơm gà.
    expect(plan.targets[0]?.menuItemId).toBe("m-comga");

    const both = planImagePairs({
      snapshot: {
        orderItems: ORDER,
        menuItems: MENU,
        reporterImageUrls: REPORTER,
      },
      maxPairs: 2,
    });
    expect(both.targets.map((target) => target.orderItemId)).toEqual([
      "#1",
      "#2",
    ]);
  });

  it("món không gắn thực đơn: ghép theo tên khi khớp DUY NHẤT, bỏ khi mơ hồ", () => {
    const unique = planImagePairs({
      snapshot: {
        orderItems: [{ name: "Cơm gà", quantity: 1 }],
        menuItems: MENU,
        reporterImageUrls: REPORTER,
      },
      maxPairs: 4,
    });
    expect(unique.targets).toHaveLength(1);
    expect(unique.targets[0]?.menuItemId).toBeNull();

    const ambiguousMenu = [
      ...MENU,
      menuItem({
        menuItemId: "m-comga-2",
        name: "Cơm gà",
        imageUrl: "https://cdn.mythfood.test/menu/com-ga-2.jpg",
      }),
    ];
    const ambiguous = planImagePairs({
      snapshot: {
        orderItems: [{ name: "Cơm gà", quantity: 1 }],
        menuItems: ambiguousMenu,
        reporterImageUrls: REPORTER,
      },
      maxPairs: 4,
    });
    expect(ambiguous.targets).toEqual([]);
    expect(ambiguous.skipped[0]?.reason).toContain("không tìm được món");
  });

  it("đơn rỗng ⇒ kế hoạch rỗng (không lỗi)", () => {
    const plan = planImagePairs({
      snapshot: {
        orderItems: [],
        menuItems: MENU,
        reporterImageUrls: REPORTER,
      },
      maxPairs: 4,
    });
    expect(plan).toEqual({ targets: [], skipped: [], truncated: 0 });
  });
});
