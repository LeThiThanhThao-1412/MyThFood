// ============================================================================
// Định dạng thời gian nhất quán theo múi giờ Việt Nam (Asia/Ho_Chi_Minh).
// Tránh lỗi timezone khi backend trả về timestamptz (UTC) còn browser/máy chủ
// có múi giờ khác nhau → hiển thị sai thời gian giao dịch.
// ============================================================================

export const VN_TIMEZONE = "Asia/Ho_Chi_Minh";

export function formatDateTime(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = value instanceof Date ? value : new Date(String(value));
  if (isNaN(date.getTime())) return String(value);
  return date.toLocaleString("vi-VN", {
    timeZone: VN_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = value instanceof Date ? value : new Date(String(value));
  if (isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("vi-VN", { timeZone: VN_TIMEZONE });
}

export function formatVnd(n: unknown): string {
  return (Number(n) || 0).toLocaleString("vi-VN") + "₫";
}

export function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}
