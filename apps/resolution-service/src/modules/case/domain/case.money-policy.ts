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
 *  - `ITEM_COMPENSATION`— đơn ĐÃ giao xong, khách chỉ thiếu/sai/hỏng MỘT PHẦN món
 *                          ⇒ bồi thường đúng **giá trị phần món đó** (admin
 *                          nhập/chọn từ danh sách món), trừ vào ví bên lỗi;
 *                          phần món khách đã dùng vẫn được quyết toán bình
 *                          thường. Đây là mức mặc định của RS-C1 trong
 *                          `test/2-test-cases/TC-RESOLUTION.md`.
 *  - `SHIP_COMPENSATION`— đơn ĐÃ giao xong, lỗi đến từ dịch vụ (giao trễ, thái
 *                          độ) ⇒ chỉ hoàn tối đa **phí ship** cho khách và trừ
 *                          đúng bên lỗi; tiền món của nhà hàng không bị đụng.
 *  - `NONE`             — không phát sinh dòng tiền (chỉ cảnh báo/trừ điểm).
 *
 * Mọi con số ở đây tính trên **số khách THỰC TRẢ** (`allocateDiscount()`), không
 * phải giá niêm yết: khuyến mãi của đơn (freeship, mã giảm giá) đã được trừ vào
 * `totalAmount`, nên hoàn theo `deliveryFee`/`subtotal` niêm yết là trả khách số
 * tiền họ chưa từng bỏ ra và trừ oan bên lỗi.
 */

export type CaseMoneyMode =
  | "FULL_REFUND"
  | "ITEM_COMPENSATION"
  | "SHIP_COMPENSATION"
  | "NONE";

/** Ảnh chụp tối thiểu của đơn hàng (order-service `GET /orders/:id`). */
export interface CaseMoneyOrderSnapshot {
  status?: string | null;
  /** Tổng khách đã trả (món + ship + phí dịch vụ − khuyến mãi). */
  totalAmount?: number | string | null;
  /** Tiền món **trước** khuyến mãi. */
  subtotal?: number | string | null;
  /** Phí giao hàng niêm yết (GROSS, chưa trừ hoa hồng tài xế/khuyến mãi). */
  deliveryFee?: number | string | null;
  /** Phí dịch vụ nền tảng (không chịu phân bổ khuyến mãi). */
  serviceFee?: number | string | null;
  /** Tổng khuyến mãi của đơn (đã trừ vào `totalAmount`). */
  discount?: number | string | null;
  /** Bên chịu khuyến mãi (MERCHANT | PLATFORM) — chỉ để truy vết. */
  discountFundedBy?: string | null;
}

/**
 * Số tiền khách **THỰC TRẢ** cho từng thành phần của đơn.
 *
 * Vì sao cần: `deliveryFee`/`subtotal` là giá niêm yết, còn khuyến mãi của đơn
 * (freeship, mã giảm giá...) được trừ vào tổng. Bồi thường/hoàn tiền theo giá
 * niêm yết sẽ trả cho khách số tiền họ chưa từng bỏ ra và trừ oan bên lỗi.
 * Khuyến mãi được phân bổ **theo tỷ lệ** giữa tiền món và phí ship; phần dư
 * (làm tròn) dồn về tiền món để `itemDiscountShare + shippingDiscountShare`
 * luôn bằng đúng tổng khuyến mãi.
 */
export interface CaseMoneyPaidBasis {
  /** Tiền món khách thực trả (subtotal − phần khuyến mãi của món). */
  itemPaid: number;
  /** Phí ship khách thực trả (deliveryFee − phần khuyến mãi của ship). */
  shippingFeePaid: number;
  /** Phí dịch vụ khách trả (không phân bổ khuyến mãi). */
  serviceFeePaid: number;
  /** Khuyến mãi phân bổ cho phần ship. */
  shippingDiscountShare: number;
  /** Khuyến mãi phân bổ cho phần món. */
  itemDiscountShare: number;
  /** Trần hoàn tiền của cả đơn = tổng khách thực trả. */
  totalPaid: number;
}

export interface CaseMoneyContext {
  verdict: Verdict | null;
  faultParty: FaultParty | null;
  category: CaseCategory;
  reporterType: ActorType;
  order: CaseMoneyOrderSnapshot | null;
  /**
   * Số tiền bồi thường admin chọn cho phần món bị thiếu/sai/hỏng (đồng).
   *
   * Chỉ dùng cho `PARTIAL_ITEM_CATEGORIES`: khách vẫn dùng được phần lớn đơn
   * nên KHÔNG hoàn 100% mà chỉ trả lại đúng giá trị phần món bị thiếu. Bỏ trống
   * ⇒ giữ nguyên chính sách cũ (hoàn 100% đơn) để không âm thầm trả thiếu.
   */
  requestedAmount?: number | null;
}

