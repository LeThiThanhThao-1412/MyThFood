/**
 * LẬP KẾ HOẠCH GHÉP CẶP ẢNH (thuần, không I/O).
 *
 * Đầu vào là `CaseContextSnapshot` đã dựng; đầu ra là danh sách cặp cần gọi model
 * vision, mỗi cặp = [ảnh món do NHÀ HÀNG upload] + [ảnh khách chụp]. Việc tải ảnh
 * (base64) do tầng application làm, file này chỉ quyết định **ghép ai với ai** để
 * unit-test được toàn bộ quyết định mà không cần mạng.
 *
 * Khoá ghép: `menuItemId` của dòng đơn (khoá ngoại sang `menu_items`) — không so
 * tên mờ. Khi món không gắn thực đơn (`menuItemId = null`), ghép theo tên đã
 * chuẩn hoá và **chỉ nhận khi tên đó khớp DUY NHẤT một món trong thực đơn**; mơ
 * hồ thì bỏ cặp (thà thiếu cặp còn hơn ghép sai ảnh).
 */
import type {
  CaseContextSnapshot,
  CaseMenuItemSnapshot,
  CaseOrderItem,
} from "../domain/assistant.types";
import { normalizeItemName } from "../domain/item-inventory";

/** Một cặp ảnh cần đối chiếu. */
export interface ImagePairTarget {
  /** Mã dòng đơn đại diện nhóm (`#n`, dòng đầu tiên của nhóm). */
  orderItemId: string;
  /** Mọi dòng đơn thuộc nhóm này (cùng món, khác options). */
  orderItemIds: string[];
  menuItemId: string | null;
  /** Tên món THEO ĐƠN (không lấy tên model đọc trong ảnh). */
  name: string;
  description: string | null;
  orderedQuantity: number;
  unitPrice: number | null;
  options: string | null;
  /** Ảnh món do nhà hàng upload (`menu_items.image_url`). */
  referenceUrl: string;
  /** Ảnh khách chụp (đã tải được, đúng thứ tự gửi). */
  evidenceUrls: string[];
}

export interface ImagePairSkip {
  orderItemId: string;
  name: string;
  reason: string;
}

export interface ImagePairPlan {
  targets: ImagePairTarget[];
  /** Nhóm món không dựng được cặp, kèm lý do đọc được. */
  skipped: ImagePairSkip[];
  /** Số nhóm bị cắt do ngân sách `maxPairs`. */
  truncated: number;
}

function toCode(index: number): string {
  return `#${index + 1}`;
}

function groupKey(item: CaseOrderItem): string {
  return item.menuItemId
    ? `id:${item.menuItemId}`
    : `name:${normalizeItemName(item.name)}`;
}

/** Món trong thực đơn ứng với dòng đơn — theo `menuItemId`, sau đó theo tên DUY NHẤT. */
function resolveMenuItem(
  item: CaseOrderItem,
  menuItems: readonly CaseMenuItemSnapshot[],
): CaseMenuItemSnapshot | null {
  if (item.menuItemId) {
    const byId = menuItems.filter(
      (menu) => menu.menuItemId === item.menuItemId,
    );
    if (byId.length === 1) return byId[0] as CaseMenuItemSnapshot;
    if (byId.length > 1) return byId.find((menu) => !!menu.imageUrl) ?? null;
  }
  const normalized = normalizeItemName(item.name);
  if (!normalized) return null;
  const byName = menuItems.filter(
    (menu) => normalizeItemName(menu.name) === normalized,
  );
  return byName.length === 1 ? (byName[0] as CaseMenuItemSnapshot) : null;
}

/**
 * Dựng kế hoạch cặp ảnh.
 *
 * Thứ tự ưu tiên khi phải cắt theo `maxPairs`: giá trị tiền của nhóm món
 * (`unitPrice × quantity`) giảm dần — cặp đắt tiền nhất quyết định phần lớn tiền
 * hoàn, cặp rẻ bị cắt trước. Kết quả trả về **giữ thứ tự dòng đơn** để mã `#n`
 * trong prompt luôn khớp danh sách món.
 */
