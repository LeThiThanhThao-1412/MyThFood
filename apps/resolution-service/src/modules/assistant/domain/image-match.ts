/**
 * "% TRÙNG KHỚP" của ảnh khách chụp so với ĐƠN ĐÃ ĐẶT — lớp chấm điểm cho thí
 * nghiệm image-matching, **không phải** độ giống ảnh.
 *
 * Vì sao phải tách khỏi `compareInventory`: `compareInventory` trả `verdict` +
 * `missing`, nhưng không trả một con số 0–100 % để (a) hiển thị cho khách/admin,
 * (b) đặt ngưỡng tự động duyệt/từ chối, (c) chấm điểm thí nghiệm. Con số đó KHÔNG
 * được tính bằng embedding/pixel similarity: cùng một combo, khách chụp góc khác
 * hay bật flash là độ giống ảnh tụt xuống 0.3 trong khi vẫn **đủ 4/4 món**. Đo
 * bằng độ giống ảnh sẽ biến "chụp xấu" thành "thiếu món" — sai bản chất vụ việc.
 *
 * Ở đây `matchScore` = Σ số phần khớp ÷ Σ số phần đã đặt (5/6 = 0.8333). Đây là
 * phép đếm, tất định, audit lại được, và khớp đúng cách `compareInventory` đã
 * tính `matchedQuantity`.
 *
 * Ngưỡng (`ImageMatchPolicy`) là **quyết định sản phẩm**, không phải hằng số toán
 * học: cùng một model, đổi ngưỡng là đổi tỉ lệ hoàn tiền oan / bỏ sót. Vì vậy nó
 * được tách thành tham số để vòng 3 của thí nghiệm calibrate được trên dữ liệu.
 *
 * Toàn bộ hàm ở file này là hàm THUẦN: không I/O, không `Date`, không random,
 * không throw — để unit-test 100 % deterministic và để harness chấm điểm lại
 * được sau nhiều tháng.
 */

import type { CaseOrderItem } from "./assistant.types";
import {
  compareInventory,
  INVENTORY_COVERAGE,
  type CompareInventoryOptions,
  type InventoryComparison,
  type InventoryCoverage,
  type InventoryLabel,
  type InventoryVerdict,
  type ItemInventoryEntry,
} from "./item-inventory";

