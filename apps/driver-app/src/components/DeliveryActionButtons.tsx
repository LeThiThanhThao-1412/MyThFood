"use client";

// ============================================================================
// Cụm nút cập nhật trạng thái giao hàng theo đúng bước hiện tại:
//   Nhận đơn → Đã đến quán → Đã nhận món → Giao hàng thành công.
// Dùng để nhúng trực tiếp vào dashboard / bản đồ mà không cần mở trang chi tiết.
// ============================================================================

import { useDeliveryTrip } from "@/hooks/use-delivery-trip";

export default function DeliveryActionButtons({
  orderId,
  variant = "solid",
  onChanged,
}: {
  orderId: string;
  /** `solid` cho nền trắng, `light` cho nền cam đậm (vd: card active dispatch trên bản đồ). */
  variant?: "solid" | "light";
  onChanged?: () => void;
}) {
  const { order, busy, error, message, stage, stageMeta, advance } =
    useDeliveryTrip(orderId);

  if (!order) return null;

  if (stage === "DELIVERED") {
    return (
      <p
        className={`text-xs font-semibold text-center py-1 ${
          variant === "light" ? "text-white" : "text-green-600"
        }`}
      >
        🎉 Đơn hàng đã được giao
      </p>
    );
  }

  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      <p
        className={`text-xs font-semibold ${
          variant === "light" ? "text-white/80" : "text-gray-500"
        }`}
      >
        {stageMeta.icon} {stageMeta.label}
      </p>

      {stageMeta.actionLabel && (
        <button
          onClick={async () => {
            await advance();
            onChanged?.();
          }}
          disabled={busy}
          className={`w-full py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 transition ${
            variant === "light"
              ? "bg-white text-[#ff6b35] hover:bg-orange-50"
              : "bg-[#ff6b35] text-white hover:bg-orange-600"
          }`}
        >
          {busy ? "Đang xử lý..." : stageMeta.actionLabel}
        </button>
      )}

      {message && (
        <p
          className={`text-xs text-center ${
            variant === "light" ? "text-white/90" : "text-green-600"
          }`}
        >
          {message}
        </p>
      )}
      {error && (
        <p
          className={`text-xs text-center ${
            variant === "light" ? "text-white" : "text-red-600"
          }`}
        >
          ❌ {error}
        </p>
      )}
    </div>
  );
}