export function planImagePairs(input: {
  snapshot: Pick<
    CaseContextSnapshot,
    "orderItems" | "menuItems" | "reporterImageUrls"
  >;
  maxPairs?: number;
}): ImagePairPlan {
  const orderItems = (input.snapshot.orderItems ?? []).filter(
    (item): item is CaseOrderItem =>
      !!item && typeof item.name === "string" && item.name.trim() !== "",
  );
  const menuItems = input.snapshot.menuItems ?? [];
  const evidenceUrls = (input.snapshot.reporterImageUrls ?? []).filter(
    (url): url is string => typeof url === "string" && url.trim() !== "",
  );

  if (orderItems.length === 0) {
    return { targets: [], skipped: [], truncated: 0 };
  }
  if (evidenceUrls.length === 0) {
    return {
      targets: [],
      skipped: orderItems.map((item, index) => ({
        orderItemId: toCode(index),
        name: item.name,
        reason: "khách không có ảnh nào tải được — không có gì để đối chiếu",
      })),
      truncated: 0,
    };
  }

  interface Group {
    firstIndex: number;
    orderItemIds: string[];
    name: string;
    menuItemId: string | null;
    options: string | null;
    quantity: number;
    unitPrice: number | null;
  }

  const groups = new Map<string, Group>();
  orderItems.forEach((item, index) => {
    const key = groupKey(item);
    const existing = groups.get(key);
    const quantity = Math.max(1, Math.trunc(Number(item.quantity)) || 1);
    if (existing) {
      existing.orderItemIds.push(toCode(index));
      existing.quantity += quantity;
      return;
    }
    groups.set(key, {
      firstIndex: index,
      orderItemIds: [toCode(index)],
      name: item.name,
      menuItemId: item.menuItemId ?? null,
      options: typeof item.options === "string" ? item.options : null,
      quantity,
      unitPrice:
        Number.isFinite(Number(item.unitPrice)) && Number(item.unitPrice) > 0
          ? Number(item.unitPrice)
          : null,
    });
  });

  const skipped: ImagePairSkip[] = [];
  const candidates: ImagePairTarget[] = [];
  for (const group of groups.values()) {
    const representative = orderItems[group.firstIndex] as CaseOrderItem;
    const menu = resolveMenuItem(representative, menuItems);
    if (!menu) {
      skipped.push({
        orderItemId: toCode(group.firstIndex),
        name: group.name,
        reason: "không tìm được món tương ứng trong thực đơn (D15)",
      });
      continue;
    }
    if (!menu.imageUrl) {
      skipped.push({
        orderItemId: toCode(group.firstIndex),
        name: group.name,
        reason: "nhà hàng chưa upload ảnh cho món này",
      });
      continue;
    }
    candidates.push({
      orderItemId: toCode(group.firstIndex),
      orderItemIds: group.orderItemIds,
      menuItemId: group.menuItemId,
      name: group.name,
      description: menu.description ?? null,
      orderedQuantity: group.quantity,
      unitPrice: group.unitPrice ?? menu.orderUnitPrice ?? menu.price ?? null,
      options: group.options,
      referenceUrl: String(menu.imageUrl),
      evidenceUrls,
    });
  }

  const limit =
    Number.isFinite(Number(input.maxPairs)) && Number(input.maxPairs) > 0
      ? Math.trunc(Number(input.maxPairs))
      : candidates.length;

  const ranked = [...candidates].sort((left, right) => {
    const leftValue = (left.unitPrice ?? 0) * left.orderedQuantity;
    const rightValue = (right.unitPrice ?? 0) * right.orderedQuantity;
    if (rightValue !== leftValue) return rightValue - leftValue;
    return left.orderItemId.localeCompare(right.orderItemId);
  });
  const kept = new Set(
    ranked.slice(0, limit).map((target) => target.orderItemId),
  );

  return {
    targets: candidates.filter((target) => kept.has(target.orderItemId)),
    skipped,
    truncated: Math.max(0, candidates.length - kept.size),
  };
}