/** Số phần tối thiểu để coi một dòng đơn là hợp lệ (0 và số âm bị bỏ). */
function toQuantity(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/** Tổng số phần của đơn — mẫu số của `matchScore`. */
export function totalOrderedQuantity(
  orderItems: readonly CaseOrderItem[] | null | undefined,
): number {
  return (orderItems ?? []).reduce(
    (total, item) => total + toQuantity(item?.quantity),
    0,
  );
}

export interface ImageMatchScore {
  verdict: InventoryVerdict;
  /** Tổng số phần trong đơn (mẫu số). */
  totalQuantity: number;
  /** Số phần ảnh có và đúng món (tử số) — do `compareInventory` đếm. */
  matchedQuantity: number;
  /**
   * `matchedQuantity / totalQuantity`, làm tròn 4 chữ số.
   * `null` = KHÔNG chấm được (ảnh mờ, ảnh chỉ bày một phần đơn, thiếu danh sách
   * món) — khác hẳn 0 (đã chấm và ảnh không có món nào).
   */
  matchScore: number | null;
  missing: ItemInventoryEntry[];
  extra: ItemInventoryEntry[];
  /** Trần bồi thường của phần thiếu; `null` khi thiếu đơn giá. */
  missingValue: number | null;
  comparison: InventoryComparison;
}

/**
 * Chấm "% trùng khớp" của MỘT ảnh với đơn.
 *
 * Ảnh không chấm được ⇒ `matchScore: null` (KHÔNG phải 0) để nơi gọi không vô
 * tình coi "không đọc được ảnh" là "ảnh trống" rồi hoàn tiền toàn bộ đơn.
 */
export function scoreImageMatch(
  orderItems: readonly CaseOrderItem[] | null | undefined,
  label: InventoryLabel | null | undefined,
  opts: CompareInventoryOptions = {},
): ImageMatchScore {
  const comparison = compareInventory(orderItems, label, opts);
  const totalQuantity = totalOrderedQuantity(orderItems);

  const scorable = comparison.verdict !== "UNCLEAR" && totalQuantity > 0;
  const matchedQuantity = scorable
    ? Math.min(comparison.matchedQuantity, totalQuantity)
    : 0;

  return {
    verdict: comparison.verdict,
    totalQuantity,
    matchedQuantity,
    matchScore: scorable
      ? Number((matchedQuantity / totalQuantity).toFixed(4))
      : null,
    missing: comparison.missing,
    extra: comparison.extra,
    missingValue: comparison.missingValue,
    comparison,
  };
}

// ============================================================================
// Ngưỡng & quyết định (policy — sản phẩm, không phải toán học)
// ============================================================================

export const IMAGE_MATCH_DECISIONS = [
  "AUTO_APPROVE",
  "AUTO_REJECT",
  "NEEDS_REVIEW",
] as const;
export type ImageMatchDecision = (typeof IMAGE_MATCH_DECISIONS)[number];

export interface ImageMatchPolicy {
  /**
   * `matchScore <=` ngưỡng này ⇒ đủ căn cứ hoàn tiền phần thiếu (mặc định 0.80).
   *
   * Vì sao 0.80 chứ không 0.85: đo live 58 mẫu (4 lượt) thấy 0.85 và 0.80 cho **kết
   * quả y hệt** — không mẫu nào rơi vào (0.80, 0.85]. Nhưng 0.80 rẻ hơn khi gặp dữ
   * liệu thật (ảnh thật sẽ nhiễu hơn ảnh catalog, điểm sẽ nằm rải rác hơn): mọi ca
   * nằm trong (0.80, 0.85] được chuyển người thay vì tự hoàn. Hoàn oan đắt hơn để
   * người xem, nên chọn mức chặt hơn khi dữ liệu chưa phân biệt được hai mức.
   * Hạ tiếp xuống 0.75 thì **mất 6 ca tự duyệt đúng** (đơn 5 món thiếu 1 = 80 %) ⇒
   * không hạ.
   */
  autoApproveAtOrBelow: number;
  /** `matchScore >=` ngưỡng này ⇒ ảnh đủ món ⇒ bác claim (mặc định 1). */
  autoRejectAtOrAbove: number;
  /**
   * Chỉ tự BÁC khi đơn có tổng số phần ≤ ngưỡng này (mặc định 5).
   *
   * Vì sao không bác mọi đơn: đo live 07/11/2026 (4 lượt, cùng 58 mẫu, prompt cho
   * model xem danh sách món) — 4 ca `MATCH` SAI đều nằm ở combo 8 món (khay bún
   * đậu): model đếm đủ 8/8 trong khi ảnh thiếu 1. Bác sai = khách bị từ chối oan
   * + mất quyền kiện lại, nên với đơn nhiều món phải để người xem. Đơn ≤ 5 phần
   * thì cả 12/12 ca `MATCH` đều đúng ở lượt v3 và v4.
   *
   * Để optional cho nơi gọi cũ chỉ cần 2 ngưỡng %: thiếu thì dùng
   * `DEFAULT_AUTO_REJECT_MAX_TOTAL_QUANTITY`.
   */
  autoRejectMaxTotalQuantity?: number;
}

export const DEFAULT_AUTO_REJECT_MAX_TOTAL_QUANTITY = 5;

export const DEFAULT_IMAGE_MATCH_POLICY: ImageMatchPolicy = {
  autoApproveAtOrBelow: 0.8,
  autoRejectAtOrAbove: 1,
  autoRejectMaxTotalQuantity: DEFAULT_AUTO_REJECT_MAX_TOTAL_QUANTITY,
};

export interface ImageMatchDecisionResult {
  decision: ImageMatchDecision;
  /** Lý do đọc được bằng tiếng Việt (panel admin / biên bản). */
  reason: string;
  /** Trần hoàn tiền theo ảnh — chỉ khác `null` khi AUTO_APPROVE và có đơn giá. */
  refundCap: number | null;
}

function isUsablePolicy(policy: ImageMatchPolicy): boolean {
  const approve = policy?.autoApproveAtOrBelow;
  const reject = policy?.autoRejectAtOrAbove;
  return (
    Number.isFinite(approve) &&
    Number.isFinite(reject) &&
    approve >= 0 &&
    reject <= 1 &&
    approve < reject
  );
}

/**
 * Chuyển "% trùng khớp" thành quyết định xử lý.
 *
 * Nguyên tắc: máy chỉ tự quyết khi bằng chứng **một chiều**; mọi vùng xám đẩy về
 * người (fail-closed), vì bỏ sót một vụ thiếu món rẻ hơn nhiều so với tự động
 * hoàn tiền oan.
 */
export function decideImageMatch(
  score: ImageMatchScore,
  policy: ImageMatchPolicy = DEFAULT_IMAGE_MATCH_POLICY,
): ImageMatchDecisionResult {
  if (!isUsablePolicy(policy)) {
    return {
      decision: "NEEDS_REVIEW",
      reason:
        "Ngưỡng cấu hình không hợp lệ (cần 0 ≤ approve < reject ≤ 1) ⇒ chuyển người xử lý",
      refundCap: null,
    };
  }
  if (score.matchScore === null) {
    return {
      decision: "NEEDS_REVIEW",
      reason:
        score.comparison.reasons[0] ?? "Ảnh không chấm được nên không kết luận",
      refundCap: null,
    };
  }
  if (score.verdict === "EXTRA") {
    return {
      decision: "NEEDS_REVIEW",
      reason:
        "Ảnh có món KHÔNG nằm trong đơn ⇒ có thể giao nhầm, cần người xác minh",
      refundCap: null,
    };
  }
  if (score.matchScore >= policy.autoRejectAtOrAbove) {
    const configured = policy.autoRejectMaxTotalQuantity;
    const maxForReject =
      typeof configured === "number" && Number.isFinite(configured)
        ? configured
        : DEFAULT_AUTO_REJECT_MAX_TOTAL_QUANTITY;
    if (score.totalQuantity > maxForReject) {
      return {
        decision: "NEEDS_REVIEW",
        reason:
          `Ảnh khớp ${score.matchedQuantity}/${score.totalQuantity} phần nhưng đơn có ` +
          `${score.totalQuantity} phần (> ${maxForReject}) ⇒ đơn nhiều món, model hay đếm dư ` +
          "⇒ chuyển người xác minh thay vì bác tự động",
        refundCap: null,
      };
    }
    return {
      decision: "AUTO_REJECT",
      reason: `Ảnh khớp ${score.matchedQuantity}/${score.totalQuantity} phần ⇒ không có căn cứ thiếu món`,
      refundCap: null,
    };
  }
  if (score.matchScore <= policy.autoApproveAtOrBelow) {
    const missingText = score.missing
      .map((item) => `${item.name} x${item.quantity}`)
      .join(", ");
    return {
      decision: "AUTO_APPROVE",
      reason:
        `Ảnh chỉ khớp ${score.matchedQuantity}/${score.totalQuantity} phần ` +
        `(${(score.matchScore * 100).toFixed(0)}%) ≤ ngưỡng ` +
        `${(policy.autoApproveAtOrBelow * 100).toFixed(0)}%` +
        (missingText ? ` — thiếu: ${missingText}` : ""),
      refundCap: score.missingValue,
    };
  }
  return {
    decision: "NEEDS_REVIEW",
    reason:
      `Khớp ${(score.matchScore * 100).toFixed(0)}% nằm trong vùng xám ` +
      `(${(policy.autoApproveAtOrBelow * 100).toFixed(0)}%–${(policy.autoRejectAtOrAbove * 100).toFixed(0)}%)`,
    refundCap: null,
  };
}

// ============================================================================
// Từ KIỂM KÊ của model ⇒ nhãn tất định (đường production)
// ============================================================================
//
// Vì sao cần lớp này: production trước đây chỉ hỏi model "ảnh giao hàng có khớp
// đơn không" (`deliveryProof.matchesOrder`) rồi **tin nguyên câu trả lời**. Cách
// đó không đếm được ("đơn 3 món, ảnh có 2"), không audit lại được, và đặt toàn
// bộ quyết định hoàn tiền vào một token model có thể bịa. Ở đây model chỉ còn
// làm việc nó giỏi (nhìn và đếm), còn phép trừ số lượng do code làm.

/**
 * Kiểm kê THÔ model trả về cho một bên ảnh.
 *
 * Cố ý để `unknown` từng field: dữ liệu này đến từ JSON của model — có thể thiếu
 * khóa, sai kiểu, hoặc độn thêm khóa lạ. Mọi hàm bên dưới phải chịu được rác mà
 * không throw, vì một lần throw ở đây làm mất cả phần phân tích còn lại.
 */
export interface ImageInventoryEvidence {
  items?: unknown;
  boxes?: unknown;
  countable?: unknown;
  sealed?: unknown;
  coverage?: unknown;
}

/** Bên ảnh — ghi rõ điểm khớp này tính từ ảnh nào (panel admin đọc được). */
export type ImageEvidenceSide = "DELIVERY_PROOF" | "REPORTER";

/**
 * Bản rút gọn của một phép chấm — đủ để nhét vào prompt lượt chữ, log shadow và
 * hiển thị cho admin, nhưng KHÔNG mang theo `comparison` (nặng, thừa).
 */
export interface ImageMatchSummary {
  side: ImageEvidenceSide;
  verdict: InventoryVerdict;
  matchedQuantity: number;
  totalQuantity: number;
  matchScore: number | null;
  decision: ImageMatchDecision;
  /** Lý do đọc được bằng tiếng Việt (từ `decideImageMatch`). */
  reason: string;
  /** "chè thái x1, gà rán x2" — rỗng khi không thiếu món nào. */
  missingText: string;
  /** "trà sữa x1" — món có trong ảnh nhưng không có trong đơn. */
  extraText: string;
  /** Trần hoàn tiền theo ảnh; `null` khi thiếu đơn giá hoặc không tự duyệt. */
  refundCap: number | null;
  /**
   * Chỉ có ở bên `REPORTER` khi chạy chế độ **ghép cặp ảnh**: số cặp đã đọc và
   * số cặp cần đọc. `pairCount < pairsTotal` ⇒ điểm khớp chỉ tính trên phần đơn
   * đã ghép được cặp, KHÔNG phải toàn đơn — admin phải thấy con số này trước khi
   * tin điểm.
   */
  pairCount?: number;
  pairsTotal?: number;
  /** Trung bình `similarityPercent` giữa ảnh thực đơn và ảnh khách (0–100). */
  similarityAvg?: number | null;
  /** "mì xào bò (giống 20 %)" — món nhìn thấy KHÁC loại so với ảnh thực đơn. */
  wrongItemsText?: string;
}

/**
 * Đọc mã dòng đơn model trỏ tới: chấp nhận `#3`, `3`, `3.`. Trả `null` nếu
 * không phải chỉ số dòng hợp lệ (âm, 0, vượt số dòng, chữ lạ).
 *
 * Vì sao mã dòng chứ không phải `menuItemId`: `menuItemId` có thể null (món
 * không gắn thực đơn) và có thể TRÙNG khi cùng món đặt 2 dòng khác options —
 * cả hai đều làm mã mất tính duy nhất, trong khi chỉ số dòng thì luôn duy nhất.
 */
export function parseOrderItemRef(
  ref: unknown,
  totalLines: number,
): number | null {
  if (typeof ref !== "string" && typeof ref !== "number") return null;
  const text = String(ref).trim().replace(/^#/, "").replace(/\.$/, "");
  if (!/^\d+$/.test(text)) return null;
  const index = Number(text) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= totalLines) return null;
  return index;
}

/**
 * Biến kiểm kê của model thành `InventoryLabel` để `compareInventory` chấm.
 *
 * Nguyên tắc: **tin cái LIÊN KẾT, không tin cái TÊN**. Model trỏ được mã dòng
 * hợp lệ thì lấy đúng tên của dòng đơn đó làm tên món — nhờ vậy lệch từ vựng
 * (`chè thập cẩm` vs `chè trái cây`) không còn là vấn đề. Mã rỗng/lạ thì giữ
 * tên model đọc được, để `compareInventory` tự so tên như trước.
 *
 * Trả `null` khi model **không trả kiểm kê nào** (schema cũ, model bỏ qua khối
 * này) — nơi gọi phải coi là "không có bằng chứng đếm được", KHÔNG phải "ảnh
 * trống", nếu không sẽ hoàn tiền toàn bộ đơn chỉ vì model trả lời thiếu field.
 */
export function labelFromInventory(
  evidence: ImageInventoryEvidence | null | undefined,
  orderItems: readonly CaseOrderItem[] | null | undefined,
): InventoryLabel | null {
  if (!evidence || typeof evidence !== "object") return null;
  const source = evidence as Record<string, unknown>;
  const hasInventory =
    Array.isArray(source.items) ||
    source.countable !== undefined ||
    source.boxes !== undefined;
  if (!hasInventory) return null;

  const lines = orderItems ?? [];
  const rawItems = Array.isArray(source.items) ? source.items : [];
  const items: ItemInventoryEntry[] = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const quantity = toQuantity(entry.quantity);
    if (quantity <= 0) continue;
    const index = parseOrderItemRef(entry.orderItemId, lines.length);
    const line = index === null ? null : lines[index];
    const name = String(line?.name ?? entry.name ?? "").trim();
    if (name.length === 0) continue;
    items.push({ menuItemId: line?.menuItemId ?? null, name, quantity });
  }

  const rawCoverage = String(source.coverage ?? "");
  const coverage = (INVENTORY_COVERAGE as readonly string[]).includes(
    rawCoverage,
  )
    ? (rawCoverage as InventoryCoverage)
    : undefined;

  return {
    items,
    boxes:
      typeof source.boxes === "number" && Number.isFinite(source.boxes)
        ? source.boxes
        : null,
    // Model hiếm khi bỏ field này (schema bắt buộc), nhưng nếu bỏ mà vẫn đếm ra
    // món thì đó là bằng chứng nó ĐÃ đếm được ⇒ không tự bịt đường chấm điểm.
    countable:
      typeof source.countable === "boolean"
        ? source.countable
        : items.length > 0,
    sealed: typeof source.sealed === "boolean" ? source.sealed : null,
    coverage,
  };
}

