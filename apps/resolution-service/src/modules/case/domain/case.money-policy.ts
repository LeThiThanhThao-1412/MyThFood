import { ActorType, CaseCategory, FaultParty, Verdict } from "./case.enums";

/**
 * Chính sách TIỀN khi một vụ việc có phán quyết `VALID`.
 *
 * Vì sao cần: trước đây mọi case `VALID` đều gọi `settleFailureMoney` — luồng
 * quyết toán của **đơn giao thất bại** (hoàn 100% giá trị đơn + huỷ toàn bộ
 * escrow). Hệ quả là khiếu nại "giao trễ" trên đơn **đã giao thành công** bị xử
 * y như đơn giao thất bại:
 *   - khách được hoàn 100% (93.262đ cho đơn 883f25a8),
 *   - tài xế chỉ bị trừ phần NET của anh ta (69.990đ),
 *   - chênh lệch (hoa hồng + phí dịch vụ) do nền tảng âm thầm chịu, còn bút toán
 *     lại ghi "đơn giao thất bại" ⇒ hai con số không bao giờ khớp nhau.
 *
 * Chính sách mới:
 *  - `FULL_REFUND`      — đơn CHƯA giao xong (giao thất bại / huỷ) hoặc khách
 *                          không nhận được hàng/món dùng được ⇒ quyết toán như
 *                          giao thất bại (hoàn 100%, escrow bị huỷ).
 *  - `SHIP_COMPENSATION`— đơn ĐÃ giao xong, lỗi đến từ dịch vụ (giao trễ, thái
 *                          độ) ⇒ chỉ hoàn tối đa **phí ship** cho khách và trừ
 *                          đúng bên lỗi; tiền món của nhà hàng không bị đụng.
 *  - `NONE`             — không phát sinh dòng tiền (chỉ cảnh báo/trừ điểm).
 */

export type CaseMoneyMode = "FULL_REFUND" | "SHIP_COMPENSATION" | "NONE";

/** Ảnh chụp tối thiểu của đơn hàng (order-service `GET /orders/:id`). */
export interface CaseMoneyOrderSnapshot {
  status?: string | null;
  /** Tổng khách đã trả (món + ship + phí dịch vụ − khuyến mãi). */
  totalAmount?: number | string | null;
  /** Phí giao hàng khách trả (GROSS, chưa trừ hoa hồng tài xế). */
  deliveryFee?: number | string | null;
}

export interface CaseMoneyContext {
  verdict: Verdict | null;
  faultParty: FaultParty | null;
  category: CaseCategory;
  reporterType: ActorType;
  order: CaseMoneyOrderSnapshot | null;
}

export interface CaseMoneyDecision {
  mode: CaseMoneyMode;
  /** Số tiền hoàn/bồi thường cho bên khiếu nại (đồng). */
  amount: number;
  /** Tỷ lệ phí ship được hoàn (chỉ dùng cho `SHIP_COMPENSATION`). */
  percent: number;
  /** Giải thích ngắn — ghi log để hậu kiểm được vì sao ra con số này. */
  reason: string;
}

/** Trạng thái đơn coi như "khách đã nhận hàng". */
const DELIVERED_ORDER_STATUSES = new Set(["DELIVERED", "COMPLETED"]);

/**
 * Danh mục mà khách **không có được hàng/món dùng được** ⇒ hoàn 100% giá trị
 * đơn dù đơn đã được đánh dấu DELIVERED (bấm giao khống, thiếu món, hỏng...).
 */
export const FULL_REFUND_CATEGORIES: ReadonlySet<CaseCategory> = new Set([
  CaseCategory.NOT_RECEIVED,
  CaseCategory.FAKE_DELIVERY,
  CaseCategory.COD_THEFT,
  CaseCategory.UNAUTHORIZED_CANCEL,
  CaseCategory.MISSING_ITEM,
  CaseCategory.WRONG_ITEM,
  CaseCategory.DAMAGED_ITEM,
  CaseCategory.ORDER_QUALITY,
  CaseCategory.FOOD_SAFETY,
]);

