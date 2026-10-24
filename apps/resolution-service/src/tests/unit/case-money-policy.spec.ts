import {
  CaseCategory,
  FaultParty,
  Verdict,
} from "../../modules/case/domain/case.enums";
import { decideCaseMoney } from "../../modules/case/domain/case.money-policy";

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