/** Rút gọn kết quả chấm để mang đi nơi khác (prompt lượt chữ / log / panel). */
export function summarizeImageMatch(
  side: ImageEvidenceSide,
  score: ImageMatchScore,
  decision: ImageMatchDecisionResult,
): ImageMatchSummary {
  return {
    side,
    verdict: score.verdict,
    matchedQuantity: score.matchedQuantity,
    totalQuantity: score.totalQuantity,
    matchScore: score.matchScore,
    decision: decision.decision,
    reason: decision.reason,
    missingText: score.missing
      .map((item) => `${item.name} x${item.quantity}`)
      .join(", "),
    extraText: score.extra
      .map((item) => `${item.name} x${item.quantity}`)
      .join(", "),
    refundCap: decision.refundCap,
  };
}

/**
 * Chấm MỘT bên ảnh từ kiểm kê thô của model. `null` = model không trả kiểm kê
 * (không có gì để chấm) — khác hẳn "chấm ra UNCLEAR".
 */
export function evaluateEvidenceImage(
  side: ImageEvidenceSide,
  evidence: ImageInventoryEvidence | null | undefined,
  orderItems: readonly CaseOrderItem[] | null | undefined,
  policy: ImageMatchPolicy = DEFAULT_IMAGE_MATCH_POLICY,
): ImageMatchSummary | null {
  const label = labelFromInventory(evidence, orderItems);
  if (!label) return null;
  const score = scoreImageMatch(orderItems, label);
  return summarizeImageMatch(side, score, decideImageMatch(score, policy));
}

