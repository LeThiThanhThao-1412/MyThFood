import {
  CaseCategory,
  FaultParty,
  Verdict,
} from "../../modules/case/domain/case.enums";
import {
  allocateDiscount,
  decideCaseMoney,
} from "../../modules/case/domain/case.money-policy";

/**
 * Test chính sách TIỀN của resolution-service.
 *
 * Lỗi gốc (đơn #883f25a8): case `DELIVERY_LATE` trên đơn ĐÃ giao xong được
 * quyết toán bằng luồng "giao thất bại" ⇒ khách được hoàn 100% (93.262đ) còn tài
 * xế chỉ bị trừ NET (69.990đ), phần hoa hồng + phí dịch vụ do nền tảng chịu.
 *
 * Chính sách đúng:
 *   - Đơn chưa giao xong / khách không có hàng dùng được ⇒ FULL_REFUND 100%.
 *   - Đơn đã giao xong, lỗi dịch vụ (giao trễ/thái độ) ⇒ SHIP_COMPENSATION đúng
 *     bằng phí ship (không đụng tiền món của nhà hàng).
 *   - Còn lại ⇒ NONE.
 */

const ORDER_TOTAL = 93262;
const SHIP_FEE = 21862;

const deliveredOrder = {
  status: "DELIVERED",
  totalAmount: ORDER_TOTAL,
  deliveryFee: SHIP_FEE,
};

const base = {
  verdict: Verdict.VALID,
  faultParty: FaultParty.DRIVER,
  category: CaseCategory.DELIVERY_LATE,
  reporterType: "CONSUMER" as const,
  order: deliveredOrder,
};

describe("decideCaseMoney", () => {
  it("case giao trễ trên đơn ĐÃ giao xong: chỉ hoàn phí ship (không hoàn 100% đơn)", () => {
    const d = decideCaseMoney(base);

    expect(d.mode).toBe("SHIP_COMPENSATION");
    expect(d.amount).toBe(SHIP_FEE);
    expect(d.amount).not.toBe(ORDER_TOTAL);
    expect(d.percent).toBe(100);
  });

  it("đơn chưa giao xong: quyết toán như giao thất bại (hoàn 100%)", () => {
    for (const status of ["DELIVERY_FAILED", "CANCELLED", "OUT_FOR_DELIVERY"]) {
      const d = decideCaseMoney({
        ...base,
        order: { ...deliveredOrder, status },
      });
      expect(d.mode).toBe("FULL_REFUND");
      expect(d.amount).toBe(ORDER_TOTAL);
    }
  });

  it("đơn đã giao nhưng khách KHÔNG có hàng dùng được: hoàn 100%", () => {
    for (const category of [
      CaseCategory.NOT_RECEIVED,
      CaseCategory.FAKE_DELIVERY,
      CaseCategory.COD_THEFT,
      CaseCategory.MISSING_ITEM,
      CaseCategory.WRONG_ITEM,
      CaseCategory.DAMAGED_ITEM,
      CaseCategory.FOOD_SAFETY,
      CaseCategory.ORDER_QUALITY,
      CaseCategory.UNAUTHORIZED_CANCEL,
    ]) {
      const d = decideCaseMoney({ ...base, category });
      expect(d.mode).toBe("FULL_REFUND");
      expect(d.amount).toBe(ORDER_TOTAL);
    }
  });

  it("lỗi thuộc về khách: không phát sinh dòng tiền", () => {
    const d = decideCaseMoney({ ...base, faultParty: FaultParty.CUSTOMER });
    expect(d.mode).toBe("NONE");
    expect(d.amount).toBe(0);
  });

  it("không quy được lỗi (SYSTEM/INCONCLUSIVE/null): không phát sinh dòng tiền", () => {
    for (const faultParty of [
      FaultParty.SYSTEM,
      FaultParty.INCONCLUSIVE,
      null,
    ]) {
      expect(decideCaseMoney({ ...base, faultParty }).mode).toBe("NONE");
    }
  });

  it("chưa có phán quyết VALID: không phát sinh dòng tiền", () => {
    for (const verdict of [Verdict.INVALID, Verdict.INCONCLUSIVE, null]) {
      expect(decideCaseMoney({ ...base, verdict }).mode).toBe("NONE");
    }
  });

  it("không đọc được đơn: không phát sinh dòng tiền", () => {
    expect(decideCaseMoney({ ...base, order: null }).mode).toBe("NONE");
  });

  it("tài xế/nhà hàng tự khiếu nại trên đơn đã giao xong: không hoàn tiền", () => {
    expect(decideCaseMoney({ ...base, reporterType: "DRIVER" }).mode).toBe(
      "NONE",
    );
    expect(decideCaseMoney({ ...base, reporterType: "MERCHANT" }).mode).toBe(
      "NONE",
    );
  });

  it("đơn không có phí ship: không có gì để hoàn", () => {
    const d = decideCaseMoney({
      ...base,
      order: { ...deliveredOrder, deliveryFee: 0 },
    });
    expect(d.mode).toBe("NONE");
  });

  it("danh mục ngoài bảng bồi thường (vd gian lận): chỉ cảnh báo, không hoàn tiền", () => {
    const d = decideCaseMoney({
      ...base,
      category: CaseCategory.ORDER_FARMING,
    });
    expect(d.mode).toBe("NONE");
  });

  it("số tiền dạng chuỗi (JSON từ order-service) vẫn tính đúng", () => {
    const d = decideCaseMoney({
      ...base,
      order: {
        status: "DELIVERED",
        totalAmount: String(ORDER_TOTAL),
        deliveryFee: String(SHIP_FEE),
      },
    });
    expect(d.mode).toBe("SHIP_COMPENSATION");
    expect(d.amount).toBe(SHIP_FEE);
  });

  it("lỗi nhà hàng trên đơn đã giao xong: cũng chỉ hoàn phí ship", () => {
    const d = decideCaseMoney({
      ...base,
      faultParty: FaultParty.MERCHANT,
      category: CaseCategory.MERCHANT_BEHAVIOR,
    });
    expect(d.mode).toBe("SHIP_COMPENSATION");
    expect(d.amount).toBe(SHIP_FEE);
  });
});

