import type { CaseOrderItem } from "../../modules/assistant/domain/assistant.types";
import type { InventoryLabel } from "../../modules/assistant/domain/item-inventory";
import {
  DEFAULT_IMAGE_MATCH_POLICY,
  aggregateImageMatch,
  decideImageMatch,
  deliveryMatchFromDecision,
  evaluateEvidenceImage,
  evaluateImageMatch,
  labelFromInventory,
  parseOrderItemRef,
  scoreImageMatch,
  totalOrderedQuantity,
  type ImageMatchRunRow,
  type ImageMatchScore,
} from "../../modules/assistant/domain/image-match";

/** Đơn 5 phần (giống combo5 trong test-data/ai-eval): cơm + sườn + trứng + súp + trà đá. */
const ORDER_COMBO5: CaseOrderItem[] = [
  { menuItemId: "m-com", name: "Cơm trắng", quantity: 1, unitPrice: 10000 },
  { menuItemId: "m-suon", name: "Sườn nướng", quantity: 1, unitPrice: 35000 },
  { menuItemId: "m-trung", name: "Trứng ốp la", quantity: 1, unitPrice: 10000 },
  { menuItemId: "m-sup", name: "Súp", quantity: 1, unitPrice: 15000 },
  { menuItemId: "m-trada", name: "Trà đá", quantity: 1, unitPrice: 5000 },
];

function label(
  items: InventoryLabel["items"],
  extra: Partial<InventoryLabel> = {},
): InventoryLabel {
  return {
    items,
    countable: true,
    coverage: "all_items",
    sealed: false,
    ...extra,
  };
}

/** Nhãn kiểm kê của ảnh đầy đủ 5/5 phần. */
const FULL_LABEL = label([
  { menuItemId: "m-com", name: "cơm trắng", quantity: 1 },
  { menuItemId: "m-suon", name: "sườn nướng", quantity: 1 },
  { menuItemId: "m-trung", name: "trứng ốp la", quantity: 1 },
  { menuItemId: "m-sup", name: "súp", quantity: 1 },
  { menuItemId: "m-trada", name: "trà đá", quantity: 1 },
]);

describe("image-match / totalOrderedQuantity", () => {
  it("cộng số phần của đơn", () => {
    expect(totalOrderedQuantity(ORDER_COMBO5)).toBe(5);
  });

  it("bỏ dòng số lượng 0/âm/không phải số, và đơn rỗng thì bằng 0", () => {
    expect(
      totalOrderedQuantity([
        { name: "Cơm", quantity: 0 },
        { name: "Súp", quantity: -2 },
        { name: "Trà đá", quantity: Number.NaN },
        { name: "Sườn", quantity: 2 },
      ]),
    ).toBe(2);
    expect(totalOrderedQuantity([])).toBe(0);
    expect(totalOrderedQuantity(null)).toBe(0);
  });
});

