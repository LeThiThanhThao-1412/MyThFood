/**
 * Đối chiếu KIỂM KÊ ảnh với MÓN ĐÃ ĐẶT (nguồn D1).
 *
 * Vì sao cần lớp này: `AI_IMAGE_SCHEMA.deliveryProof.matchesOrder` chỉ có
 * `MATCH | MISMATCH | UNCLEAR` nên **không biểu diễn được** "đơn 3 món, ảnh có 2"
 * — nó gộp "đúng món" và "đúng số lượng" vào một ô. Muốn kết luận THIẾU MÓN phải
 * có phép trừ số lượng, và phép trừ đó phải do **code** làm để:
 *
 *   1. Tất định — cùng nhãn ⇒ cùng kết luận, audit lại được sau 6 tháng.
 *   2. 0 token — không tốn tiền gọi model, không phụ thuộc chất lượng model.
 *   3. Đo được — model chỉ cần "đếm hộp", không phải "phán quyết".
 *
 * Nhãn đầu vào là nhãn **kiểm kê** (`{ name, quantity }`), không phải nhãn phán
 * quyết. Hàm ở đây là hàm THUẦN: không `Date`, không random, không I/O, không
 * throw — bắt buộc để unit-test 100% deterministic và để tái sử dụng làm node
 * 0-token của graph đa tác tử sau này.
 */

import type { CaseOrderItem } from "./assistant.types";

/** Một dòng kiểm kê trong ảnh. */
export interface ItemInventoryEntry {
  /** Có thì so khớp chính xác (không phụ thuộc cách model viết tên). */
  menuItemId?: string | null;
  /** Tên đọc được từ ảnh ("Mì xào bò"). */
  name: string;
  /** Số phần/hộp đếm được (>= 0). */
  quantity: number;
}

/**
 * Ảnh có bày TOÀN BỘ đơn hay chỉ một phần.
 *
 * Khách hay chụp mỗi hộp thiếu rồi nói "thiếu 2 món"; nếu không tách `partial`
 * thì phép trừ sẽ kết luận sai là thiếu rất nhiều món.
 */
export const INVENTORY_COVERAGE = ["all_items", "partial", "unknown"] as const;
export type InventoryCoverage = (typeof INVENTORY_COVERAGE)[number];

/** Nhãn kiểm kê của MỘT ảnh (người gán hoặc model vision trả về). */
export interface InventoryLabel {
  items: ItemInventoryEntry[];
  /** Số hộp/túi đếm được (null = không đếm). */
  boxes?: number | null;
  /** Có đếm được không (ảnh mờ / hộp chồng nhau ⇒ false). */
  countable: boolean;
  /** Túi/hộp còn niêm phong nguyên vẹn (luật 33). */
  sealed?: boolean | null;
  coverage?: InventoryCoverage;
}

/** Kết luận đối chiếu kiểm kê với đơn. */
export const INVENTORY_VERDICT = [
  "MATCH",
  "MISSING",
  "EXTRA",
  "UNCLEAR",
] as const;
export type InventoryVerdict = (typeof INVENTORY_VERDICT)[number];

/** Gợi ý bên chịu trách nhiệm — KHÔNG phải kết luận cuối của vụ việc. */
export type InventoryFaultHint = "MERCHANT" | "DRIVER" | null;

export interface InventoryComparison {
  verdict: InventoryVerdict;
  /** Món thiếu so với đơn. */
  missing: ItemInventoryEntry[];
  /** Món có trong ảnh nhưng KHÔNG có trong đơn (⇒ giao nhầm món). */
  extra: ItemInventoryEntry[];
  /** Giá trị tiền của phần thiếu (dùng làm trần bồi thường). */
  missingValue: number | null;
  faultHint: InventoryFaultHint;
  /** Lý do đọc được bằng tiếng Việt (panel admin / audit). */
  reasons: string[];
  /** Số phần khớp đúng — càng thấp càng ít căn cứ. */
  matchedQuantity: number;
}

export interface CompareInventoryOptions {
  /** Ảnh giao hàng (proof) có túi còn niêm phong không — xét khi có món thừa. */
  sealedAfterProof?: boolean | null;
  /** Tổng tiền đơn — dùng chặn trần `missingValue`. */
  orderTotalAmount?: number | null;
}

/** Token nhãn/hộp không mang thông tin món — bỏ khi so tên. */
const FILLER_TOKENS = new Set([
  "phan",
  "hop",
  "suat",
  "mon",
  "cai",
  "ly",
  "combo",
]);

/** Ngưỡng Jaccard tối thiểu để coi hai tên là cùng một món. */
const NAME_SIMILARITY_THRESHOLD = 0.75;

