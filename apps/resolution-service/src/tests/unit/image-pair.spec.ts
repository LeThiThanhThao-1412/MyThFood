import type { CaseOrderItem } from "../../modules/assistant/domain/assistant.types";
import {
  DEFAULT_WRONG_ITEM_SIMILARITY,
  describePairs,
  parsePairReading,
  scoreImagePairs,
  type PairAttempt,
  type PairImageReading,
} from "../../modules/assistant/domain/image-pair";
import { scoreImageMatch } from "../../modules/assistant/domain/image-match";

/** Đơn 3 dòng: cơm gà ×1, trà đào ×2, chè thái ×1. */
const ORDER: CaseOrderItem[] = [
  { menuItemId: "m-comga", name: "Cơm gà", quantity: 1, unitPrice: 45000 },
  { menuItemId: "m-tradao", name: "Trà đào", quantity: 2, unitPrice: 20000 },
  { menuItemId: "m-chethai", name: "Chè thái", quantity: 1, unitPrice: 25000 },
];

function attempt(
  orderItemId: string,
  name: string,
  orderedQuantity: number,
  reading: PairImageReading | null,
  orderItemIds: string[] = [orderItemId],
): PairAttempt {
  return {
    orderItemId,
    orderItemIds,
    menuItemId: null,
    name,
    orderedQuantity,
    reading,
  };
}

/** Câu trả lời "đúng món, đếm được N phần, thấy trọn khung". */
function good(
  quantitySeen: number,
  extra: PairImageReading = {},
): PairImageReading {
  return {
    nameSeen: "",
    quantitySeen,
    sameDish: true,
    similarityPercent: 80,
    countable: true,
    coverage: "all_items",
    ...extra,
  };
}

