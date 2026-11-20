/**
 * Phương thức giao hàng (Phase 1).
 *
 * - SAVER   : "Tiết kiệm" — phí rẻ nhất, thời gian lâu hơn.
 * - FAST    : "Nhanh" — thời gian & giá tiêu chuẩn (mặc định, giữ hành vi cũ).
 * - PRIORITY: "Ưu tiên" — nhà hàng xử lý trước, tài xế nhận trước, phí cao nhất.
 *
 * File này là domain thuần (không phụ thuộc NestJS) để dùng chung cho
 * ShippingService (tính phí) và OrderService (chuẩn hoá đơn hàng).
 */

export type DeliveryOption = "SAVER" | "FAST" | "PRIORITY";

export const DELIVERY_OPTIONS: DeliveryOption[] = ["SAVER", "FAST", "PRIORITY"];

export const DEFAULT_DELIVERY_OPTION: DeliveryOption = "FAST";

export const DELIVERY_OPTION_LABELS: Record<DeliveryOption, string> = {
  SAVER: "Tiết kiệm",
  FAST: "Nhanh",
  PRIORITY: "Ưu tiên",
};

/** Thứ tự ưu tiên dùng để sắp xếp hàng đợi của nhà hàng / điều phối. */
export const DELIVERY_OPTION_RANK: Record<DeliveryOption, number> = {
  SAVER: 0,
  FAST: 1,
  PRIORITY: 2,
};

