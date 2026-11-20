/**
 * ĐỐI CHIẾU CẶP ẢNH: [ảnh món do NHÀ HÀNG tự upload] vs [ảnh KHÁCH chụp].
 *
 * Vì sao phải ghép cặp thay vì đọc một lượt nhiều ảnh:
 *
 * 1. Một lượt 6 ảnh buộc model tự đoán "ảnh nào là ảnh chuẩn của món nào". Thực tế
 *    ảnh chuẩn món gần như không được đính kèm (ngân sách ảnh bị ảnh bằng chứng
 *    chiếm hết) ⇒ mọi kết luận "sai món" thực chất chỉ dựa vào tên món trong đơn,
 *    không dựa vào ảnh.
 * 2. Ghép cặp theo KHOÁ NGOẠI (`menuItemId` của dòng đơn ↔ `refId` của ảnh thực
 *    đơn) nên **không** phải so tên mờ: cặp ảnh đúng là cặp dữ liệu đúng.
 * 3. Chỉ trong một cặp 2 ảnh mới hỏi được "món này có PHẢI món đó không" và xin
 *    một con số tương đồng 0–100 %. Con số này KHÔNG dùng để tính tiền (tiền vẫn
 *    do `matchScore` đếm phần quyết định) — nó chỉ là tín hiệu "SAI MÓN".
 *
 * Bẫy số 1 khi ghép cặp: mỗi cặp chỉ nhìn thấy MỘT PHẦN bàn ăn, nên số lượng đọc
 * được của một món KHÔNG được cộng dồn giữa các cặp (cộng ⇒ hai ảnh chụp cùng một
 * hộp thành "2 hộp"). Ở đây lấy **MAX** theo từng món: chặn trên an toàn, không
 * bao giờ thổi số phần lên.
 *
 * Toàn bộ hàm là hàm THUẦN: không I/O, không `Date`, không random, không throw —
 * để unit-test 100 % deterministic và để harness chấm lại được sau nhiều tháng.
 */

import type { CaseOrderItem } from "./assistant.types";
import {
  INVENTORY_COVERAGE,
  itemNamesMatch,
  type InventoryCoverage,
  type ItemInventoryEntry,
} from "./item-inventory";

/**
 * Ngưỡng tương đồng (%) để coi là CÙNG món dù model trả `sameDish = true`.
 *
 * `similarityPercent` là "mức giống nhau về món/hình thức", không phải độ giống
 * ảnh: cùng một món chụp góc khác vẫn thường ≥ 60 %. Dưới 35 % thì gần như chắc
 * chắn là món khác loại (cơm gà vs cơm sườn). Ngưỡng này chỉ tạo ra **cảnh báo
 * sai món**, không tự đổi danh mục vụ việc.
 */
export const DEFAULT_WRONG_ITEM_SIMILARITY = 35;

/** Số cặp tối thiểu phải đọc được để cho phép ghi đè kết luận (2/3). */
const MIN_READABLE_RATIO = 2 / 3;

/** Đọc THÔ một cặp ảnh: model trả field nào cũng có thể sai kiểu. */
export interface PairImageReading {
  /** Tên món nhìn thấy trong ẢNH KHÁCH CHỤP. */
  nameSeen?: unknown;
  /** Số phần của MÓN NÀY đếm được trong ảnh khách chụp. */
  quantitySeen?: unknown;
  /** Ảnh khách chụp có đúng là món trong ảnh nhà hàng không. */
  sameDish?: unknown;
  /** 0–100: mức giống nhau giữa hai ảnh về món/hình thức. */
  similarityPercent?: unknown;
  countable?: unknown;
  boxes?: unknown;
  sealed?: unknown;
  coverage?: unknown;
  note?: unknown;
}

/** Kết quả đã chuẩn hoá kiểu của MỘT cặp ảnh. */
export interface ParsedPairReading {
  nameSeen: string;
  quantitySeen: number;
  sameDish: boolean;
  similarityPercent: number | null;
  countable: boolean;
  boxes: number | null;
  sealed: boolean | null;
  coverage: InventoryCoverage;
  note: string;
}

