// ============================================================================
// Chính sách cảnh báo tỉ lệ khiếu nại hợp lệ của nhà hàng (cửa sổ 7 ngày):
//   - Tỉ lệ > 5%  ⇒ tạo cảnh báo hiển thị trên app nhà hàng (bấm "Đã hiểu" để ẩn)
//   - Tỉ lệ > 15% ⇒ khóa tài khoản 1 tháng
//
// Tỉ lệ = số khiếu nại có phán quyết VALID / tổng số đơn trong cửa sổ.
// So sánh **nghiêm ngặt** (>) đúng như yêu cầu: đúng 5% chưa cảnh báo, đúng
// 15% chỉ cảnh báo chứ chưa khóa.
// ============================================================================

export type MerchantComplaintLevel = "NONE" | "WARNING" | "LOCK";

/** Ngưỡng mặc định — có thể ghi đè bằng biến môi trường. */
export const MERCHANT_COMPLAINT_DEFAULTS = {
  windowDays: 7,
  warnRate: 0.05,
  lockRate: 0.15,
  lockDays: 30,
  /** Số đơn tối thiểu để đánh giá (tránh chia cho 0). */
  minOrders: 1,
} as const;

export interface MerchantComplaintInput {
  /** Tổng số đơn của nhà hàng trong cửa sổ đánh giá. */
  totalOrders: number;
  /** Số khiếu nại có phán quyết VALID trong cửa sổ. */
  validComplaints: number;
  /** Số đơn tối thiểu để bắt đầu đánh giá. */
  minOrders: number;
  /** Ngưỡng tạo cảnh báo (mặc định 0.05). */
  warnRate: number;
  /** Ngưỡng khóa tài khoản (mặc định 0.15). */
  lockRate: number;
}

export interface MerchantComplaintDecision {
  level: MerchantComplaintLevel;
  /** validComplaints / totalOrders, làm tròn 4 chữ số thập phân. */
  rate: number;
}

/**
 * Quyết định mức xử lý theo tỉ lệ khiếu nại hợp lệ.
 *
 * Trả `NONE` khi chưa đủ số đơn tối thiểu hoặc tỉ lệ chưa vượt ngưỡng cảnh báo.
 */
export function decideMerchantComplaintLevel(
  input: MerchantComplaintInput,
): MerchantComplaintDecision {
  const totalOrders = Math.max(0, Number(input.totalOrders) || 0);
  const validComplaints = Math.max(0, Number(input.validComplaints) || 0);
  const rate =
    totalOrders > 0
      ? Math.round((validComplaints / totalOrders) * 10000) / 10000
      : 0;

  if (totalOrders < Math.max(1, input.minOrders)) {
    return { level: "NONE", rate };
  }
  if (rate <= input.warnRate) {
    return { level: "NONE", rate };
  }
  if (rate > input.lockRate) {
    return { level: "LOCK", rate };
  }
  return { level: "WARNING", rate };
}

/**
 * Khóa tuần ISO (UTC) dùng để chống tạo trùng cảnh báo mỗi lần cron chạy.
 * Ví dụ: `2026-W47`.
 */
export function complaintPeriodKey(date: Date = new Date()): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // Thứ Năm của tuần hiện tại quyết định năm ISO.
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Đầu tuần ISO (thứ Hai 00:00 UTC) — mốc hiển thị của cửa sổ đánh giá. */
export function startOfIsoWeek(date: Date = new Date()): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 1);
  return d;
}