describe("image-match / scoreImageMatch", () => {
  it("ảnh đủ 5/5 phần ⇒ 100% và MATCH", () => {
    const score = scoreImageMatch(ORDER_COMBO5, FULL_LABEL);
    expect(score.matchScore).toBe(1);
    expect(score.verdict).toBe("MATCH");
    expect(score.matchedQuantity).toBe(5);
    expect(score.missing).toEqual([]);
    expect(score.missingValue).toBe(0);
  });

  it("thiếu 1 sườn ⇒ 80% và nêu đích danh món thiếu", () => {
    const score = scoreImageMatch(
      ORDER_COMBO5,
      label([
        { name: "cơm trắng", quantity: 1 },
        { name: "trứng ốp la", quantity: 1 },
        { name: "súp", quantity: 1 },
        { name: "trà đá", quantity: 1 },
      ]),
    );
    expect(score.matchScore).toBe(0.8);
    expect(score.verdict).toBe("MISSING");
    expect(score.missing).toHaveLength(1);
    expect(score.missing[0]?.name).toBe("Sườn nướng");
    expect(score.missingValue).toBe(35000);
  });

  it("làm tròn 4 chữ số: thiếu 1/6 phần ⇒ 0.8333 (không phải 0.83 hay 83%)", () => {
    const order: CaseOrderItem[] = [{ name: "Trà sữa", quantity: 6 }];
    const score = scoreImageMatch(
      order,
      label([{ name: "trà sữa", quantity: 5 }]),
    );
    expect(score.matchScore).toBe(0.8333);
    expect(score.matchedQuantity).toBe(5);
  });

  /**
   * Giữ nguyên hợp đồng cũ: 0 % là ĐÃ chấm (khớp được tên nhưng không thấy phần
   * nào), khác `null` là KHÔNG chấm được.
   */
  it("khớp tên nhưng ảnh không có phần nào ⇒ 0% (ĐÃ chấm), không phải null", () => {
    const order: CaseOrderItem[] = [{ name: "Trà sữa", quantity: 2 }];
    const score = scoreImageMatch(
      order,
      label([{ name: "trà sữa", quantity: 0 }]),
    );
    expect(score.matchScore).toBe(0);
    expect(score.verdict).toBe("MISSING");
  });

  /**
   * Đổi hành vi 07/11/2026 (đo live 58 mẫu): ảnh toàn món lạ, KHÔNG khớp được
   * tên nào ⇒ `UNCLEAR` + `null`, không còn `EXTRA` + 0 %.
   */
  it("ảnh không khớp được tên món nào ⇒ null (KHÔNG chấm), không phải 0", () => {
    const score = scoreImageMatch(
      ORDER_COMBO5,
      label([{ name: "Mì xào bò", quantity: 1 }]),
    );
    expect(score.matchScore).toBeNull();
    expect(score.verdict).toBe("UNCLEAR");
  });

  it("KHÔNG chấm được thì trả null, không trả 0 (kẻo bị hiểu là ảnh trống)", () => {
    expect(scoreImageMatch(ORDER_COMBO5, null).matchScore).toBeNull();
    expect(scoreImageMatch(ORDER_COMBO5, null).verdict).toBe("UNCLEAR");
    expect(scoreImageMatch([], FULL_LABEL).matchScore).toBeNull();
    expect(
      scoreImageMatch(ORDER_COMBO5, label([], { coverage: "partial" }))
        .matchScore,
    ).toBeNull();
    expect(
      scoreImageMatch(ORDER_COMBO5, label([], { countable: false })).matchScore,
    ).toBeNull();
  });

  it("ảnh có NHIỀU hơn đơn thì điểm vẫn chặn ở 1", () => {
    const score = scoreImageMatch(
      [{ name: "Trà đá", quantity: 1 }],
      label([{ name: "trà đá", quantity: 3 }]),
    );
    expect(score.matchScore).toBe(1);
    expect(score.matchedQuantity).toBe(1);
  });

  it("điểm là phép ĐẾM phần, không phải độ giống ảnh: đổi tên món lạ là mất phần đó", () => {
    const score = scoreImageMatch(
      ORDER_COMBO5,
      label([
        { name: "cơm trắng", quantity: 1 },
        { name: "sườn nướng", quantity: 1 },
        { name: "trứng chiên", quantity: 1 },
        { name: "súp", quantity: 1 },
        { name: "trà đá", quantity: 1 },
      ]),
    );
    expect(score.matchScore).toBe(0.8);
    expect(score.missing[0]?.name).toBe("Trứng ốp la");
  });
});