/**
 * Đơn đã giao xong nhưng dịch vụ có lỗi ⇒ tỷ lệ **phí ship** được hoàn cho
 * khách (và trừ đúng bằng số đó ở bên lỗi). Danh mục không có trong bảng này
 * thì không phát sinh dòng tiền — chỉ cảnh báo/trừ điểm uy tín.
 */
export const SHIP_FEE_COMPENSATION_PCT: Partial<Record<CaseCategory, number>> =
  {
    [CaseCategory.DELIVERY_LATE]: 100,
    [CaseCategory.DRIVER_BEHAVIOR]: 100,
    [CaseCategory.MERCHANT_BEHAVIOR]: 100,
  };

function toAmount(value: number | string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * Quyết định cách quyết toán tiền cho một vụ việc.
 *
 * Hàm thuần (không I/O) để test được chính sách mà không cần DB/service khác.
 */
export function decideCaseMoney(ctx: CaseMoneyContext): CaseMoneyDecision {
  const none = (reason: string): CaseMoneyDecision => ({
    mode: "NONE",
    amount: 0,
    percent: 0,
    reason,
  });

  if (ctx.verdict !== Verdict.VALID) {
    return none("Chưa có phán quyết VALID — giữ nguyên tiền của đơn");
  }

  const fault = ctx.faultParty;
  if (
    !fault ||
    fault === FaultParty.SYSTEM ||
    fault === FaultParty.INCONCLUSIVE
  ) {
    return none("Không quy được lỗi cho bên nào — không phát sinh dòng tiền");
  }

  const order = ctx.order;
  if (!order) {
    return none("Không đọc được đơn hàng — không thể quyết toán");
  }

  const total = toAmount(order.totalAmount);
  const shippingFee = toAmount(order.deliveryFee);
  const status = String(order.status ?? "").toUpperCase();
  const delivered = DELIVERED_ORDER_STATUSES.has(status);

  // Đơn chưa giao xong (DELIVERY_FAILED / CANCELLED / đang chạy...) ⇒ giữ
  // nguyên luồng quyết toán giao thất bại: hoàn 100% + huỷ escrow.
  if (!delivered) {
    return {
      mode: "FULL_REFUND",
      amount: total,
      percent: 100,
      reason: `Đơn ở trạng thái ${status || "?"} (chưa giao xong) — quyết toán như giao thất bại`,
    };
  }

  // Đơn đã giao nhưng khách không có hàng để dùng ⇒ hoàn 100%.
  if (FULL_REFUND_CATEGORIES.has(ctx.category)) {
    return {
      mode: "FULL_REFUND",
      amount: total,
      percent: 100,
      reason: `${ctx.category}: khách không nhận được hàng/món dùng được — hoàn 100%`,
    };
  }

  // Chỉ khách hàng mới là bên được bồi thường trên đơn đã giao xong. Tài xế /
  // nhà hàng khiếu nại đơn đã giao xong thì không phát sinh dòng tiền.
  if (ctx.reporterType !== "CONSUMER") {
    return none(
      `Bên khiếu nại là ${ctx.reporterType} — chỉ ghi cảnh báo, không hoàn tiền`,
    );
  }

  const percent =
    fault === FaultParty.CUSTOMER
      ? 0
      : (SHIP_FEE_COMPENSATION_PCT[ctx.category] ?? 0);
  if (percent <= 0) {
    return none(`${ctx.category}: không có mức bồi thường phí ship`);
  }
  if (shippingFee <= 0) {
    return none("Đơn không có phí ship để hoàn");
  }

  const amount = Math.min(
    shippingFee,
    Math.round((shippingFee * percent) / 100),
  );
  return {
    mode: "SHIP_COMPENSATION",
    amount,
    percent,
    reason: `${ctx.category}: hoàn ${percent}% phí ship (${amount}đ) — không đụng tiền món`,
  };
}