/**
 * `deliveryProof.matchesOrder` mà **CODE** suy ra từ điểm khớp của ảnh giao
 * hàng; `null` = không đủ căn cứ nên giữ nguyên câu trả lời của model.
 *
 * Vì sao chỉ đổi khi `AUTO_*`: ở vùng xám hoặc khi không chấm được, model vẫn
 * có thêm thông tin mà code không có (bao bì, tem niêm phong, bố cục) — ép về
 * UNCLEAR sẽ làm mất thông tin đó mà không thêm được gì.
 */
export function deliveryMatchFromDecision(
  decision: ImageMatchDecision,
): "MATCH" | "MISMATCH" | null {
  if (decision === "AUTO_REJECT") return "MATCH";
  if (decision === "AUTO_APPROVE") return "MISMATCH";
  return null;
}

/**
 * `reporterImages.support` mà **CODE** suy ra từ điểm khớp của ảnh KHÁCH chụp
 * (chỉ dùng cho chế độ ghép cặp ảnh); `null` = giữ nguyên câu trả lời của model.
 *
 * Vì sao đảo chiều so với `deliveryMatchFromDecision`: `reporterImages.support`
 * nghĩa là "ảnh của bên khiếu nại có ủng hộ LỜI KHIẾU NẠI không". Ảnh khớp đủ
 * đơn ⇒ lời "thiếu món" bị mâu thuẫn (`CONTRADICTS`); ảnh thiếu rõ rệt ⇒ ủng hộ
 * (`SUPPORTS`). Vùng xám trả `null` để model quyết — code chỉ nói khi bằng chứng
 * một chiều.
 */
