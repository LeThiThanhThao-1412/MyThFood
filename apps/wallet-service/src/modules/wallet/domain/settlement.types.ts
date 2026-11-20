/**
 * Kiểu dữ liệu cho luồng route tiền khi đơn giao thất bại đã có phán quyết.
 * Dùng chung giữa order-service (tính tiền) và wallet-service (ghi sổ).
 */

export interface FailureSettlementInput {
  orderId: string;
  /** CUSTOMER | DRIVER | MERCHANT | SYSTEM */
  faultParty: string;
  severity: string;
  /** Vụ việc đã dẫn tới phán quyết — ghi lên escrow để đối soát (tùy chọn). */
  caseId?: string | null;
  /**
   * `true` khi đơn **đã giao xong** (khiếu nại sau giao: DAMAGED_ITEM, WRONG_ITEM…).
   *
   * Khác biệt cốt lõi: escrow của đơn đã giao xong vẫn còn hiệu lực ⇒ phải GIẢI
   * TOẢ để 23:00 trả tiền món cho nhà hàng và thu nhập ship cho tài xế. Bên lỗi
   * chịu ĐÚNG số tiền khách được hoàn; nền tảng không trả trước khoản nào.
   *
   * Bỏ trống/`false` = luồng đơn giao THẤT BẠI (không ai nhận được hàng): escrow
   * bị VOID và nền tảng ứng tiền trả nhà hàng/tài xế.
   */
  orderDelivered?: boolean;
  /** Thời điểm phán quyết — đóng dấu `settleOn` = 23:00 của ngày đó. */
  resolvedAt?: Date | string | null;
  isOnline?: boolean;
  consumerId?: string | null;
  merchantId?: string | null;
  driverId?: string | null;
  /** Tổng khách đã trả (đã trừ khuyến mãi). */
  total?: number;
  /** Tiền món thực thu của nhà hàng (subtotal - discount). */
  foodTotal?: number;
  /** Phí giao hàng khách trả. */
  shippingFee?: number;
  /**
   * @deprecated Không còn phạt tiền khi giao thất bại (thay bằng cảnh báo đơn
   * hàng). Giữ field để client cũ không vỡ; wallet-service bỏ qua giá trị này.
   */
  fine?: number;
}

export interface FailureSettlementResult {
  orderId: string;
  faultParty: string;
  severity: string;
  duplicated: boolean;
  isOnline: boolean;
  /** Tiền hoàn cho khách (store credit). */
  refundAmount: number;
  /** Tiền bồi thường tài xế (net shipping income). */
  driverCompensation: number;
  /** Tiền THỰC THU được từ nhà hàng (đã trừ vào số dư khả dụng). */
  merchantDebit: number;
  /**
   * Phần nhà hàng còn nợ (đã ghi clawback). Nợ được tách dòng theo `category`:
   * CUSTOMER_REFUND (hoàn tiền khách) + DRIVER_COMPENSATION (bồi thường tài xế).
   */
  merchantClawback: number;
  /** Tiền THỰC THU được từ tài xế (đã trừ vào số dư khả dụng). */
  driverDebit: number;
  /** Phần tài xế còn nợ (đã ghi clawback). */
  driverClawback: number;
  /**
   * @deprecated Luôn 0 — không còn phạt tiền khi giao thất bại.
   */
  fine: number;
  /** Ứng từ quỹ dự phòng. */
  reserveDisbursed: number;
  /** Phần nền tảng phải tự chịu (không có nguồn bù). */
  platformFunding: number;
  /** Số dòng settlement_entries được giải tỏa (→ PENDING). */
  escrowReleased: number;
  /** Số dòng settlement_entries bị vô hiệu (→ VOID). */
  escrowVoided: number;
  /** Chi tiết bổ sung (vd clawback của khách, số dòng escrow). */
  detail: Record<string, number>;
}

/**
 * Bồi thường cho đơn **đã giao xong** nhưng dịch vụ có lỗi (giao trễ, thái độ).
 *
 * Khác `FailureSettlementInput`: KHÔNG huỷ escrow, KHÔNG hoàn 100% giá trị đơn —
 * chỉ chuyển đúng một khoản từ ví bên lỗi sang ví khách.
 */
export interface CaseCompensationInput {
  orderId: string;
  /** Vụ việc (case) đã có phán quyết — chỉ để ghi log. */
  caseId?: string | null;
  /** Danh mục khiếu nại (DELIVERY_LATE...) — chỉ để ghi diễn giải. */
  category?: string | null;
  /** Bên được bồi thường (thường là CONSUMER). */
  creditorId: string;
  creditorType: string;
  /** Bên chịu chi phí (DRIVER | MERCHANT). */
  debtorId: string;
  debtorType: string;
  amount: number;
}

export interface CaseCompensationResult {
  orderId: string;
  /** Số tiền đã cộng cho bên được bồi thường. */
  amount: number;
  /** Số tiền THỰC trừ được từ ví bên lỗi (phần khả dụng). */
  charged: number;
  /** Phần bên lỗi còn nợ (đã ghi clawback, category = CUSTOMER_COMPENSATION). */
  clawback: number;
  duplicated: boolean;
  /** Lý do bỏ qua (AMOUNT_ZERO | INVALID_PARTIES | FAILURE_ALREADY_SETTLED...). */
  skipped: string | null;
}