export interface CaseMoneyDecision {
  mode: CaseMoneyMode;
  /** Số tiền hoàn/bồi thường cho bên khiếu nại (đồng). */
  amount: number;
  /** Tỷ lệ phí ship được hoàn (chỉ dùng cho `SHIP_COMPENSATION`). */
  percent: number;
  /** Cơ sở "số thực trả" đã dùng để ra con số trên (null khi không đọc được đơn). */
  paidBasis: CaseMoneyPaidBasis | null;
  /** Giải thích ngắn — ghi log để hậu kiểm được vì sao ra con số này. */
  reason: string;
}

/** Trạng thái đơn coi như "khách đã nhận hàng". */
const DELIVERED_ORDER_STATUSES = new Set(["DELIVERED", "COMPLETED"]);

/**
 * Danh mục mà khách **không có được hàng/món dùng được** ⇒ hoàn 100% giá trị
 * đơn dù đơn đã được đánh dấu DELIVERED (bấm giao khống, thiếu món, hỏng...).
 *
 * Lưu ý: `MISSING_ITEM` / `WRONG_ITEM` / `DAMAGED_ITEM` nằm trong
 * `PARTIAL_ITEM_CATEGORIES` — khi admin nhập số tiền bồi thường thì chỉ trả đúng
 * phần món đó (`ITEM_COMPENSATION`); bỏ trống mới rơi về hoàn 100% ở đây.
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
 * Danh mục bồi thường THEO GIÁ TRỊ MÓN: đơn đã giao xong nhưng một phần món bị
 * thiếu / sai / hỏng — khách vẫn dùng được phần còn lại.
 *
 * Vì sao cần: hoàn 100% đơn cho một món thiếu là trả khách số tiền họ chưa từng
 * mất (đơn 126.038đ, thiếu món 40.000đ ⇒ khách nhận 126.038đ), đồng thời trừ
 * oan nhà hàng toàn bộ doanh thu của đơn. Chính sách đúng là chuyển đúng giá
 * trị phần món bị lỗi từ ví nhà hàng sang ví khách; phần còn lại quyết toán
 * bình thường lúc 23:00 (RS-C1 trong `test/2-test-cases/TC-RESOLUTION.md`).
 */