/**
 * Lỗi gốc thứ hai: bồi thường tính trên giá **niêm yết** trong khi khách đã
 * được giảm giá ⇒ hoàn nhiều hơn số khách thực trả và trừ oan bên lỗi.
 *
 * Quy tắc đã chốt: khuyến mãi phân bổ theo trọng số `subtotal : deliveryFee`,
 * phần làm tròn dồn về tiền món; mọi khoản hoàn/bồi thường dựa trên số THỰC TRẢ
 * và không bao giờ vượt tổng tiền khách đã trả.
 */
describe("allocateDiscount — khuyến mãi phân bổ theo tỷ lệ", () => {
  it("không có khuyến mãi: số thực trả bằng giá niêm yết từng phần", () => {
    const paid = allocateDiscount({
      subtotal: 60000,
      deliveryFee: 20000,
      serviceFee: 5000,
      discount: 0,
      totalAmount: 85000,
    });

    expect(paid.itemPaid).toBe(60000);
    expect(paid.shippingFeePaid).toBe(20000);
    expect(paid.totalPaid).toBe(85000);
  });

  it("khuyến mãi chia đúng trọng số món : ship (làm tròn dồn về tiền món)", () => {
    // base = 60000 + 20000 = 80000; discount 30000 ⇒ ship 7500, món 22500.
    const paid = allocateDiscount({
      subtotal: 60000,
      deliveryFee: 20000,
      serviceFee: 0,
      discount: 30000,
      totalAmount: 50000,
    });

    expect(paid.shippingDiscountShare).toBe(7500);
    expect(paid.itemDiscountShare).toBe(22500);
    expect(paid.shippingFeePaid).toBe(12500);
    expect(paid.itemPaid).toBe(37500);
    expect(paid.totalPaid).toBe(50000);
    expect(paid.shippingDiscountShare + paid.itemDiscountShare).toBe(30000);
  });

  it("khuyến mãi lẻ: tổng hai phần luôn bằng đúng tổng khuyến mãi", () => {
    for (const discount of [1, 999, 1234, 2999, 3999]) {
      const paid = allocateDiscount({
        subtotal: 3000,
        deliveryFee: 1000,
        discount,
        totalAmount: 4000 - discount,
      });
      expect(paid.shippingDiscountShare + paid.itemDiscountShare).toBe(
        discount,
      );
      expect(paid.shippingFeePaid + paid.itemPaid).toBe(4000 - discount);
      expect(paid.shippingDiscountShare).toBeLessThanOrEqual(1000);
      expect(paid.shippingFeePaid).toBeGreaterThanOrEqual(0);
    }
  });

  it("giảm 100% cả đơn: khách không thực trả đồng nào", () => {
    const paid = allocateDiscount({
      subtotal: 60000,
      deliveryFee: 20000,
      serviceFee: 0,
      discount: 80000,
      totalAmount: 0,
    });

    expect(paid.shippingFeePaid).toBe(0);
    expect(paid.itemPaid).toBe(0);
    expect(paid.totalPaid).toBe(0);
  });

  it("khuyến mãi lớn hơn giá trị đơn: không phần nào bị âm, không vượt niêm yết", () => {
    const paid = allocateDiscount({
      subtotal: 3000,
      deliveryFee: 1000,
      serviceFee: 0,
      discount: 5000,
      totalAmount: 0,
    });

    expect(paid.shippingDiscountShare).toBe(1000);
    expect(paid.itemDiscountShare).toBe(3000);
    expect(paid.shippingFeePaid).toBe(0);
    expect(paid.itemPaid).toBe(0);
  });

  it("ảnh chụp cũ (chỉ có totalAmount + deliveryFee) vẫn ra số thực trả đúng", () => {
    // Không có subtotal/serviceFee/discount ⇒ suy ra tiền món từ tổng: 71.400đ.
    const paid = allocateDiscount({
      totalAmount: 93262,
      deliveryFee: 21862,
    });

    expect(paid.itemPaid + paid.shippingFeePaid + paid.serviceFeePaid).toBe(
      93262,
    );
    expect(paid.shippingFeePaid).toBe(21862);
    expect(paid.totalPaid).toBe(93262);
  });

  it("tổng thực trả không bao giờ vượt totalAmount của đơn", () => {
    const paid = allocateDiscount({
      subtotal: 60000,
      deliveryFee: 20000,
      serviceFee: 5000,
      discount: 0,
      // Dữ liệu lỗi: total nhỏ hơn tổng các thành phần.
      totalAmount: 40000,
    });

    expect(paid.totalPaid).toBe(40000);
  });
});