export function reporterSupportFromDecision(
  decision: ImageMatchDecision,
): "SUPPORTS" | "CONTRADICTS" | null {
  if (decision === "AUTO_REJECT") return "CONTRADICTS";
  if (decision === "AUTO_APPROVE") return "SUPPORTS";
  return null;
}

// ============================================================================
// Chấm điểm thí nghiệm (so với nhãn vàng trong samples.jsonl)
// ============================================================================

/** Lệch % điểm quá mức này thì coi là sai số nghiêm trọng, không chỉ là nhiễu. */
export const IMAGE_MATCH_SCORE_TOLERANCE = 0.15;

export interface ImageMatchGroundTruth {
  verdict: InventoryVerdict;
  /** `expected.matchScore` của mẫu. */
  matchScore: number;
}

export interface ImageMatchEvaluation {
  verdictCorrect: boolean;
  /** |dự đoán − nhãn vàng|; `null` = ảnh không chấm được. */
  scoreError: number | null;
  scoreWithinTolerance: boolean;
  /** Ảnh ĐỦ món nhưng kết luận thiếu/sai ⇒ báo động sai ⇒ hoàn tiền oan. */
  falseAlarm: boolean;
  /** Ảnh THIẾU/SAI món nhưng kết luận MATCH ⇒ bỏ sót khiếm khuyết. */
  missedDefect: boolean;
}

