// ============================================================================
// MyThFood API base URL - qua Kong Gateway hoặc gọi trực tiếp từng service
// ============================================================================
// Mặc định đi qua gateway: http://localhost:8000 (xem docker/kong/kong.yml).
// Vẫn giữ cách chạy cũ: nếu NEXT_PUBLIC_API_GATEWAY trỏ đúng 1 cổng service
// (3001-3015) thì client gọi thẳng service đó như trước khi có gateway.
// ============================================================================

export const API_GATEWAY_URL =
  process.env.NEXT_PUBLIC_API_GATEWAY || "http://localhost:8000";

/** URL trỏ thẳng 1 service (cách chạy cũ, chưa có gateway). */
const DIRECT_SERVICE_BASE =
  /^https?:\/\/(localhost|127\.0\.0\.1):30(0[1-9]|1[0-5])\/?$/;

/** true khi NEXT_PUBLIC_API_GATEWAY vẫn trỏ thẳng 1 cổng service. */
export function isDirectServiceMode(): boolean {
  return DIRECT_SERVICE_BASE.test(API_GATEWAY_URL);
}

/**
 * Base URL để gọi API của 1 service.
 * - Có gateway: mọi service dùng chung base gateway, Kong route theo path.
 * - Không có gateway: dựng `http://localhost:<port>` như trước.
 */
export function resolveApiBase(servicePort: number): string {
  if (isDirectServiceMode()) return `http://localhost:${servicePort}`;
  return API_GATEWAY_URL.replace(/\/+$/, "");
}
