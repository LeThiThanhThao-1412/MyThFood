/**
 * Chính sách số đơn "đang hoạt động" của một khách hàng.
 *
 * Trước đây mỗi tài khoản chỉ được có 1 đơn chưa hoàn tất, nên khách muốn đặt
 * thêm đơn ở quán khác buộc phải chờ giao xong hoặc hủy đơn cũ. Nay khách được
 * đặt nhiều đơn cùng lúc (mỗi đơn vẫn là một order độc lập, có tài xế/thanh
 * toán riêng). Để vẫn có van an toàn chống lạm dụng, hệ thống cho phép cấu hình
 * trần qua biến môi trường `MAX_ACTIVE_ORDERS_PER_CONSUMER`:
 *
 * - Bỏ trống / `0` / giá trị không hợp lệ → không giới hạn (mặc định).
 * - `n > 0` → tối đa `n` đơn đang hoạt động cùng lúc.
 */
export const MAX_ACTIVE_ORDERS_ENV = "MAX_ACTIVE_ORDERS_PER_CONSUMER";

/**
 * Chuẩn hoá giá trị cấu hình trần đơn đồng thời.
 * Trả về `0` khi không giới hạn.
 */
export function resolveMaxActiveOrdersPerConsumer(
  raw: string | undefined = process.env[MAX_ACTIVE_ORDERS_ENV],
): number {
  if (typeof raw !== "string" || raw.trim() === "") {
    return 0;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

/**
 * `true` khi khách đã chạm trần đơn đồng thời và không được đặt thêm.
 * `maxActiveOrders <= 0` nghĩa là không giới hạn → luôn `false`.
 */
export function isActiveOrderLimitReached(
  activeOrderCount: number,
  maxActiveOrders: number,
): boolean {
  if (maxActiveOrders <= 0) {
    return false;
  }
  return activeOrderCount >= maxActiveOrders;
}