describe("image-match / decideImageMatch", () => {
  const scoreOf = (
    items: InventoryLabel["items"],
    extra: Partial<InventoryLabel> = {},
  ) => scoreImageMatch(ORDER_COMBO5, label(items, extra));

  const MISSING_ONE = [
    { name: "cơm trắng", quantity: 1 },
    { name: "trứng ốp la", quantity: 1 },
    { name: "súp", quantity: 1 },
    { name: "trà đá", quantity: 1 },
  ];

  it("đủ món ⇒ AUTO_REJECT (bác claim, không hoàn tiền)", () => {
    const result = decideImageMatch(scoreOf(FULL_LABEL.items));
    expect(result.decision).toBe("AUTO_REJECT");
    expect(result.refundCap).toBeNull();
  });

  /**
   * Đo live 07/11/2026 (2 lượt, cùng 58 mẫu): 4 ca `MATCH` SAI đều ở đơn 8 phần
   * (khay bún đậu) — model đếm đủ 8/8 trong khi ảnh thiếu 1. Tự bác ở đó là từ
   * chối khách oan, nên đơn nhiều phần phải chuyển người.
   */
  it("đơn > 5 phần khớp 100% ⇒ CHUYỂN NGƯỜI, không tự bác", () => {
    const bigOrder: CaseOrderItem[] = Array.from({ length: 8 }, (_, index) => ({
      menuItemId: `m-${index}`,
      name: `món ${index}`,
      quantity: 1,
      unitPrice: 10000,
    }));
    const score = scoreImageMatch(
      bigOrder,
      label(
        bigOrder.map((item) => ({
          menuItemId: item.menuItemId,
          name: item.name,
          quantity: 1,
        })),
      ),
    );
    expect(score.matchScore).toBe(1);
    expect(score.verdict).toBe("MATCH");

    const result = decideImageMatch(score);
    expect(result.decision).toBe("NEEDS_REVIEW");
    expect(result.reason).toContain("đơn nhiều món");
    expect(result.refundCap).toBeNull();
  });

  it("ngưỡng số phần được phép tự bác đổi được theo policy", () => {
    const bigOrder: CaseOrderItem[] = Array.from({ length: 8 }, (_, index) => ({
      menuItemId: `m-${index}`,
      name: `món ${index}`,
      quantity: 1,
    }));
    const score = scoreImageMatch(
      bigOrder,
      label(
        bigOrder.map((item) => ({
          menuItemId: item.menuItemId,
          name: item.name,
          quantity: 1,
        })),
      ),
    );

    const relaxed = decideImageMatch(score, {
      ...DEFAULT_IMAGE_MATCH_POLICY,
      autoRejectMaxTotalQuantity: 8,
    });
    expect(relaxed.decision).toBe("AUTO_REJECT");
  });

  it("khớp dưới ngưỡng ⇒ AUTO_APPROVE và trần hoàn tiền = giá món thiếu", () => {
    const result = decideImageMatch(scoreOf(MISSING_ONE));
    expect(result.decision).toBe("AUTO_APPROVE");
    expect(result.refundCap).toBe(35000);
    expect(result.reason).toContain("Sườn nướng");
  });

  it("đúng ngưỡng 0.80 vẫn duyệt (so sánh ≤), 0.85 rơi vùng xám ⇒ NEEDS_REVIEW", () => {
    const order: CaseOrderItem[] = [{ name: "Trà sữa", quantity: 20 }];
    const atBoundary = scoreImageMatch(
      order,
      label([{ name: "trà sữa", quantity: 16 }]),
    );
    expect(atBoundary.matchScore).toBe(0.8);
    expect(decideImageMatch(atBoundary).decision).toBe("AUTO_APPROVE");

    const grey = scoreImageMatch(
      order,
      label([{ name: "trà sữa", quantity: 17 }]),
    );
    expect(grey.matchScore).toBe(0.85);
    const result = decideImageMatch(grey);
    expect(result.decision).toBe("NEEDS_REVIEW");
    expect(result.reason).toContain("vùng xám");
  });

  it("ảnh không chấm được ⇒ NEEDS_REVIEW, không tự duyệt", () => {
    const score = scoreImageMatch(ORDER_COMBO5, null);
    const result = decideImageMatch(score);
    expect(result.decision).toBe("NEEDS_REVIEW");
    expect(result.refundCap).toBeNull();
  });

  /**
   * Đổi hành vi 07/11/2026 theo số liệu live 58 mẫu: khi KHÔNG khớp được tên món
   * nào, code không còn đoán `EXTRA` (⇒ "nghi đóng gói nhầm phía quán") mà trả
   * `UNCLEAR` — vì "giao nhầm cả túi" và "mình không hiểu tên món" là hai chuyện
   * không phân biệt được từ dữ liệu, và cáo buộc sai đắt hơn nhiều so với việc để
   * người xem. Quyết định vẫn là NEEDS_REVIEW như trước.
   */
  it("ảnh KHÔNG khớp được món nào (giao nhầm cả túi / khác cách gọi) ⇒ NEEDS_REVIEW, không cáo buộc", () => {
    const score = scoreImageMatch(
      ORDER_COMBO5,
      label([{ name: "Sandwich gà", quantity: 1 }]),
    );
    expect(score.verdict).toBe("UNCLEAR");
    expect(score.comparison.faultHint).toBeNull();
    const result = decideImageMatch(score);
    expect(result.decision).toBe("NEEDS_REVIEW");
    expect(result.reason).toContain("Không đối chiếu được tên món");
    expect(result.refundCap).toBeNull();
  });

  it("ảnh khớp MỘT PHẦN đơn còn có món lạ (giao nhầm một phần) ⇒ NEEDS_REVIEW", () => {
    const score = scoreImageMatch(
      ORDER_COMBO5,
      label([
        { name: "cơm", quantity: 1 },
        { name: "Sandwich gà", quantity: 1 },
      ]),
    );
    expect(score.verdict).toBe("EXTRA");
    const result = decideImageMatch(score);
    expect(result.decision).toBe("NEEDS_REVIEW");
    expect(result.reason).toContain("giao nhầm");
  });

  it("thiếu đơn giá thì duyệt được nhưng KHÔNG có trần hoàn tiền", () => {
    const noPrice: CaseOrderItem[] = [{ name: "Sườn nướng", quantity: 2 }];
    const score = scoreImageMatch(
      noPrice,
      label([{ name: "sườn nướng", quantity: 1 }]),
    );
    const result = decideImageMatch(score);
    expect(result.decision).toBe("AUTO_APPROVE");
    expect(result.refundCap).toBeNull();
  });

  it("ngưỡng cấu hình sai (approve ≥ reject) ⇒ fail-closed về NEEDS_REVIEW", () => {
    const score = scoreOf(MISSING_ONE);
    expect(
      decideImageMatch(score, {
        autoApproveAtOrBelow: 0.9,
        autoRejectAtOrAbove: 0.9,
      }).decision,
    ).toBe("NEEDS_REVIEW");
    expect(
      decideImageMatch(score, {
        autoApproveAtOrBelow: Number.NaN,
        autoRejectAtOrAbove: 1,
      }).decision,
    ).toBe("NEEDS_REVIEW");
  });

  it("đổi ngưỡng là đổi kết quả: cùng ảnh 80%, approve ≤ 0.7 ⇒ NEEDS_REVIEW", () => {
    const score = scoreOf(MISSING_ONE);
    expect(decideImageMatch(score).decision).toBe("AUTO_APPROVE");
    expect(
      decideImageMatch(score, {
        autoApproveAtOrBelow: 0.7,
        autoRejectAtOrAbove: 1,
      }).decision,
    ).toBe("NEEDS_REVIEW");
  });
});

