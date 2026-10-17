/**
 * Chính sách thử lại dùng chung cho mọi client LLM.
 *
 * Lỗi 429/5xx (và lỗi mạng) là lỗi **tạm thời**: thử lại vài lần với backoff mũ
 * thường thành công, nên admin không phải bấm lại nút "Phân tích".
 */

/** Chờ tối đa giữa 2 lần thử, tránh treo request quá lâu. */
export const MAX_RETRY_DELAY_MS = 15000;

const RETRYABLE_STATUSES = [408, 409, 429, 500, 502, 503, 504];

/** Lỗi có khả năng tự khỏi nếu gọi lại. Không có `response` = lỗi mạng/timeout. */
export function isRetryableStatus(status: unknown): boolean {
  if (status === undefined || status === null) return true;
  return RETRYABLE_STATUSES.includes(Number(status));
}

/**
 * Chờ bao lâu trước lần thử kế tiếp.
 *
 * Ưu tiên `Retry-After` do nhà cung cấp trả về; nếu không có thì backoff mũ +
 * jitter (tránh nhiều request cùng dồn vào một thời điểm).
 */
export function retryDelayMs(
  baseMs: number,
  attempt: number,
  headers?: Record<string, unknown>,
): number {
  const retryAfter = Number(
    headers?.["retry-after"] ?? headers?.["Retry-After"],
  );
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(Math.round(retryAfter * 1000), MAX_RETRY_DELAY_MS);
  }

  const backoff = baseMs * 2 ** (attempt - 1);
  const jitter = Math.random() * 0.25 * backoff;
  return Math.min(Math.round(backoff + jitter), MAX_RETRY_DELAY_MS);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Đọc số từ biến môi trường, có mặc định và kẹp khoảng hợp lệ. */
export function envNumber(
  name: string,
  fallback: number,
  min: number,
  max?: number,
): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  const floored = Math.floor(parsed);
  return max !== undefined ? Math.min(floored, max) : floored;
}

/** Rút gọn thông báo lỗi để ghi log/ trả về FE. */
export function shorten(text: unknown, max = 200): string {
  const flat = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
