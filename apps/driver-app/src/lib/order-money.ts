// ============================================================================
// Tiền của một đơn giao — một nguồn sự thật cho mọi màn tài xế.
//
// Lỗi gốc: màn Ví tính `deliveryFee * 0.75` (nhầm tỉ lệ nhà hàng 75%) trong
// khi backend trả tài xế 80% phí ship (`DRIVER_COMMISSION_PERCENT=20`), và chỉ
// nhận diện COD khi `paymentMethod === "COD"` — nhưng order-service lưu đơn thu
// tiền mặt là `"CASH"` (consumer checkout gửi CASH), nên đơn COD bị hiển thị
// như đơn thẻ. Mọi màn (ví, chi tiết giao hàng, drawer, dashboard) phải dùng
// chung helper này để không lệch số với sổ ví (`wallet_transactions`).
// ============================================================================

import { toNum } from "./delivery-flow";

/**
 * Tỉ lệ tài xế hưởng trên phí ship — khớp `DRIVER_COMMISSION_PERCENT` (mặc
 * định 20) của wallet-service. Override khi deploy bằng
 * `NEXT_PUBLIC_DRIVER_SHARE` (giá trị 0..1, ví dụ `0.8`).
 */
export const DRIVER_SHARE = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_DRIVER_SHARE);
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 0.8;
})();

/**
 * Đơn thu tiền mặt (COD). Backend coi `CASH` ≡ `COD` (`order.service.ts`,
 * `wallet.service.ts`, `dispatch.service.ts`); `"COD"` chỉ là bí danh cũ nên
 * phải nhận cả hai — nếu chỉ so `=== "COD"` thì đơn tiền mặt hiện như đơn thẻ.
 * Đơn không rõ phương thức được coi là tiền mặt (mặc định của order-service).
 */
export function isCashOrder(
  order?: { paymentMethod?: string | null } | null,
): boolean {
  const method = String(order?.paymentMethod || "CASH").toUpperCase();
  return method === "CASH" || method === "COD";
}

/** Phí ship tài xế thực nhận của một đơn (80% `deliveryFee`). */
export function driverEarningOf(
  order?: { deliveryFee?: unknown } | null,
): number {
  return Math.round(toNum(order?.deliveryFee) * DRIVER_SHARE);
}
