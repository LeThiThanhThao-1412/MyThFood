// ============================================================================
// Chính sách leo thang tự động cho nhà hàng có tỉ lệ từ chối / không phản hồi
// đơn cao (cửa sổ 30 ngày):
//   Bậc 1 -> WARNING (cảnh cáo)
//   Bậc 2 -> FINE    (phạt tiền)
//   Bậc 3 -> SUSPEND (tạm khóa)
// Mỗi lần đánh giá chỉ tăng đúng 1 bậc để đảm bảo tính "leo thang" tuần tự.
// ============================================================================

export type CompliancePenaltyType = "WARNING" | "FINE" | "SUSPEND";

export interface MerchantComplianceInput {
  /** Tổng đơn hàng đến nhà hàng trong cửa sổ đánh giá. */
  total: number;
  /** Số đơn nhà hàng chủ động từ chối. */
  rejected: number;
  /** Số đơn nhà hàng không phản hồi (hệ thống tự từ chối). */
  noResponse: number;
  /** Bậc phạt hiện tại của nhà hàng (0 = chưa phạt). */
  currentLevel: number;
  /** Số đơn tối thiểu để bắt đầu đánh giá (tránh phạt trên mẫu quá nhỏ). */
  minOrders: number;
  /** Ngưỡng tỉ lệ vi phạm để cảnh cáo. */
  warnRate: number;
  /** Ngưỡng tỉ lệ vi phạm để phạt tiền. */
  fineRate: number;
  /** Ngưỡng tỉ lệ vi phạm để tạm khóa. */
  suspendRate: number;
}

export interface ComplianceEscalation {
  level: 1 | 2 | 3;
  type: CompliancePenaltyType;
  /** Tỉ lệ vi phạm (rejected + noResponse) / total. */
  badRate: number;
}

const LEVEL_TYPE: Record<number, CompliancePenaltyType> = {
  1: "WARNING",
  2: "FINE",
  3: "SUSPEND",
};

/**
 * Quyết định có nên leo thang thêm 1 bậc hay không.
 * Trả về null nếu chưa đủ điều kiện (hoặc đã ở bậc cao nhất).
 */
export function decideComplianceEscalation(
  input: MerchantComplianceInput,
): ComplianceEscalation | null {
  const {
    total,
    rejected,
    noResponse,
    currentLevel,
    minOrders,
    warnRate,
    fineRate,
    suspendRate,
  } = input;

  if (total < minOrders) return null;
  if (currentLevel >= 3) return null;

  const badRate = (rejected + noResponse) / total;
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
