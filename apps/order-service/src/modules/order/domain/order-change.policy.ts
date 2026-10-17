import type { OrderItemProps, OrderStatus } from "./order.aggregate";

/**
 * Quy tắc nghiệp vụ cho tính năng "nhà hàng chỉnh sửa chi tiết đơn".
 *
 * Chỉ cho sửa khi nhà hàng đã xác nhận đơn và bếp chưa đóng gói xong. Từ
 * READY_FOR_PICKUP trở đi món đã sẵn sàng / tài xế đã lấy, còn DELIVERED thì
 * doanh thu đã được accrual (settlement_entries chỉ ghi 1 lần/đơn) nên không
 * thể sửa nếu không đảo bút toán.
 *
 * Có thể mở rộng bằng env ORDER_EDIT_ALLOWED_STATUSES (CSV), mặc định:
 * CONFIRMED, PREPARING.
 */
const ALL_ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "CANCELLED",
  "CANCELLED_NO_DRIVER",
  "REJECTED",
];

export const DEFAULT_ITEM_EDITABLE_STATUSES: OrderStatus[] = [
  "CONFIRMED",
  "PREPARING",
];

export function getItemEditableStatuses(): OrderStatus[] {
  const raw = process.env.ORDER_EDIT_ALLOWED_STATUSES;
  if (!raw) return [...DEFAULT_ITEM_EDITABLE_STATUSES];

  const parsed = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is OrderStatus =>
      ALL_ORDER_STATUSES.includes(value as OrderStatus),
    );

  return parsed.length > 0 ? parsed : [...DEFAULT_ITEM_EDITABLE_STATUSES];
}

export function isItemEditable(status: OrderStatus): boolean {
  return getItemEditableStatuses().includes(status);
}

/** Giảm giá không bao giờ vượt quá tiền món của đơn sau khi sửa. */
export function computeAfterDiscount(
  beforeDiscount: number,
  afterSubtotal: number,
): number {
  const discount = Math.max(0, Math.round(Number(beforeDiscount) || 0));
  const subtotal = Math.max(0, Math.round(Number(afterSubtotal) || 0));
  return Math.min(discount, subtotal);
}

export function sumItemsSubtotal(items: OrderItemProps[]): number {
  return items.reduce(
    (sum, item) =>
      sum +
      Math.round(Number(item.quantity)) * Math.round(Number(item.unitPrice)),
    0,
  );
}

export function computeOrderTotals(input: {
  items: OrderItemProps[];
  deliveryFee: number;
  serviceFee: number;
  discount: number;
}): {
  subtotal: number;
  discount: number;
  totalAmount: number;
} {
  const subtotal = sumItemsSubtotal(input.items);
  const discount = computeAfterDiscount(input.discount, subtotal);
  const totalAmount =
    subtotal +
    Math.round(Number(input.deliveryFee) || 0) +
    Math.round(Number(input.serviceFee) || 0) -
    discount;
  return { subtotal, discount, totalAmount };
}

export type AdjustmentMoneyMode =
  | "NONE"
  | "COD_UPDATE"
  | "WALLET_CHARGE"
  | "WALLET_REFUND"
  | "CARD_CHARGE"
  | "CARD_REFUND_TO_WALLET";

export interface AdjustmentMoneyPlan {
  mode: AdjustmentMoneyMode;
  /** Số tiền chênh lệch (luôn >= 0). */
  amount: number;
  /** Có cần khách thao tác thanh toán (Stripe) trước khi áp dụng không. */
  requiresPayment: boolean;
}

/**
 * Quyết định cách thu/hoàn phần chênh lệch theo phương thức thanh toán.
 *
 * - COD/CASH: chưa thu tiền → chỉ cập nhật số tiền tài xế phải thu.
 * - WALLET: trừ thêm / hoàn lại vào ví.
 * - CREDIT_CARD: thu thêm bằng PaymentIntent bổ sung; hoàn lại vào ví
 *   (store credit) theo quy ước G1 của hệ thống.
 */
export function resolveAdjustmentMoney(
  paymentMethod: string,
  deltaAmount: number,
): AdjustmentMoneyPlan {
  const delta = Math.round(Number(deltaAmount) || 0);
  const amount = Math.abs(delta);
  const method = (paymentMethod || "CASH").toUpperCase();

  if (amount === 0) {
    return { mode: "NONE", amount: 0, requiresPayment: false };
  }

  if (method === "CASH" || method === "COD") {
    return { mode: "COD_UPDATE", amount, requiresPayment: false };
  }

  if (method === "WALLET") {
    return delta > 0
      ? { mode: "WALLET_CHARGE", amount, requiresPayment: false }
      : { mode: "WALLET_REFUND", amount, requiresPayment: false };
  }

  if (
    method === "CREDIT_CARD" ||
    method === "DEBIT_CARD" ||
    method === "CARD"
  ) {
    return delta > 0
      ? { mode: "CARD_CHARGE", amount, requiresPayment: true }
      : { mode: "CARD_REFUND_TO_WALLET", amount, requiresPayment: false };
  }

  // Phương thức chưa hỗ trợ: coi như COD (cập nhật số tiền phải thu).
  return { mode: "COD_UPDATE", amount, requiresPayment: false };
}

export function isOfflinePaymentMethod(paymentMethod: string): boolean {
  const method = (paymentMethod || "CASH").toUpperCase();
  return method === "CASH" || method === "COD";
}

/** Mô tả ngắn gọn các món bị xóa/được thêm để đưa vào thông báo. */
export function summarizeItemChanges(
  before: OrderItemProps[],
  after: OrderItemProps[],
): { removed: string[]; added: string[] } {
  const beforeCount = new Map<string, number>();
  const afterCount = new Map<string, number>();
  for (const item of before) {
    beforeCount.set(
      item.name,
      (beforeCount.get(item.name) ?? 0) + item.quantity,
    );
  }
  for (const item of after) {
    afterCount.set(item.name, (afterCount.get(item.name) ?? 0) + item.quantity);
  }

  const removed: string[] = [];
  const added: string[] = [];

  for (const [name, qty] of beforeCount) {
    const diff = qty - (afterCount.get(name) ?? 0);
    if (diff > 0) removed.push(`${name} ×${diff}`);
  }
  for (const [name, qty] of afterCount) {
    const diff = qty - (beforeCount.get(name) ?? 0);
    if (diff > 0) added.push(`${name} ×${diff}`);
  }

  return { removed, added };
}