describe("decideCaseMoney — bồi thường theo số THỰC TRẢ", () => {
  it("đơn có khuyến mãi: chỉ hoàn phần phí ship khách thực trả", () => {
    const d = decideCaseMoney({
      ...base,
      order: {
        status: "DELIVERED",
        subtotal: 60000,
        deliveryFee: 20000,
        serviceFee: 0,
        discount: 30000,
        discountFundedBy: "MERCHANT",
        totalAmount: 50000,
      },
    });

    // Trước đây hoàn 20.000đ (giá niêm yết) — nhiều hơn số khách bỏ ra.
    expect(d.amount).toBe(12500);
    expect(d.paidBasis?.shippingFeePaid).toBe(12500);
    expect(d.reason).toContain("THỰC TRẢ");
  });

  it("khuyến mãi nuốt hết phí ship: không còn gì để hoàn", () => {
    const d = decideCaseMoney({
      ...base,
      order: {
        status: "DELIVERED",
        subtotal: 0,
        deliveryFee: 20000,
        serviceFee: 0,
        discount: 20000,
        totalAmount: 0,
      },
    });

    expect(d.mode).toBe("NONE");
    expect(d.amount).toBe(0);
  });

  it("FULL_REFUND cũng bị chặn bởi tổng khách thực trả", () => {
    const d = decideCaseMoney({
      ...base,
      category: CaseCategory.MISSING_ITEM,
      order: {
        status: "DELIVERED",
        subtotal: 60000,
        deliveryFee: 20000,
        serviceFee: 0,
        discount: 30000,
        totalAmount: 50000,
      },
    });

    expect(d.mode).toBe("FULL_REFUND");
    expect(d.amount).toBe(50000);
  });
});

/**
 * Thiếu/sai/hỏng MỘT PHẦN món: khách vẫn dùng được phần còn lại nên KHÔNG được
 * hoàn cả đơn — chỉ chuyển đúng giá trị phần món bị lỗi từ ví bên lỗi
 * (`ITEM_COMPENSATION`). Đây là mức RS-C1 trong `test/2-test-cases/TC-RESOLUTION.md`.
 */