describe("image-match / evaluateImageMatch", () => {
  const complete = (): ImageMatchScore =>
    scoreImageMatch(ORDER_COMBO5, FULL_LABEL);

  it("dự đoán trùng nhãn vàng ⇒ đúng verdict, sai số 0, không báo động sai", () => {
    const evaluation = evaluateImageMatch(complete(), {
      verdict: "MATCH",
      matchScore: 1,
    });
    expect(evaluation.verdictCorrect).toBe(true);
    expect(evaluation.scoreError).toBe(0);
    expect(evaluation.scoreWithinTolerance).toBe(true);
    expect(evaluation.falseAlarm).toBe(false);
    expect(evaluation.missedDefect).toBe(false);
  });

  it("ảnh ĐỦ món mà kết luận thiếu ⇒ falseAlarm (hoàn tiền oan)", () => {
    const wrong = scoreImageMatch(
      ORDER_COMBO5,
      label(FULL_LABEL.items.slice(0, 4)),
    );
    const evaluation = evaluateImageMatch(wrong, {
      verdict: "MATCH",
      matchScore: 1,
    });
    expect(wrong.verdict).toBe("MISSING");
    expect(evaluation.falseAlarm).toBe(true);
    expect(evaluation.verdictCorrect).toBe(false);
    expect(evaluation.scoreError).toBe(0.2);
  });

  it("ảnh THIẾU món mà kết luận đủ ⇒ missedDefect (bỏ sót)", () => {
    const evaluation = evaluateImageMatch(complete(), {
      verdict: "MISSING",
      matchScore: 0.8,
    });
    expect(evaluation.missedDefect).toBe(true);
  });

  it("ảnh không chấm được ⇒ scoreError null, không nằm trong dung sai", () => {
    const evaluation = evaluateImageMatch(scoreImageMatch(ORDER_COMBO5, null), {
      verdict: "MISSING",
      matchScore: 0.8,
    });
    expect(evaluation.scoreError).toBeNull();
    expect(evaluation.scoreWithinTolerance).toBe(false);
  });

  it("dung sai so sánh được: lệch 0.2 ngoài 0.15 nhưng trong 0.25", () => {
    const wrong = scoreImageMatch(
      ORDER_COMBO5,
      label(FULL_LABEL.items.slice(0, 4)),
    );
    expect(
      evaluateImageMatch(wrong, { verdict: "MISSING", matchScore: 1 })
        .scoreWithinTolerance,
    ).toBe(false);
    expect(
      evaluateImageMatch(wrong, { verdict: "MISSING", matchScore: 1 }, 0.25)
        .scoreWithinTolerance,
    ).toBe(true);
  });
});