export const PARTIAL_ITEM_CATEGORIES: ReadonlySet<CaseCategory> = new Set([
  CaseCategory.MISSING_ITEM,
  CaseCategory.WRONG_ITEM,
  CaseCategory.DAMAGED_ITEM,
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
 * Phân bổ khuyến mãi của đơn cho từng thành phần và trả về **số khách thực trả**.
 *
 * Quy tắc (đã chốt): khuyến mãi chia theo trọng số `subtotal : deliveryFee`;
 * phần làm tròn dồn về tiền món; không phần nào bị âm và không thành phần nào
 * nhận khuyến mãi vượt quá giá niêm yết của chính nó. `serviceFee` không chịu
 * phân bổ (phí nền tảng), nên `totalPaid` không bao giờ vượt `totalAmount`.
 *
 * Hàm thuần, không I/O ⇒ test được toàn bộ ma trận voucher/giảm giá.
 */
export function allocateDiscount(
  order: CaseMoneyOrderSnapshot | null,
): CaseMoneyPaidBasis {
  const deliveryFee = toAmount(order?.deliveryFee);
  const serviceFee = toAmount(order?.serviceFee);
  const discount = toAmount(order?.discount);
  const total = toAmount(order?.totalAmount);

  // Ảnh chụp cũ chỉ có `totalAmount` + `deliveryFee` ⇒ suy ra tiền món từ tổng
  // (total = subtotal + ship + service − discount) để không phá dữ liệu cũ.
  const declaredSubtotal = toAmount(order?.subtotal);
  const subtotal =
    declaredSubtotal > 0
      ? declaredSubtotal
      : Math.max(0, total + discount - deliveryFee - serviceFee);

  const base = subtotal + deliveryFee;
  let shippingDiscountShare =
    discount > 0 && base > 0 ? Math.round((discount * deliveryFee) / base) : 0;
  shippingDiscountShare = Math.min(
    shippingDiscountShare,
    deliveryFee,
    discount,
  );

  const itemDiscountShare = Math.min(
    Math.max(0, discount - shippingDiscountShare),
    subtotal,
  );

  const shippingFeePaid = Math.max(0, deliveryFee - shippingDiscountShare);
  const itemPaid = Math.max(0, subtotal - itemDiscountShare);
  const paidTotal = itemPaid + shippingFeePaid + serviceFee;
  const totalPaid = total > 0 ? Math.min(total, paidTotal) : paidTotal;

  return {
    itemPaid,
    shippingFeePaid,
    serviceFeePaid: serviceFee,
    shippingDiscountShare,
    itemDiscountShare,
    totalPaid,
  };
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
    paidBasis: null,
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

  const listedShippingFee = toAmount(order.deliveryFee);
  // Bồi thường/hoàn tiền luôn dựa trên số khách THỰC TRẢ, không phải giá niêm yết.
  const paid = allocateDiscount(order);
  const shippingFee = paid.shippingFeePaid;
  const status = String(order.status ?? "").toUpperCase();
  const delivered = DELIVERED_ORDER_STATUSES.has(status);
  const shippingNote =
    paid.shippingDiscountShare > 0
      ? ` (niêm yết ${listedShippingFee}đ − khuyến mãi ${paid.shippingDiscountShare}đ)`
      : "";

  // Đơn chưa giao xong (DELIVERY_FAILED / CANCELLED / đang chạy...) ⇒ giữ
  // nguyên luồng quyết toán giao thất bại: hoàn 100% + huỷ escrow.
  if (!delivered) {
    return {
      mode: "FULL_REFUND",
      amount: paid.totalPaid,
      percent: 100,
      paidBasis: paid,
      reason: `Đơn ở trạng thái ${status || "?"} (chưa giao xong) — quyết toán như giao thất bại, hoàn ${paid.totalPaid}đ khách thực trả`,
    };
  }

  // Đơn đã giao nhưng khách không có hàng để dùng ⇒ hoàn 100%.
  if (FULL_REFUND_CATEGORIES.has(ctx.category)) {
    // Ngoại lệ: khách chỉ thiếu/sai/hỏng MỘT PHẦN món và admin đã chọn số tiền
    // bồi thường ⇒ chỉ chuyển đúng phần đó từ ví bên lỗi, KHÔNG hoàn cả đơn.
    const requested = toAmount(ctx.requestedAmount);
    if (
      requested > 0 &&
      PARTIAL_ITEM_CATEGORIES.has(ctx.category) &&
      ctx.reporterType === "CONSUMER" &&
      paid.itemPaid > 0
    ) {
      // Yêu cầu ≥ toàn bộ tiền món ⇒ thực chất khách không dùng được gì: hoàn
      // 100% (gồm cả ship/phí), nếu không sẽ trả thiếu so với chính sách.
      const amount =
        requested >= paid.itemPaid
          ? paid.totalPaid
          : Math.min(requested, paid.itemPaid, paid.totalPaid);
      return {
        mode: "ITEM_COMPENSATION",
        amount,
        percent: 0,
        paidBasis: paid,
        reason:
          `${ctx.category}: bồi thường ${amount}đ ` +
          (amount >= paid.totalPaid
            ? `= toàn bộ ${paid.totalPaid}đ khách thực trả (yêu cầu ${requested}đ ≥ tiền món ${paid.itemPaid}đ)`
            : `giá trị phần món bị lỗi (yêu cầu ${requested}đ, trần tiền món thực trả ${paid.itemPaid}đ; đơn ${paid.totalPaid}đ)`),
      };
    }

    return {
      mode: "FULL_REFUND",
      amount: paid.totalPaid,
      percent: 100,
      paidBasis: paid,
      reason: `${ctx.category}: khách không nhận được hàng/món dùng được — hoàn ${paid.totalPaid}đ khách thực trả`,
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
    return none(
      paid.shippingDiscountShare > 0
        ? `Phí ship niêm yết ${listedShippingFee}đ đã được khuyến mãi ${paid.shippingDiscountShare}đ — khách không thực trả phí ship nên không có gì để hoàn`
        : "Đơn không có phí ship để hoàn",
    );
  }

  // Hoàn theo tỷ lệ của **phí ship thực trả**, và không bao giờ vượt quá tổng
  // tiền khách đã trả cho đơn.
  const amount = Math.min(
    shippingFee,
    Math.round((shippingFee * percent) / 100),
    paid.totalPaid > 0 ? paid.totalPaid : shippingFee,
  );
  return {
    mode: "SHIP_COMPENSATION",
    amount,
    percent,
    paidBasis: paid,
    reason: `${ctx.category}: hoàn ${percent}% phí ship THỰC TRẢ${shippingNote} = ${amount}đ — không đụng tiền món`,
  };
}