export interface DeliveryOptionPolicy {
  option: DeliveryOption;
  label: string;
  description: string;
  /** Hệ số nhân trên phí giao hàng tiêu chuẩn. */
  feeFactor: number;
  /** Phụ thu cố định (VND). */
  fixedSurcharge: number;
  minFee: number;
  maxFee: number;
  /** Thời gian nhà hàng chuẩn bị (phút). */
  prepMinutes: number;
  /** Buffer cộng thêm vào ETA cam kết (phút). */
  etaBufferMinutes: number;
  /** Thời gian tối đa chờ tài xế nhận đơn (giây). */
  dispatchTimeoutSeconds: number;
  /** Thời gian tối đa chờ tài xế phản hồi khi đã được gán (giây). */
  driverResponseTimeoutSeconds: number;
  /** Số đơn tối đa tài xế được giữ cùng lúc (Phase 1: SAVER vẫn = 1). */
  maxStackedOrders: number;
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeDeliveryOption(value?: string | null): DeliveryOption {
  const normalized = (value ?? "").trim().toUpperCase();
  return (DELIVERY_OPTIONS as string[]).includes(normalized)
    ? (normalized as DeliveryOption)
    : DEFAULT_DELIVERY_OPTION;
}

export function priorityRankOf(option: DeliveryOption): number {
  return DELIVERY_OPTION_RANK[option] ?? DELIVERY_OPTION_RANK.FAST;
}

export function deliveryOptionLabel(option: DeliveryOption): string {
  return DELIVERY_OPTION_LABELS[option] ?? DELIVERY_OPTION_LABELS.FAST;
}

export function getDeliveryOptionPolicy(
  option: DeliveryOption,
): DeliveryOptionPolicy {
  switch (option) {
    case "SAVER":
      return {
        option,
        label: DELIVERY_OPTION_LABELS.SAVER,
        // Phase 1 chưa gộp đơn — mô tả đúng hành vi đang chạy.
        description: "Phí rẻ nhất, thời gian giao lâu hơn",
        feeFactor: envNumber("SAVER_FEE_FACTOR", 0.8),
        fixedSurcharge: 0,
        minFee: 8000,
        maxFee: 80000,
        prepMinutes: 15,
        etaBufferMinutes: 20,
        dispatchTimeoutSeconds: envNumber(
          "SAVER_DISPATCH_TIMEOUT_SECONDS",
          600,
        ),
        driverResponseTimeoutSeconds: 60,
        maxStackedOrders: 1,
      };
    case "PRIORITY":
      return {
        option,
        label: DELIVERY_OPTION_LABELS.PRIORITY,
        description: "Nhà hàng xử lý trước, tài xế nhận đơn trước",
        feeFactor: envNumber("PRIORITY_FEE_FACTOR", 1.3),
        fixedSurcharge: envNumber("PRIORITY_SURCHARGE", 10000),
        minFee: 8000,
        maxFee: envNumber("PRIORITY_MAX_FEE", 120000),
        prepMinutes: 15,
        etaBufferMinutes: 0,
        dispatchTimeoutSeconds: envNumber(
          "PRIORITY_DISPATCH_TIMEOUT_SECONDS",
          180,
        ),
        driverResponseTimeoutSeconds: envNumber(
          "PRIORITY_DRIVER_RESPONSE_TIMEOUT_SECONDS",
          30,
        ),
        maxStackedOrders: 1,
      };
    case "FAST":
    default:
      return {
        option: "FAST",
        label: DELIVERY_OPTION_LABELS.FAST,
        description: "Thời gian và giá tiêu chuẩn",
        feeFactor: 1,
        fixedSurcharge: 0,
        minFee: 8000,
        maxFee: 80000,
        prepMinutes: 15,
        etaBufferMinutes: 5,
        dispatchTimeoutSeconds: envNumber(
          "DISPATCH_MATCHING_TIMEOUT_SECONDS",
          300,
        ),
        driverResponseTimeoutSeconds: 60,
        maxStackedOrders: 1,
      };
  }
}

/**
 * Áp dụng chính sách giá của phương thức giao hàng lên phí tiêu chuẩn.
 * `baseFee` là phí FAST hiện tại (đã gồm base + km + rush + thời tiết).
 */
export function applyOptionToFee(
  baseFee: number,
  option: DeliveryOption,
): number {
  return applyPolicyToFee(baseFee, getDeliveryOptionPolicy(option));
}

/** Áp dụng một policy cụ thể (từ DB/admin) lên phí chuẩn. */
export function applyPolicyToFee(
  baseFee: number,
  policy: DeliveryOptionPolicy,
): number {
  const base = Math.max(0, Math.round(Number(baseFee) || 0));

  if (policy.option === "FAST") {
    return clamp(base, policy.minFee, policy.maxFee);
  }

  const adjusted = Math.round(base * policy.feeFactor) + policy.fixedSurcharge;
  return clamp(adjusted, policy.minFee, policy.maxFee);
}

/** Suy ngược phí FAST từ phí cuối cùng theo một policy cụ thể. */
export function deriveBaseFeeWithPolicy(
  finalFee: number,
  policy: DeliveryOptionPolicy,
): number {
  const fee = Math.max(0, Math.round(Number(finalFee) || 0));
  if (policy.option === "FAST" || policy.feeFactor <= 0) return fee;
  return Math.max(
    0,
    Math.round((fee - policy.fixedSurcharge) / policy.feeFactor),
  );
}

/**
 * Suy ngược phí chuẩn (FAST) từ phí cuối cùng của một phương thức.
 * Dùng cho fallback khi không có toạ độ để tính lại phí từ đầu.
 */
export function deriveBaseFeeFromOptionFee(
  finalFee: number,
  option: DeliveryOption,
): number {
  const fee = Math.max(0, Math.round(Number(finalFee) || 0));
  if (option === "FAST") return fee;

  const policy = getDeliveryOptionPolicy(option);
  if (policy.feeFactor <= 0) return fee;
  return Math.max(
    0,
    Math.round((fee - policy.fixedSurcharge) / policy.feeFactor),
  );
}

/**
 * ETA (phút) ước tính cho một phương thức: chuẩn bị + di chuyển + buffer.
 * Tốc độ đô thị giả định 20 km/h.
 */
export function estimateEtaMinutes(
  distanceKm: number,
  option: DeliveryOption,
): number {
  return estimateEtaWithPolicy(distanceKm, getDeliveryOptionPolicy(option));
}

export function estimateEtaWithPolicy(
  distanceKm: number,
  policy: DeliveryOptionPolicy,
): number {
  const km = Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 6;
  const travelMinutes = Math.round((km / 20) * 60);
  return Math.max(
    10,
    Math.round(policy.prepMinutes + travelMinutes + policy.etaBufferMinutes),
  );
}

/**
 * Thời điểm cam kết giao hàng — dùng để cảnh báo trễ / thống kê SLA.
 */
export function computePromisedDeliveryAt(
  createdAt: Date,
  distanceKm: number | null,
  option: DeliveryOption,
): Date {
  return computePromisedDeliveryAtWithPolicy(
    createdAt,
    distanceKm,
    getDeliveryOptionPolicy(option),
  );
}

export function computePromisedDeliveryAtWithPolicy(
  createdAt: Date,
  distanceKm: number | null,
  policy: DeliveryOptionPolicy,
): Date {
  const etaMinutes = estimateEtaWithPolicy(distanceKm ?? 6, policy);
  return new Date(createdAt.getTime() + etaMinutes * 60_000);
}