describe("image-match / aggregateImageMatch", () => {
  const row = (
    sampleId: string,
    truthVerdict: ImageMatchRunRow["truthVerdict"],
    evaluation: ImageMatchRunRow["evaluation"],
    decision: ImageMatchRunRow["decision"] = "NEEDS_REVIEW",
  ): ImageMatchRunRow => ({ sampleId, truthVerdict, evaluation, decision });

  it("rỗng ⇒ mọi tỉ lệ null, không chia cho 0", () => {
    const metrics = aggregateImageMatch([]);
    expect(metrics.samples).toBe(0);
    expect(metrics.verdictAccuracy).toBeNull();
    expect(metrics.meanAbsoluteScoreError).toBeNull();
    expect(metrics.falseAlarmRate).toBeNull();
    expect(metrics.decisionCounts).toEqual({
      AUTO_APPROVE: 0,
      AUTO_REJECT: 0,
      NEEDS_REVIEW: 0,
    });
  });

  it("falseAlarmRate chỉ tính trên mẫu ĐỦ món, MAE chỉ tính trên mẫu chấm được", () => {
    const metrics = aggregateImageMatch([
      row(
        "COM-combo1-du-toi",
        "MATCH",
        {
          verdictCorrect: true,
          scoreError: 0,
          scoreWithinTolerance: true,
          falseAlarm: false,
          missedDefect: false,
        },
        "AUTO_REJECT",
      ),
      row(
        "MIS-combo1-thieu1ga",
        "MISSING",
        {
          verdictCorrect: true,
          scoreError: 0.05,
          scoreWithinTolerance: true,
          falseAlarm: false,
          missedDefect: false,
        },
        "AUTO_APPROVE",
      ),
      row("MIS-combo2-thieu1khoai", "MISSING", {
        verdictCorrect: false,
        scoreError: null,
        scoreWithinTolerance: false,
        falseAlarm: false,
        missedDefect: false,
      }),
    ]);

    expect(metrics.samples).toBe(3);
    expect(metrics.scored).toBe(2);
    expect(metrics.verdictAccuracy).toBe(0.6667);
    expect(metrics.falseAlarmRate).toBe(0);
    expect(metrics.missedDefectRate).toBe(0);
    expect(metrics.meanAbsoluteScoreError).toBe(0.025);
    expect(metrics.withinToleranceRate).toBe(1);
    expect(metrics.decisionCounts).toEqual({
      AUTO_APPROVE: 1,
      AUTO_REJECT: 1,
      NEEDS_REVIEW: 1,
    });
  });

  it("không có mẫu đủ món nào ⇒ falseAlarmRate null (không được báo 0%)", () => {
    const metrics = aggregateImageMatch([
      row("MIS-combo4-thieu1mamtom", "MISSING", {
        verdictCorrect: true,
        scoreError: 0,
        scoreWithinTolerance: true,
        falseAlarm: false,
        missedDefect: false,
      }),
    ]);
    expect(metrics.falseAlarmRate).toBeNull();
  });
});

