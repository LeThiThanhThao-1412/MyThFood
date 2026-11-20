/**
 * Phương thức giao hàng — bản sao tối thiểu dùng trong dispatch-service.
 *
 * order-service là nguồn sự thật về giá; dispatch-service chỉ cần:
 * - thứ tự ưu tiên (priority_rank) để sắp hàng đợi điều phối
 * - thời gian chờ tài xế theo từng phương thức
 */

export type DeliveryOption = "SAVER" | "FAST" | "PRIORITY";

export const DELIVERY_OPTIONS: DeliveryOption[] = ["SAVER", "FAST", "PRIORITY"];

export const DEFAULT_DELIVERY_OPTION: DeliveryOption = "FAST";

export const DELIVERY_OPTION_RANK: Record<DeliveryOption, number> = {
  SAVER: 0,
  FAST: 1,
  PRIORITY: 2,
};

export function normalizeDeliveryOption(value?: string | null): DeliveryOption {
  const normalized = (value ?? "").trim().toUpperCase();
  return (DELIVERY_OPTIONS as string[]).includes(normalized)
    ? (normalized as DeliveryOption)
    : DEFAULT_DELIVERY_OPTION;
}

export function priorityRankOf(option: DeliveryOption): number {
  return DELIVERY_OPTION_RANK[option] ?? DELIVERY_OPTION_RANK.FAST;
}

function envSeconds(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Thời gian tối đa chờ tài xế nhận đơn, theo phương thức. */
export function dispatchTimeoutSeconds(option: DeliveryOption): number {
  switch (option) {
    case "SAVER":
      return envSeconds("SAVER_DISPATCH_TIMEOUT_SECONDS", 600);
    case "PRIORITY":
      return envSeconds("PRIORITY_DISPATCH_TIMEOUT_SECONDS", 180);
    case "FAST":
    default:
      return envSeconds("DISPATCH_MATCHING_TIMEOUT_SECONDS", 300);
  }
}

/** Thời gian tối đa chờ tài xế phản hồi sau khi đã được gán đơn. */
export function driverResponseTimeoutSeconds(option: DeliveryOption): number {
  switch (option) {
    case "PRIORITY":
      return envSeconds("PRIORITY_DRIVER_RESPONSE_TIMEOUT_SECONDS", 30);
    case "SAVER":
      return envSeconds("SAVER_DRIVER_RESPONSE_TIMEOUT_SECONDS", 90);
    case "FAST":
    default:
      return envSeconds("DRIVER_RESPONSE_TIMEOUT_SECONDS", 60);
  }
}