describe("decideCaseMoney — bồi thường theo GIÁ TRỊ MÓN", () => {
  // Đơn thực tế: món 100.000đ + ship 20.000đ + phí dịch vụ 6.038đ = 126.038đ.
  const realOrder = {
    status: "DELIVERED",
    subtotal: 100000,
    deliveryFee: 20000,
    serviceFee: 6038,
    discount: 0,
    totalAmount: 126038,
  };

  it("MISSING_ITEM nhập 40.000đ: bồi thường đúng 40.000đ, KHÔNG hoàn 126.038đ", () => {
    const d = decideCaseMoney({
      ...base,
      faultParty: FaultParty.MERCHANT,
      category: CaseCategory.MISSING_ITEM,
      order: realOrder,
      requestedAmount: 40000,
    });

    expect(d.mode).toBe("ITEM_COMPENSATION");
    expect(d.amount).toBe(40000);
    expect(d.amount).not.toBe(126038);
    expect(d.paidBasis?.itemPaid).toBe(100000);
    expect(d.reason).toContain("40000");
  });

  it("yêu cầu vượt tiền món: coi như khách mất cả đơn ⇒ hoàn đúng tổng thực trả", () => {
    const d = decideCaseMoney({
      ...base,
      category: CaseCategory.MISSING_ITEM,
      order: realOrder,
      requestedAmount: 500000,
    });

    expect(d.mode).toBe("ITEM_COMPENSATION");
    expect(d.amount).toBe(126038);
  });

  it("bỏ trống số tiền: giữ nguyên chính sách hoàn 100% (không âm thầm trả thiếu)", () => {
    const d = decideCaseMoney({
      ...base,
      category: CaseCategory.MISSING_ITEM,
      order: realOrder,
    });

    expect(d.mode).toBe("FULL_REFUND");
    expect(d.amount).toBe(126038);
  });

  it("số tiền yêu cầu không áp dụng cho danh mục phải hoàn cả đơn (NOT_RECEIVED)", () => {
    const d = decideCaseMoney({
      ...base,
      category: CaseCategory.NOT_RECEIVED,
      order: realOrder,
      requestedAmount: 40000,
    });

    expect(d.mode).toBe("FULL_REFUND");
    expect(d.amount).toBe(126038);
  });

  it("đơn có khuyến mãi: trần là TIỀN MÓN thực trả, không phải giá niêm yết", () => {
    const discounted = {
      status: "DELIVERED",
      subtotal: 60000,
      deliveryFee: 20000,
      serviceFee: 0,
      discount: 30000,
      totalAmount: 50000,
    };

    // ship nhận 7.500đ khuyến mãi ⇒ món nhận 22.500đ ⇒ khách thực trả món 37.500đ.
    const withinCap = decideCaseMoney({
      ...base,
      category: CaseCategory.WRONG_ITEM,
      order: discounted,
      requestedAmount: 30000,
    });
    expect(withinCap.mode).toBe("ITEM_COMPENSATION");
    expect(withinCap.amount).toBe(30000);

    const overCap = decideCaseMoney({
      ...base,
      category: CaseCategory.WRONG_ITEM,
      order: discounted,
      requestedAmount: 45000,
    });
    // 45.000đ ≥ tiền món thực trả 37.500đ ⇒ hoàn toàn bộ 50.000đ khách đã trả.
    expect(overCap.mode).toBe("ITEM_COMPENSATION");
    expect(overCap.amount).toBe(50000);
  });

  it("bên khiếu nại không phải khách: không bồi thường theo giá trị món", () => {
    const d = decideCaseMoney({
      ...base,
      reporterType: "DRIVER",
      category: CaseCategory.DAMAGED_ITEM,
      order: realOrder,
      requestedAmount: 40000,
    });

    // Tiền món chỉ được trả lại cho KHÁCH của đơn; tài xế/nhà hàng khiếu nại
    // không được hưởng khoản này (nhánh xử lý của họ là chính sách sẵn có).
    expect(d.mode).not.toBe("ITEM_COMPENSATION");
    expect(d.amount).not.toBe(40000);
  });
});
