// ============================================================================
// Chính sách leo thang cho tài xế có tỉ lệ từ chối / không phản hồi đơn cao
// trong cửa sổ đánh giá (mặc định 30 ngày):
//   Bậc 1 -> WARNING (cảnh cáo)
//   Bậc 2 -> FINE    (phạt tiền)
//   Bậc 3 -> SUSPEND (tạm khóa)
//
// Lưu ý: mỗi lần từ chối/không phản hồi KHÔNG tạo "sự cố" riêng. Nó chỉ được
// ghi vào bảng driver_dispatch_offers để tính tỉ lệ. Khi tỉ lệ vượt ngưỡng,
// DriverComplianceService mới mở 1 case khiếu nại cho admin xử lý.
// ============================================================================

export type DriverCompliancePenaltyType = "WARNING" | "FINE" | "SUSPEND";

export interface DriverComplianceInput {
  /** Tổng số lượt tài xế được giao đơn (offer) trong cửa sổ đánh giá. */
  total: number;
  /** Số lượt tài xế chủ động từ chối. */
  declined: number;
  /** Số lượt tài xế không phản hồi (hệ thống tự chuyển đơn). */
  noResponse: number;
  /** Bậc cảnh báo hiện tại của tài xế (0 = chưa từng bị khiếu nại). */
  currentLevel: number;
  /** Số offer tối thiểu để đánh giá (tránh xử lý trên mẫu quá nhỏ). */
  minOffers: number;
  /** Ngưỡng tỉ lệ vi phạm để cảnh cáo. */
  warnRate: number;
  /** Ngưỡng tỉ lệ vi phạm để phạt tiền. */
  fineRate: number;
  /** Ngưỡng tỉ lệ vi phạm để tạm khóa. */
  suspendRate: number;
}

export interface DriverComplianceEscalation {
  level: 1 | 2 | 3;
  type: DriverCompliancePenaltyType;
  /** Tỉ lệ vi phạm (declined + noResponse) / total. */
  badRate: number;
}

const LEVEL_TYPE: Record<number, DriverCompliancePenaltyType> = {
  1: "WARNING",
  2: "FINE",
  3: "SUSPEND",
};

/**
 * Quyết định có nên mở khiếu nại/leo thang thêm 1 bậc hay không.
 * Trả về null nếu chưa đủ điều kiện (hoặc đã ở bậc cao nhất).
 */
export function decideDriverComplianceEscalation(
  input: DriverComplianceInput,
): DriverComplianceEscalation | null {
  const {
    total,
    declined,
    noResponse,
    currentLevel,
    minOffers,
    warnRate,
    fineRate,
    suspendRate,
  } = input;

  if (total < minOffers) return null;
  if (currentLevel >= 3) return null;

  const badRate = (declined + noResponse) / total;
  const nextLevel = currentLevel + 1; // 1 | 2 | 3

  const threshold =
    nextLevel === 1 ? warnRate : nextLevel === 2 ? fineRate : suspendRate;

  if (badRate < threshold) return null;

  return {
    level: nextLevel as 1 | 2 | 3,
    type: LEVEL_TYPE[nextLevel]!,
    badRate,
  };
}