describe("image-match / policy mặc định", () => {
  it("mặc định duyệt ở ≤80% và bác ở 100% (khoảng trống là vùng người xử lý)", () => {
    expect(DEFAULT_IMAGE_MATCH_POLICY.autoApproveAtOrBelow).toBe(0.8);
    expect(DEFAULT_IMAGE_MATCH_POLICY.autoRejectAtOrAbove).toBe(1);
  });

  it("mặc định chặn tự bác khi đơn > 5 phần (live v4: model đếm đủ 8/8 dù ảnh thiếu 1)", () => {
    expect(DEFAULT_IMAGE_MATCH_POLICY.autoRejectMaxTotalQuantity).toBe(5);
    const bigOrder: CaseOrderItem[] = [
      { name: "Bún", quantity: 4 },
      { name: "Chả", quantity: 4 },
    ];
    const full = scoreImageMatch(
      bigOrder,
      label([
        { name: "bún", quantity: 4 },
        { name: "chả", quantity: 4 },
      ]),
    );
    expect(full.matchScore).toBe(1);
    expect(decideImageMatch(full).decision).toBe("NEEDS_REVIEW");
  });
});

describe("image-match / parseOrderItemRef", () => {
  it("nhận #3, 3, '3.' và trả chỉ số 0-based", () => {
    expect(parseOrderItemRef("#3", 5)).toBe(2);
    expect(parseOrderItemRef("3", 5)).toBe(2);
    expect(parseOrderItemRef(" 3. ", 5)).toBe(2);
    expect(parseOrderItemRef(1, 5)).toBe(0);
  });

  it("mã rỗng/lạ/vượt số dòng ⇒ null (không đoán bừa)", () => {
    expect(parseOrderItemRef("", 5)).toBeNull();
    expect(parseOrderItemRef("0", 5)).toBeNull();
    expect(parseOrderItemRef("#6", 5)).toBeNull();
    expect(parseOrderItemRef("m-com", 5)).toBeNull();
    expect(parseOrderItemRef(null, 5)).toBeNull();
    expect(parseOrderItemRef(undefined, 5)).toBeNull();
    expect(parseOrderItemRef("#1", 0)).toBeNull();
  });
});

describe("image-match / labelFromInventory", () => {
  it("model KHÔNG trả kiểm kê ⇒ null (khác hẳn 'ảnh trống')", () => {
    expect(labelFromInventory(undefined, ORDER_COMBO5)).toBeNull();
    expect(labelFromInventory(null, ORDER_COMBO5)).toBeNull();
    expect(labelFromInventory({}, ORDER_COMBO5)).toBeNull();
  });

  it("mã dòng hợp lệ ⇒ lấy TÊN của dòng đơn (khắc phục lệch từ vựng)", () => {
    const built = labelFromInventory(
      {
        items: [
          // Model gọi 'chè trái cây' nhưng trỏ đúng dòng #5 = Trà đá.
          { name: "chè trái cây", quantity: 1, orderItemId: "#5" },
          { name: "cơm", quantity: 2, orderItemId: "1" },
        ],
        countable: true,
        coverage: "all_items",
      },
      ORDER_COMBO5,
    );

    expect(built?.items).toEqual([
      { menuItemId: "m-trada", name: "Trà đá", quantity: 1 },
      { menuItemId: "m-com", name: "Cơm trắng", quantity: 2 },
    ]);
    expect(built?.countable).toBe(true);
    expect(built?.coverage).toBe("all_items");
  });

  it("mã dòng lạ/rỗng ⇒ giữ tên model đọc được, không gắn menuItemId", () => {
    const built = labelFromInventory(
      {
        items: [
          { name: "phở bò", quantity: 1, orderItemId: "#99" },
          { name: "trà đá", quantity: 1 },
        ],
        countable: true,
      },
      ORDER_COMBO5,
    );

    expect(built?.items).toEqual([
      { menuItemId: null, name: "phở bò", quantity: 1 },
      { menuItemId: null, name: "trà đá", quantity: 1 },
    ]);
  });

  it("bỏ dòng rác và chuẩn hoá countable/coverage", () => {
    const built = labelFromInventory(
      {
        items: [
          { name: "cơm", quantity: 0 },
          { name: "", quantity: 2 },
          { name: "súp", quantity: "2" },
          null,
          "rác",
        ],
        coverage: "nonsense",
      },
      ORDER_COMBO5,
    );

    expect(built?.items).toEqual([
      { menuItemId: null, name: "súp", quantity: 2 },
    ]);
    // Bỏ trống `countable` nhưng ĐÃ đếm ra món ⇒ coi là đếm được.
    expect(built?.countable).toBe(true);
    expect(built?.coverage).toBeUndefined();
  });
});

