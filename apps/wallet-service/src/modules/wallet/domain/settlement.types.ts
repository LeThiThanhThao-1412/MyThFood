/**
 * Kiểu dữ liệu cho luồng route tiền khi đơn giao thất bại đã có phán quyết.
 * Dùng chung giữa order-service (tính tiền) và wallet-service (ghi sổ).
 */

export interface FailureSettlementInput {
  orderId: string;
  /** CUSTOMER | DRIVER | MERCHANT | SYSTEM */
  faultParty: string;
  severity: string;
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