function toCount(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function toPercent(raw: unknown): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function toCoverage(raw: unknown): InventoryCoverage {
  return (INVENTORY_COVERAGE as readonly unknown[]).includes(raw)
    ? (raw as InventoryCoverage)
    : "unknown";
}

/**
 * Chuẩn hoá câu trả lời của model cho một cặp ảnh.
 *
 * `sameDish` chỉ `true` khi model nói rõ là đúng; thiếu field ⇒ `false` để không
 * tự tạo kết luận "sai món" từ dữ liệu khuyết. Nơi gọi phân biệt "không đọc được
 * cặp này" bằng `reading = null` (xem `scoreImagePairs`).
 */
export function parsePairReading(
  raw: PairImageReading | null | undefined,
): ParsedPairReading | null {
  if (!raw || typeof raw !== "object") return null;
  const nameSeen = typeof raw.nameSeen === "string" ? raw.nameSeen.trim() : "";
  const hasSignal =
    typeof raw.sameDish === "boolean" ||
    typeof raw.similarityPercent === "number";
  if (!hasSignal) return null;
  return {
    nameSeen,
    quantitySeen: toCount(raw.quantitySeen),
    sameDish: raw.sameDish === true,
    similarityPercent: toPercent(raw.similarityPercent),
    countable: raw.countable === true,
    boxes:
      raw.boxes === undefined || raw.boxes === null ? null : toCount(raw.boxes),
    sealed: typeof raw.sealed === "boolean" ? raw.sealed : null,
    coverage: toCoverage(raw.coverage),
    note: typeof raw.note === "string" ? raw.note.trim().slice(0, 300) : "",
  };
}

/**
 * Một lần ghép cặp đã thực hiện.
 *
 * `orderItemIds` là NHÓM dòng đơn cùng một món (cùng `menuItemId`, hoặc cùng tên
 * khi món không gắn thực đơn): ảnh thực đơn chỉ có MỘT ảnh cho mỗi món nên hai
 * dòng "trà đào" khác options phải ghép chung một cặp, số lượng đặt CỘNG LẠI.
 */
export interface PairAttempt {
  /** Mã dòng đơn đại diện nhóm (`#n`, dòng đầu tiên của nhóm). */
  orderItemId: string;
  /** Toàn bộ mã dòng đơn thuộc nhóm món này. */
  orderItemIds: string[];
  menuItemId: string | null;
  name: string;
  orderedQuantity: number;
  /** `null` = lần gọi cặp này lỗi / không trả JSON dùng được. */
  reading: PairImageReading | null;
  /** Thời gian gọi (chẩn đoán, không dùng để chấm điểm). */
  durationMs?: number;
}

/** Kết quả đã chuẩn hoá của một cặp (theo thứ tự dòng đơn). */
export interface PairLabel {
  orderItemId: string;
  menuItemId: string | null;
  name: string;
  orderedQuantity: number;
  /** Số phần đếm được trong ảnh khách chụp (0 khi ảnh mờ/không thấy món). */
  quantitySeen: number;
  sameDish: boolean;
  similarityPercent: number | null;
  countable: boolean;
  note: string;
}

/** Tổng hợp nhiều cặp thành MỘT nhãn kiểm kê dùng lại được cho lớp chấm điểm cũ. */
export interface PairwiseSummary {
  /** Nhãn kiểm kê gộp — đưa vào `reporterImages` của lượt đọc ảnh. */
  items: ItemInventoryEntry[];
  boxes: number | null;
  countable: boolean;
  sealed: boolean | null;
  coverage: InventoryCoverage;
  pairs: PairLabel[];
  /** `#n · tên` của món KHÁC LOẠI (sameDish = false) — KHÔNG tính là thiếu. */
  wrongItems: string[];
  /** Các dòng đơn không dựng được cặp (thiếu ảnh thực đơn hoặc ảnh khách). */
  unpairedOrderItemIds: string[];
  /** Trung bình `similarityPercent` của các cặp có trả số (null = không có). */
  similarityAvg: number | null;
  pairsReadable: number;
  pairsTotal: number;
  /** Ghép cặp được cho MỌI nhóm món của đơn và mọi cặp đều đọc được. */
  fullCoverage: boolean;
  /** Đã đọc được ≥ 2/3 số cặp. */
  enoughPairs: boolean;
  /**
   * Cho phép lớp chấm điểm ghi đè kết luận từ kiểm kê cặp.
   *
   * Phải đồng thời: đọc được ≥ 2/3 số cặp, phủ đủ mọi nhóm món, nhãn gộp đếm
   * được và ảnh khách không bị cắt (coverage ≠ partial). Thiếu một điều kiện ⇒
   * giữ nguyên kết luận cũ (fail-closed).
   */
  canOverride: boolean;
  /** Dòng đơn dùng để chấm điểm (chỉ các nhóm đã ghép cặp thành công). */
  scopedOrderItems: CaseOrderItem[];
}

/**
 * Gộp nhiều cặp ảnh thành nhãn kiểm kê + tín hiệu sai món.
 *
 * Quy tắc số lượng: **MAX theo món**, không cộng (mỗi cặp chỉ thấy một phần bàn
 * ăn). Quy tắc `coverage`: chỉ `all_items` khi có ít nhất một cặp nói
 * `all_items`; còn lại hạ xuống `partial` — vì `compareInventory` coi `partial`
 * là "không đủ căn cứ kết luận thiếu món" (đúng ý đồ fail-closed).
 *
 * Món khác loại (`sameDish = false`) KHÔNG được tính là "đã giao": nó vào
 * `wrongItems` và số lượng của nó bị loại khỏi nhãn kiểm kê, nên lớp chấm điểm
 * cũ vẫn thấy dòng đơn đó thiếu — tiền nhất quán, còn lý do "sai món" nêu riêng.
 */
export function scoreImagePairs(input: {
  attempts: readonly PairAttempt[];
  /** Toàn bộ dòng đơn của vụ việc (mốc đối chiếu + biết nhóm nào còn thiếu cặp). */
  orderItems: readonly CaseOrderItem[] | null | undefined;
  /** Số nhóm món CẦN ghép cặp (trước khi cắt theo ngân sách). */
  totalTargets: number;
  wrongItemAtOrBelow?: number;
}): PairwiseSummary {
  const orderItems = (input.orderItems ?? []).filter(
    (item): item is CaseOrderItem => !!item && typeof item.name === "string",
  );
  const threshold = Number.isFinite(input.wrongItemAtOrBelow)
    ? Number(input.wrongItemAtOrBelow)
    : DEFAULT_WRONG_ITEM_SIMILARITY;

  const pairs: PairLabel[] = [];
  const wrongItems: string[] = [];
  const scopedIds = new Set<string>();
  const unpaired = new Set<string>();
  /** MAX số phần theo nhóm món — cộng dồn giữa các cặp là bẫy đếm trùng. */
  const bestSeen = new Map<
    string,
    { attempt: PairAttempt; quantity: number }
  >();

  let boxes: number | null = null;
  let countable = false;
  let sealed: boolean | null = null;
  let coverage: InventoryCoverage = "unknown";
  let similaritySum = 0;
  let similarityCount = 0;
  let pairsReadable = 0;

  for (const attempt of input.attempts) {
    const parsed = parsePairReading(attempt.reading);
    if (!parsed) {
      attempt.orderItemIds.forEach((id) => unpaired.add(id));
      continue;
    }
    pairsReadable += 1;
    attempt.orderItemIds.forEach((id) => scopedIds.add(id));

    const belowThreshold =
      parsed.similarityPercent !== null &&
      parsed.similarityPercent <= threshold;
    const sameDish = parsed.sameDish && !belowThreshold;

    if (parsed.similarityPercent !== null) {
      similaritySum += parsed.similarityPercent;
      similarityCount += 1;
    }
    if (parsed.countable) countable = true;
    if (parsed.boxes !== null) {
      boxes = boxes === null ? parsed.boxes : Math.max(boxes, parsed.boxes);
    }
    if (sealed === null && parsed.sealed !== null) sealed = parsed.sealed;
    if (parsed.coverage === "all_items") coverage = "all_items";
    else if (parsed.coverage === "partial" && coverage === "unknown")
      coverage = "partial";

    const ordered = Math.max(1, Math.trunc(attempt.orderedQuantity) || 1);
    const quantitySeen = parsed.countable
      ? Math.min(parsed.quantitySeen, ordered)
      : 0;

    if (!sameDish && quantitySeen > 0) {
      const nameNote =
        parsed.nameSeen && !itemNamesMatch(parsed.nameSeen, attempt.name)
          ? ` — ảnh cho thấy: ${parsed.nameSeen}`
          : "";
      const similarityNote =
        parsed.similarityPercent === null
          ? ""
          : ` (giống ${parsed.similarityPercent} %)`;
      wrongItems.push(
        `${attempt.orderItemId} · ${attempt.name}${similarityNote}${nameNote}`,
      );
    }

    pairs.push({
      orderItemId: attempt.orderItemId,
      menuItemId: attempt.menuItemId,
      name: attempt.name,
      orderedQuantity: attempt.orderedQuantity,
      quantitySeen,
      sameDish,
      similarityPercent: parsed.similarityPercent,
      countable: parsed.countable,
      note: parsed.note,
    });

    if (sameDish && quantitySeen > 0) {
      const previous = bestSeen.get(attempt.orderItemId);
      if (!previous || quantitySeen > previous.quantity) {
        bestSeen.set(attempt.orderItemId, { attempt, quantity: quantitySeen });
      }
    }
  }

  // Mỗi nhóm món chỉ vào nhãn MỘT lần, với số phần LỚN NHẤT đọc được (MAX-union):
  // hai ảnh khách chụp cùng một hộp không được biến thành "2 hộp".
  const items: ItemInventoryEntry[] = input.attempts
    .filter((attempt) => bestSeen.get(attempt.orderItemId)?.attempt === attempt)
    .map((attempt) => ({
      name: attempt.name,
      quantity: bestSeen.get(attempt.orderItemId)?.quantity ?? 0,
    }));

  const attemptsMade = input.attempts.length;
  const totalTargets = Math.max(
    attemptsMade,
    Math.trunc(input.totalTargets) || 0,
  );
  const fullCoverage =
    attemptsMade >= totalTargets && pairsReadable === totalTargets;
  const readableRatio = totalTargets === 0 ? 0 : pairsReadable / totalTargets;

  return {
    items,
    boxes,
    countable,
    sealed,
    coverage,
    pairs,
    wrongItems,
    unpairedOrderItemIds: [...unpaired],
    similarityAvg:
      similarityCount === 0
        ? null
        : Math.round((similaritySum / similarityCount) * 10) / 10,
    pairsReadable,
    pairsTotal: totalTargets,
    fullCoverage,
    enoughPairs: totalTargets > 0 && readableRatio >= MIN_READABLE_RATIO,
    canOverride:
      fullCoverage &&
      totalTargets > 0 &&
      readableRatio >= MIN_READABLE_RATIO &&
      countable &&
      coverage !== "partial",
    scopedOrderItems: orderItems.filter((_item, index) =>
      scopedIds.has(`#${index + 1}`),
    ),
  };
}

/**
 * Câu mô tả ngắn (tiếng Việt) để nhét vào prompt chữ và panel admin.
 * Trả mảng rỗng khi không có cặp nào — nơi gọi không phải kiểm tra.
 */
export function describePairs(
  summary: PairwiseSummary | null | undefined,
): string[] {
  if (!summary || summary.pairsTotal === 0) return [];
  const similarity =
    summary.similarityAvg === null
      ? "không có số tương đồng"
      : `tương đồng TB ${summary.similarityAvg} %`;
  const lines = [
    "Đối chiếu cặp ảnh (ảnh thực đơn của quán ↔ ảnh khách chụp): " +
      `đọc được ${summary.pairsReadable}/${summary.pairsTotal} cặp, ${similarity}.`,
  ];
  if (summary.wrongItems.length > 0) {
    lines.push(
      `Món KHÁC LOẠI so với ảnh thực đơn: ${summary.wrongItems.join("; ")}.`,
    );
  }
  if (summary.unpairedOrderItemIds.length > 0) {
    lines.push(
      `Chưa ghép được cặp ảnh cho dòng đơn ${summary.unpairedOrderItemIds.join(", ")} ` +
        "(thiếu ảnh thực đơn hoặc ảnh khách) — không suy ra thiếu món từ các dòng này.",
    );
  }
  if (!summary.canOverride) {
    lines.push(
      "Chưa đủ điều kiện ghi đè kết luận từ đối chiếu cặp (cần đọc được ≥ 2/3 số cặp, " +
        "phủ đủ mọi món và ảnh khách không bị cắt) ⇒ giữ kết luận cũ.",
    );
  }
  return lines;
}