describe("image-match / evaluateEvidenceImage", () => {
  it("countable=false/coverage=partial ⇒ UNCLEAR chứ không phải 0%", () => {
    const blurry = evaluateEvidenceImage(
      "DELIVERY_PROOF",
      {
        items: [{ name: "cơm", quantity: 1, orderItemId: "#1" }],
        countable: false,
      },
      ORDER_COMBO5,
    );
    expect(blurry?.verdict).toBe("UNCLEAR");
    expect(blurry?.matchScore).toBeNull();
    expect(blurry?.decision).toBe("NEEDS_REVIEW");

    const partial = evaluateEvidenceImage(
      "REPORTER",
      {
        items: [{ name: "cơm", quantity: 1, orderItemId: "#1" }],
        countable: true,
        coverage: "partial",
      },
      ORDER_COMBO5,
    );
    expect(partial?.verdict).toBe("UNCLEAR");
    expect(partial?.decision).toBe("NEEDS_REVIEW");
  });

  it("túi niêm phong: items=[] ⇒ UNCLEAR, tự vô hiệu hoá ở mode 'on'", () => {
    const sealed = evaluateEvidenceImage(
      "DELIVERY_PROOF",
      { items: [], countable: true, sealed: true, boxes: 1 },
      ORDER_COMBO5,
    );
    expect(sealed?.verdict).toBe("UNCLEAR");
    expect(sealed?.matchScore).toBeNull();
    expect(deliveryMatchFromDecision(sealed!.decision)).toBeNull();
  });

  it("thiếu 1/5 phần ⇒ 80% ⇒ AUTO_APPROVE, nêu đích danh món thiếu", () => {
    const summary = evaluateEvidenceImage(
      "REPORTER",
      {
        items: [
          { name: "cơm", quantity: 1, orderItemId: "#1" },
          { name: "sườn", quantity: 1, orderItemId: "#2" },
          { name: "trứng", quantity: 1, orderItemId: "#3" },
          { name: "súp", quantity: 1, orderItemId: "#4" },
        ],
        countable: true,
        coverage: "all_items",
      },
      ORDER_COMBO5,
    );

    expect(summary).not.toBeNull();
    expect(summary?.side).toBe("REPORTER");
    expect(summary?.matchedQuantity).toBe(4);
    expect(summary?.totalQuantity).toBe(5);
    expect(summary?.matchScore).toBe(0.8);
    expect(summary?.decision).toBe("AUTO_APPROVE");
    expect(summary?.missingText).toBe("Trà đá x1");
    expect(summary?.refundCap).toBe(5000);
  });

  it("đủ 5/5 ⇒ AUTO_REJECT và không nêu món thiếu", () => {
    const summary = evaluateEvidenceImage(
      "DELIVERY_PROOF",
      {
        items: ORDER_COMBO5.map((item, index) => ({
          name: item.name,
          quantity: item.quantity,
          orderItemId: `#${index + 1}`,
        })),
        countable: true,
        coverage: "all_items",
      },
      ORDER_COMBO5,
    );

    expect(summary?.matchScore).toBe(1);
    expect(summary?.decision).toBe("AUTO_REJECT");
    expect(summary?.missingText).toBe("");
  });

  it("thiếu D1 (không có món đã đặt) ⇒ UNCLEAR, không tự hoàn", () => {
    const summary = evaluateEvidenceImage(
      "REPORTER",
      { items: [{ name: "cơm", quantity: 1 }], countable: true },
      [],
    );

    expect(summary?.matchScore).toBeNull();
    expect(summary?.decision).toBe("NEEDS_REVIEW");
    expect(summary?.reason).toMatch(/D1/);
  });
});

describe("image-match / deliveryMatchFromDecision", () => {
  it("chỉ đổi matchesOrder khi vùng AUTO_*, vùng xám giữ nguyên model", () => {
    expect(deliveryMatchFromDecision("AUTO_REJECT")).toBe("MATCH");
    expect(deliveryMatchFromDecision("AUTO_APPROVE")).toBe("MISMATCH");
    expect(deliveryMatchFromDecision("NEEDS_REVIEW")).toBeNull();
  });
});