/** Chuẩn hoá tên món: bỏ dấu, bỏ nhãn/hộp, gộp khoảng trắng. */
export function normalizeItemName(raw: string): string {
  const lower = String(raw ?? "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return lower
    .replace(/[^a-z0-9\s+]/g, " ")
    .replace(/\+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0 && !FILLER_TOKENS.has(token))
    .join(" ")
    .trim();
}

function tokenize(raw: string): string[] {
  const normalized = normalizeItemName(raw);
  return normalized ? normalized.split(" ") : [];
}

/**
 * Hai tên có phải cùng một món?
 *
 * - Trùng khít sau chuẩn hoá ⇒ đúng.
 * - Một bên là tập con của bên kia và tập con có >= 2 token
 *   ("cơm gà" ⊆ "cơm gà xối mỡ") ⇒ đúng.
 * - Jaccard >= 0.75 ⇒ đúng ("mì xào bò" ↔ "mì xào bò đặc biệt" = 3/4).
 *
 * Cố ý KHÔNG dùng "trùng ≥ 60% token ngắn" vì khi đó
 * "mì xào bò" ↔ "mì xào gà" (2/3 = 0.67) sẽ bị coi là cùng món — đúng loại
 * nhầm lẫn mà vụ SAI MÓN cần phân biệt.
 */
export function itemNamesMatch(a: string, b: string): boolean {
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.length === 0 || right.length === 0) return false;

  const leftKey = left.join(" ");
  const rightKey = right.join(" ");
  if (leftKey === rightKey) return true;

  const rightSet = new Set(right);
  const intersection = left.filter((token) => rightSet.has(token)).length;
  const union = new Set([...left, ...right]).size;
  const smaller = Math.min(left.length, right.length);

  if (intersection === smaller && smaller >= 2) return true;
  return union > 0 ? intersection / union >= NAME_SIMILARITY_THRESHOLD : false;
}

