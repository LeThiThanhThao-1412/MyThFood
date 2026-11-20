import type { DeliveryOption } from "@mythfood/api-client";

export interface DeliveryOptionMeta {
  option: DeliveryOption;
  label: string;
  icon: string;
  shortDescription: string;
  /** Thứ tự ưu tiên (lớn hơn = được xử lý trước). */
  rank: number;
  /** Class Tailwind cho badge. */
  badgeClass: string;
  /** Class Tailwind cho card đang chọn. */
  activeClass: string;
}

/**
 * Metadata hiển thị cho 3 phương thức giao hàng — dùng chung consumer,
 * merchant và driver app để nhãn/màu luôn đồng nhất với backend.
 */
export const DELIVERY_OPTION_META: Record<DeliveryOption, DeliveryOptionMeta> =
  {
    SAVER: {
      option: "SAVER",
      label: "Tiết kiệm",
      icon: "🐢",
      shortDescription: "Phí rẻ nhất, giao lâu hơn",
      rank: 0,
      badgeClass: "bg-emerald-100 text-emerald-700",
      activeClass:
        "border-emerald-400 bg-emerald-50/60 ring-2 ring-emerald-200",
    },
    FAST: {
      option: "FAST",
      label: "Nhanh",
      icon: "🛵",
      shortDescription: "Thời gian và giá tiêu chuẩn",
      rank: 1,
      badgeClass: "bg-blue-100 text-blue-700",
      activeClass: "border-blue-400 bg-blue-50/60 ring-2 ring-blue-200",
    },
    PRIORITY: {
      option: "PRIORITY",
      label: "Ưu tiên",
      icon: "⚡",
      shortDescription: "Nhà hàng xử lý trước, phí cao hơn",
      rank: 2,
      badgeClass: "bg-orange-100 text-orange-700",
      activeClass: "border-orange-400 bg-orange-50/60 ring-2 ring-orange-200",
    },
  };

export const DELIVERY_OPTION_LIST = [
  DELIVERY_OPTION_META.SAVER,
  DELIVERY_OPTION_META.FAST,
  DELIVERY_OPTION_META.PRIORITY,
];

export function deliveryOptionMeta(option?: string | null): DeliveryOptionMeta {
  const key = (option ?? "").toUpperCase() as DeliveryOption;
  return DELIVERY_OPTION_META[key] ?? DELIVERY_OPTION_META.FAST;
}

export function deliveryPriorityRank(option?: string | null): number {
  return deliveryOptionMeta(option).rank;
}