describe("parsePairReading", () => {
  it("chuẩn hoá kiểu và chặn % ngoài 0–100", () => {
    const parsed = parsePairReading({
      nameSeen: " Cơm gà ",
      quantitySeen: "3.9" as unknown as number,
      sameDish: true,
      similarityPercent: 145,
      countable: true,
      coverage: "all_items",
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.nameSeen).toBe("Cơm gà");
    expect(parsed?.quantitySeen).toBe(3);
    expect(parsed?.similarityPercent).toBe(100);
  });

  it("thiếu cả sameDish và similarityPercent ⇒ không đọc được (null), không đoán", () => {
    expect(parsePairReading({ nameSeen: "Cơm gà" })).toBeNull();
    expect(parsePairReading(null)).toBeNull();
    expect(parsePairReading(undefined)).toBeNull();
  });

  it("sameDish thiếu ⇒ false (không tự tạo kết luận 'đúng món' từ dữ liệu khuyết)", () => {
    const parsed = parsePairReading({ similarityPercent: 70, countable: true });
    expect(parsed?.sameDish).toBe(false);
  });
});

describe("scoreImagePairs", () => {
  it("số phần lấy MAX theo món, KHÔNG cộng dồn giữa các cặp", () => {
    const summary = scoreImagePairs({
      attempts: [
        attempt("#1", "Cơm gà", 1, good(1)),
        // Ảnh thứ hai chụp CÙNG hộp đó: đếm lại 1 ⇒ vẫn là 1, không phải 2.
        attempt("#1", "Cơm gà", 1, good(1)),
      ],
      orderItems: [ORDER[0] as CaseOrderItem],
      totalTargets: 1,
    });
    expect(summary.items).toEqual([{ name: "Cơm gà", quantity: 1 }]);
    expect(summary.pairs).toHaveLength(2);
  });

  it("MAX chọn ảnh đếm được NHIỀU nhất, và không vượt số phần đã đặt", () => {
    const summary = scoreImagePairs({
      attempts: [
        attempt("#2", "Trà đào", 2, good(1)),
        attempt("#2", "Trà đào", 2, good(2)),
        attempt("#2", "Trà đào", 2, good(5)),
      ],
      orderItems: [ORDER[1] as CaseOrderItem],
      totalTargets: 1,
    });
    expect(summary.items).toEqual([{ name: "Trà đào", quantity: 2 }]);
  });

  it("khiếm khuyết: đọc được 2/3 cặp nhưng thiếu 1 món ⇒ KHÔNG được ghi đè", () => {
    const summary = scoreImagePairs({
      attempts: [
        attempt("#1", "Cơm gà", 1, good(1)),
        attempt(
          "#2",
          "Trà đào",
          2,
          good(0, { countable: false, coverage: "unknown" }),
        ),
      ],
      orderItems: ORDER,
      totalTargets: 3,
    });
    expect(summary.pairsReadable).toBe(2);
    expect(summary.fullCoverage).toBe(false);
    expect(summary.canOverride).toBe(false);
    expect(summary.items).toEqual([{ name: "Cơm gà", quantity: 1 }]);
  });

  it("đủ mọi món, đếm được, không bị cắt ⇒ được ghi đè", () => {
    const summary = scoreImagePairs({
      attempts: [
        attempt("#1", "Cơm gà", 1, good(1)),
        attempt("#2", "Trà đào", 2, good(2)),
        attempt("#3", "Chè thái", 1, good(0)),
      ],
      orderItems: ORDER,
      totalTargets: 3,
    });
    expect(summary.fullCoverage).toBe(true);
    expect(summary.similarityAvg).toBe(80);
    expect(summary.canOverride).toBe(true);
    // Chè thái đếm được 0 phần ⇒ vắng khỏi nhãn ⇒ lớp chấm điểm cũ thấy là THIẾU.
    expect(summary.items.map((item) => item.name)).toEqual([
      "Cơm gà",
      "Trà đào",
    ]);
  });

  it("món KHÁC LOẠI (sameDish=false) không được tính là đã giao và bị nêu riêng", () => {
    const summary = scoreImagePairs({
      attempts: [
        attempt("#1", "Cơm gà", 1, {
          nameSeen: "Cơm sườn",
          quantitySeen: 1,
          sameDish: false,
          similarityPercent: 20,
          countable: true,
          coverage: "all_items",
        }),
      ],
      orderItems: [ORDER[0] as CaseOrderItem],
      totalTargets: 1,
    });
    expect(summary.items).toEqual([]);
    expect(summary.wrongItems[0]).toContain("#1 · Cơm gà");
    expect(summary.wrongItems[0]).toContain("giống 20 %");
    expect(summary.wrongItems[0]).toContain("Cơm sườn");
    expect(summary.pairs[0]?.sameDish).toBe(false);
  });

  it("sameDish=true nhưng % tương đồng ≤ ngưỡng vẫn bị coi là SAI MÓN", () => {
    const summary = scoreImagePairs({
      attempts: [
        attempt("#1", "Cơm gà", 1, {
          quantitySeen: 1,
          sameDish: true,
          similarityPercent: DEFAULT_WRONG_ITEM_SIMILARITY - 5,
          countable: true,
          coverage: "all_items",
        }),
      ],
      orderItems: [ORDER[0] as CaseOrderItem],
      totalTargets: 1,
    });
    expect(summary.pairs[0]?.sameDish).toBe(false);
    expect(summary.items).toEqual([]);
  });

  it("ảnh khách bị cắt (coverage=partial) ⇒ không ghi đè dù đủ số cặp", () => {
    const summary = scoreImagePairs({
      attempts: [
        attempt("#1", "Cơm gà", 1, good(1, { coverage: "partial" })),
        attempt("#2", "Trà đào", 2, good(2, { coverage: "partial" })),
      ],
      orderItems: ORDER.slice(0, 2) as CaseOrderItem[],
      totalTargets: 2,
    });
    expect(summary.fullCoverage).toBe(true);
    expect(summary.coverage).toBe("partial");
    expect(summary.canOverride).toBe(false);
  });

  it("một cặp nói all_items ⇒ coverage gộp là all_items", () => {
    const summary = scoreImagePairs({
      attempts: [
        attempt("#1", "Cơm gà", 1, good(1, { coverage: "unknown" })),
        attempt("#2", "Trà đào", 2, good(2, { coverage: "all_items" })),
      ],
      orderItems: ORDER.slice(0, 2) as CaseOrderItem[],
      totalTargets: 2,
    });
    expect(summary.coverage).toBe("all_items");
  });

  it("cặp lỗi (reading=null) bị loại khỏi mẫu số và ghi vào missing", () => {
    const summary = scoreImagePairs({
      attempts: [
        attempt("#1", "Cơm gà", 1, good(1)),
        attempt("#2", "Trà đào", 2, null),
      ],
      orderItems: ORDER.slice(0, 2) as CaseOrderItem[],
      totalTargets: 2,
    });
    expect(summary.pairsReadable).toBe(1);
    expect(summary.unpairedOrderItemIds).toEqual(["#2"]);
    expect(summary.enoughPairs).toBe(false);
    expect(summary.canOverride).toBe(false);
  });

  it("dòng đơn chưa ghép cặp KHÔNG bị tính là thiếu: điểm chỉ chấm trên phần đã ghép", () => {
    const summary = scoreImagePairs({
      attempts: [attempt("#1", "Cơm gà", 1, good(1))],
      orderItems: ORDER,
      totalTargets: 3,
    });
    expect(summary.scopedOrderItems.map((item) => item.name)).toEqual([
      "Cơm gà",
    ]);
    const score = scoreImageMatch(summary.scopedOrderItems, {
      items: summary.items,
      countable: summary.countable,
      coverage: summary.coverage,
      boxes: summary.boxes,
      sealed: summary.sealed,
    });
    expect(score.matchScore).toBe(1);
    // Nếu chấm trên TOÀN đơn (1+2+1 = 4 phần) thì điểm chỉ còn 1/4 — con số sai
    // lệch do thiếu cặp, đúng loại lỗi mà `scopedOrderItems` sinh ra để chặn.
    const whole = scoreImageMatch(ORDER, {
      items: summary.items,
      countable: summary.countable,
      coverage: summary.coverage,
    });
    expect(whole.matchScore).toBeCloseTo(1 / 4, 5);
  });

  it("đơn nhiều dòng cùng món: mã dòng của cả nhóm đều được tính là đã phủ", () => {
    const order: CaseOrderItem[] = [
      {
        menuItemId: "m-tradao",
        name: "Trà đào",
        quantity: 1,
        options: "ít đá",
      },
      {
        menuItemId: "m-tradao",
        name: "Trà đào",
        quantity: 1,
        options: "nhiều đá",
      },
    ];
    const summary = scoreImagePairs({
      attempts: [attempt("#1", "Trà đào", 2, good(2), ["#1", "#2"])],
      orderItems: order,
      totalTargets: 1,
    });
    expect(summary.items).toEqual([{ name: "Trà đào", quantity: 2 }]);
    expect(summary.scopedOrderItems).toHaveLength(2);
    expect(summary.canOverride).toBe(true);
  });
});

describe("describePairs", () => {
  it("nêu số cặp đọc được, món khác loại và lý do không ghi đè", () => {
    const summary = scoreImagePairs({
      attempts: [
        attempt("#1", "Cơm gà", 1, {
          nameSeen: "Cơm sườn",
          quantitySeen: 1,
          sameDish: false,
          similarityPercent: 15,
          countable: true,
          coverage: "all_items",
        }),
      ],
      orderItems: ORDER,
      totalTargets: 3,
    });
    const lines = describePairs(summary).join("\n");
    expect(lines).toContain("1/3 cặp");
    expect(lines).toContain("KHÁC LOẠI");
    expect(lines).toContain("Chưa đủ điều kiện ghi đè");
  });

  it("không có cặp nào ⇒ không in gì", () => {
    expect(describePairs(null)).toEqual([]);
    const empty = scoreImagePairs({
      attempts: [],
      orderItems: ORDER,
      totalTargets: 0,
    });
    expect(describePairs(empty)).toEqual([]);
  });
});