function toQuantity(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function unclear(reason: string): InventoryComparison {
  return {
    verdict: "UNCLEAR",
    missing: [],
    extra: [],
    missingValue: null,
    faultHint: null,
    reasons: [reason],
    matchedQuantity: 0,
  };
}

/**
 * Đối chiếu kiểm kê của MỘT ảnh với món đã đặt.
 *
 * Thứ tự kiểm tra là cố định (đổi thứ tự ⇒ đổi kết luận):
 *   1. thiếu danh sách món đã đặt (D1)   ⇒ UNCLEAR
 *   2. không có ảnh / ảnh không thấy món  ⇒ UNCLEAR
 *   3. ảnh chỉ bày một phần đơn            ⇒ UNCLEAR
 *   4. không đếm được (mờ/chồng hộp)       ⇒ UNCLEAR
 *   5. khớp từng món: menuItemId → tên (Jaccard/tập con) → tên CHUNG duy nhất
 *   6. không khớp được món nào ⇒ UNCLEAR (lỗi từ vựng, không phải thiếu/thừa)
 *   7. còn dư phần ⇒ MISSING, có món lạ ⇒ EXTRA
 *   8. gợi ý bên chịu trách nhiệm theo dấu niêm phong
 */
export function compareInventory(
  orderItems: readonly CaseOrderItem[] | null | undefined,
  label: InventoryLabel | null | undefined,
  opts: CompareInventoryOptions = {},
): InventoryComparison {
  const ordered = (orderItems ?? []).filter(
    (item): item is CaseOrderItem =>
      !!item && typeof item.name === "string" && item.name.trim().length > 0,
  );

  if (ordered.length === 0) {
    return unclear(
      "D1 thiếu: không có danh sách món đã đặt nên không có mốc đối chiếu",
    );
  }
  if (!label || !Array.isArray(label.items) || label.items.length === 0) {
    return unclear("Không có ảnh, hoặc ảnh không thấy món nào");
  }
  if (label.coverage === "partial") {
    return unclear(
      "Ảnh chỉ bày MỘT PHẦN đơn — không đủ căn cứ kết luận thiếu món",
    );
  }
  if (label.countable === false) {
    return unclear("Ảnh mờ / hộp chồng nhau nên không đếm được số phần");
  }

  const entries = label.items
    .filter(
      (entry) =>
        !!entry &&
        typeof entry.name === "string" &&
        entry.name.trim().length > 0,
    )
    .map((entry) => ({
      menuItemId: entry.menuItemId ?? null,
      name: entry.name.trim(),
      quantity: toQuantity(entry.quantity),
    }));

  if (entries.length === 0) {
    return unclear("Nhãn kiểm kê không có dòng món hợp lệ");
  }

  const used = entries.map(() => false);
  const missing: ItemInventoryEntry[] = [];
  let matchedQuantity = 0;
  /** Số cặp (món đơn ↔ dòng ảnh) khớp được — kể cả khi số lượng đọc ra bằng 0. */
  let matchedPairs = 0;
  let missingValue = 0;
  let hasPrice = false;

  /**
   * Món nào trong ĐƠN có tên bao trùm tên ảnh đọc được.
   *
   * Đo thật 07/11/2026 (58 mẫu): model vision đếm đúng nhưng ghi tên CHUNG hơn
   * thực đơn — "bún" thay cho "bún lá", "đậu" thay cho "đậu hũ chiên". `itemNamesMatch`
   * cố ý đòi >= 2 token khi một bên là tập con nên các cặp này rớt, 4/8 phần của
   * combo bún đậu bị coi là thiếu ⇒ báo động sai. Ở đây nới đúng một mức: tên ảnh
   * là tập con token của tên đơn **và** chỉ có MỘT món trong đơn bao trùm nó.
   * Đơn có cả "bún lá" và "bún chả" thì "bún" là mơ hồ ⇒ không khớp món nào
   * (thà để người xem còn hơn đoán bừa).
   */
  const genericOwner = new Map<number, number>();
  entries.forEach((entry, index) => {
    const tokens = tokenize(entry.name);
    if (tokens.length === 0) return;
    const owners: number[] = [];
    ordered.forEach((order, orderIndex) => {
      const orderTokens = new Set(tokenize(order.name));
      if (tokens.every((token) => orderTokens.has(token)))
        owners.push(orderIndex);
    });
    if (owners.length === 1) genericOwner.set(index, owners[0] as number);
  });

  ordered.forEach((order, orderIndex) => {
    const orderedQty = toQuantity(order.quantity);
    const matchIndexes: number[] = [];

    if (order.menuItemId) {
      entries.forEach((entry, index) => {
        if (!used[index] && entry.menuItemId === order.menuItemId)
          matchIndexes.push(index);
      });
    }
    if (matchIndexes.length === 0) {
      entries.forEach((entry, index) => {
        if (!used[index] && itemNamesMatch(entry.name, order.name))
          matchIndexes.push(index);
      });
    }
    if (matchIndexes.length === 0) {
      entries.forEach((_entry, index) => {
        if (!used[index] && genericOwner.get(index) === orderIndex)
          matchIndexes.push(index);
      });
    }

    matchIndexes.forEach((index) => {
      used[index] = true;
    });
    matchedPairs += matchIndexes.length;

    const seenQty = matchIndexes.reduce(
      (total, index) => total + (entries[index]?.quantity ?? 0),
      0,
    );
    matchedQuantity += Math.min(seenQty, orderedQty);

    const diff = orderedQty - seenQty;
    if (diff > 0) {
      missing.push({
        menuItemId: order.menuItemId ?? null,
        name: order.name,
        quantity: diff,
      });
      const unitPrice = Number(order.unitPrice);
      if (Number.isFinite(unitPrice) && unitPrice > 0) {
        missingValue += unitPrice * diff;
        hasPrice = true;
      }
    }
  });

  /**
   * Không khớp được MỘT dòng nào ⇒ đây là lỗi TỪ VỰNG, không phải kết luận.
   *
   * Đo thật 07/11/2026: model đọc đúng món nhưng gọi tên kiểu khác/khác ngôn ngữ
   * ("spaghetti", "fries", "soda"). Nếu vẫn tính tiếp thì mọi món đơn bị coi là
   * THIẾU và mọi món trong ảnh bị coi là THỪA ⇒ `EXTRA` + "nghi đóng gói nhầm
   * phía quán" — tức biến việc *mình không hiểu tên món* thành *cáo buộc quán*.
   * Đây đúng là kiểu lỗi đã gặp với ảnh bị provider bỏ: lỗi đo lường bị đọc thành
   * kết luận. Không khớp được tên ⇒ để người xem, KHÔNG kết luận thiếu/thừa.
   *
   * Đếm theo CẶP khớp (`matchedPairs`), không theo số phần: ảnh có thể khớp tên
   * nhưng đọc ra số lượng rác/0 — đó là lỗi đếm, đã có `MISSING`/`countable` lo.
   */
  if (matchedPairs === 0) {
    return unclear(
      "Không đối chiếu được tên món nào giữa ảnh và đơn đã đặt (khác cách gọi/ngôn ngữ, " +
        "hoặc giao nhầm cả túi) — không kết luận thiếu/thừa, cần người xem ảnh",
    );
  }

  const extra: ItemInventoryEntry[] = [];
  entries.forEach((entry, index) => {
    if (!used[index] && entry.quantity > 0) {
      extra.push({
        menuItemId: entry.menuItemId,
        name: entry.name,
        quantity: entry.quantity,
      });
    }
  });

  let verdict: InventoryVerdict;
  if (missing.length === 0 && extra.length === 0) verdict = "MATCH";
  else if (extra.length > 0) verdict = "EXTRA";
  else verdict = "MISSING";

  const reasons: string[] = [];
  if (missing.length > 0) {
    const totalMissing = missing.reduce(
      (total, item) => total + item.quantity,
      0,
    );
    reasons.push(
      `Thiếu ${totalMissing} phần so với đơn: ${missing
        .map((item) => `${item.name} x${item.quantity}`)
        .join(", ")}`,
    );
  }
  if (extra.length > 0) {
    reasons.push(
      `Ảnh có món không nằm trong đơn: ${extra
        .map((item) => `${item.name} x${item.quantity}`)
        .join(", ")}`,
    );
  }

  let faultHint: InventoryFaultHint = null;
  if (verdict === "MISSING") {
    if (label.sealed === true) {
      faultHint = "MERCHANT";
      reasons.push(
        "Thiếu món trong khi túi/hộp còn niêm phong ⇒ nghi lỗi khâu đóng gói (luật 33)",
      );
    } else if (label.sealed === false) {
      faultHint = "DRIVER";
      reasons.push(
        "Túi đã mở tại thời điểm chụp ⇒ nghi thiếu món trong quá trình giao (luật 33)",
      );
    } else {
      reasons.push(
        "Không rõ túi còn niêm phong hay không ⇒ chưa đủ căn cứ quy trách nhiệm",
      );
    }
  } else if (verdict === "EXTRA") {
    const openedBeforeProof = opts.sealedAfterProof === false;
    faultHint = openedBeforeProof ? "DRIVER" : "MERCHANT";
    reasons.push(
      openedBeforeProof
        ? "Ảnh có món lạ và túi đã mở trước khi chụp ảnh giao hàng ⇒ nghi giao nhầm phía tài xế"
        : "Ảnh có món lạ trong khi túi còn niêm phong ⇒ nghi đóng gói nhầm phía quán",
    );
  }

  let resolvedValue: number | null = 0;
  if (verdict !== "MATCH") {
    resolvedValue = hasPrice ? missingValue : null;
    if (!hasPrice) {
      reasons.push(
        "Không có đơn giá của món thiếu ⇒ chưa tính được trần bồi thường",
      );
    }
  }

  const orderTotal = Number(opts.orderTotalAmount);
  if (resolvedValue !== null && Number.isFinite(orderTotal) && orderTotal > 0) {
    resolvedValue = Math.min(resolvedValue, orderTotal);
  }

  return {
    verdict,
    missing,
    extra,
    missingValue: resolvedValue,
    faultHint,
    reasons,
    matchedQuantity,
  };
}

/** Các dòng KHÔNG khớp đơn (thiếu trước, thừa sau) — để panel admin liệt kê. */
export function describeInventory(
  cmp: InventoryComparison,
): ItemInventoryEntry[] {
  return [...cmp.missing, ...cmp.extra];
}

/** Chuỗi món nhìn thấy trong ảnh — thay cho `visibleItems` tự do của model. */
export function toVisibleItemsText(
  cmp: InventoryComparison,
  label: InventoryLabel | null | undefined,
): string {
  if (!label || !Array.isArray(label.items) || label.items.length === 0) {
    return "không thấy món nào";
  }

  const parts = label.items
    .filter(
      (entry) =>
        !!entry &&
        typeof entry.name === "string" &&
        entry.name.trim().length > 0,
    )
    .map((entry) => {
      const quantity = toQuantity(entry.quantity);
      return quantity > 0
        ? `${entry.name.trim()} x${quantity}`
        : entry.name.trim();
    });

  const notes: string[] = [];
  if (typeof label.boxes === "number" && label.boxes > 0)
    notes.push(`${label.boxes} hộp/túi`);
  if (label.sealed === true) notes.push("còn niêm phong");
  else if (label.sealed === false) notes.push("đã mở");
  if (label.coverage === "partial") notes.push("chỉ bày một phần đơn");
  if (label.countable === false) notes.push("không đếm được");
  if (cmp.verdict !== "MATCH") notes.push(`đối chiếu D1: ${cmp.verdict}`);

  return parts.join("; ") + (notes.length > 0 ? ` (${notes.join(", ")})` : "");
}