export function evaluateImageMatch(
  score: ImageMatchScore,
  truth: ImageMatchGroundTruth,
  tolerance: number = IMAGE_MATCH_SCORE_TOLERANCE,
): ImageMatchEvaluation {
  const truthVerdict = truth?.verdict ?? "UNCLEAR";
  const truthScore = Number(truth?.matchScore);

  const scoreError =
    score.matchScore === null || !Number.isFinite(truthScore)
      ? null
      : Number(Math.abs(score.matchScore - truthScore).toFixed(4));

  return {
    verdictCorrect: score.verdict === truthVerdict,
    scoreError,
    scoreWithinTolerance: scoreError !== null && scoreError <= tolerance,
    falseAlarm:
      truthVerdict === "MATCH" &&
      (score.verdict === "MISSING" || score.verdict === "EXTRA"),
    missedDefect: truthVerdict !== "MATCH" && score.verdict === "MATCH",
  };
}

export interface ImageMatchRunRow {
  sampleId: string;
  truthVerdict: InventoryVerdict;
  evaluation: ImageMatchEvaluation;
  decision: ImageMatchDecision;
}

export interface ImageMatchMetrics {
  samples: number;
  /** Số mẫu chấm được điểm (ảnh không đọc được thì không tính). */
  scored: number;
  /** % đúng kết luận MATCH/MISSING/EXTRA — chỉ số chính. */
  verdictAccuracy: number | null;
  /** Sai số % điểm trung bình (MAE). */
  meanAbsoluteScoreError: number | null;
  withinToleranceRate: number | null;
  /** % báo động sai trên các mẫu ĐỦ món — chỉ số quan trọng nhất về tiền. */
  falseAlarmRate: number | null;
  missedDefectRate: number | null;
  decisionCounts: Record<ImageMatchDecision, number>;
}

const ratio = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;

/** Gộp nhiều mẫu thành chỉ số báo cáo — KHÔNG trộn real với synthetic. */
export function aggregateImageMatch(
  rows: readonly ImageMatchRunRow[],
): ImageMatchMetrics {
  const all = rows ?? [];
  const scorable = all.filter((row) => row.evaluation.scoreError !== null);
  const completeTruth = all.filter((row) => row.truthVerdict === "MATCH");
  const defectTruth = all.filter((row) => row.truthVerdict !== "MATCH");

  const decisionCounts: Record<ImageMatchDecision, number> = {
    AUTO_APPROVE: 0,
    AUTO_REJECT: 0,
    NEEDS_REVIEW: 0,
  };
  for (const row of all) decisionCounts[row.decision] += 1;

  const errorSum = scorable.reduce(
    (sum, row) => sum + (row.evaluation.scoreError ?? 0),
    0,
  );

  return {
    samples: all.length,
    scored: scorable.length,
    verdictAccuracy: ratio(
      all.filter((row) => row.evaluation.verdictCorrect).length,
      all.length,
    ),
    meanAbsoluteScoreError:
      scorable.length > 0
        ? Number((errorSum / scorable.length).toFixed(4))
        : null,
    withinToleranceRate: ratio(
      scorable.filter((row) => row.evaluation.scoreWithinTolerance).length,
      scorable.length,
    ),
    falseAlarmRate: ratio(
      completeTruth.filter((row) => row.evaluation.falseAlarm).length,
      completeTruth.length,
    ),
    missedDefectRate: ratio(
      defectTruth.filter((row) => row.evaluation.missedDefect).length,
      defectTruth.length,
    ),
    decisionCounts,
  };
}
