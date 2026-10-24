"use client";

// ============================================================================
// Cụm nút cập nhật trạng thái giao hàng theo đúng bước hiện tại:
//   Nhận đơn → Đã đến quán → Đã nhận món → Giao hàng thành công.
// Dùng để nhúng trực tiếp vào dashboard / bản đồ mà không cần mở trang chi tiết.
// ============================================================================

import { useState } from "react";
import { useDeliveryTrip } from "@/hooks/use-delivery-trip";
import DeliveryProofDialog from "@/components/DeliveryProofDialog";

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
  const {
    order,
    busy,
    error,
    message,
    stage,
    stageMeta,
    advance,
    simulating,
    startSimulation,
    stopSimulation,
  } = useDeliveryTrip(orderId);

  const [proofOpen, setProofOpen] = useState(false);

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
            if (stage === "DELIVERING" && order.orderType !== "PICKUP") {
              setProofOpen(true);
              return;
            }
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

      {stage === "DELIVERING" && (
        <button
          onClick={() => (simulating ? stopSimulation() : startSimulation())}
          disabled={busy}
          className={`w-full py-2 rounded-xl text-xs font-bold border transition ${
            variant === "light"
              ? simulating
                ? "bg-white/20 text-white border-white/30 hover:bg-white/30"
                : "bg-white/20 text-white border-white/30 hover:bg-white/30"
              : simulating
                ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                : "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100"
          }`}
        >
          {simulating ? "⏹ Dừng mô phỏng GPS" : "▶ Mô phỏng GPS"}
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

      <DeliveryProofDialog
        open={proofOpen}
        busy={busy}
        serverError={error}
        onClose={() => setProofOpen(false)}
        onConfirm={async (url) => {
          const ok = await advance(url);
          if (ok) onChanged?.();
          return ok;
        }}
      />
    </div>
  );
}
