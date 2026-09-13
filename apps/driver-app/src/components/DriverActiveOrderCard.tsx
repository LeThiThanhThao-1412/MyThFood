"use client";

// ============================================================================
// Floating card hiển thị "Đơn đang giao".
// 1 tài xế chỉ nhận 1 đơn tại một thời điểm → thẻ nổi hiện đúng 1 đơn đang giao.
// - Hiện trạng thái hiện tại + nút chuyển bước kế tiếp.
// - Bấm vào thẻ để mở chi tiết giao hàng (DeliveryDrawer).
// ============================================================================

import { useDeliveryTrip } from "@/hooks/use-delivery-trip";
import { toNum } from "@/lib/delivery-flow";

export default function DriverActiveOrderCard({
  orderId,
  onOpen,
  onChanged,
}: {
  orderId: string | null;
  onOpen: () => void;
  onChanged?: () => void;
}) {
  const {
    order,
    stage,
    busy,
    error,
    message,
    stageMeta,
    driverEarning,
    advance,
  } = useDeliveryTrip(orderId);

  if (!order) return null;

  // Vừa giao xong → hiện thẻ xác nhận ngắn (dashboard sẽ reload để gỡ thẻ)
  if (stage === "DELIVERED") {
    return (
      <div className="fixed z-[95] left-4 right-4 bottom-20 lg:left-auto lg:right-6 lg:bottom-6 lg:w-96 bg-green-600 rounded-2xl shadow-xl p-4 text-white flex items-center gap-3">
        <div className="text-2xl">🎉</div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">Đã giao thành công!</p>
          <p className="text-xs text-white/80">
            Thu nhập +{driverEarning.toLocaleString("vi-VN")}₫
          </p>
        </div>
      </div>
    );
  }

  const handleAdvance = async () => {
    await advance();
    onChanged?.();
  };

  return (
    <div className="fixed z-[95] left-4 right-4 bottom-20 lg:left-auto lg:right-6 lg:bottom-6 lg:w-96 bg-[#1a1a2e] rounded-2xl shadow-xl border border-orange-200/60 p-4 text-white">
      <button
        type="button"
        onClick={onOpen}
        className="w-full flex items-center gap-3 text-left bg-transparent border-none p-0 cursor-pointer"
      >
        <div className="w-11 h-11 rounded-xl bg-[#ff6b35]/20 flex items-center justify-center text-xl shrink-0">
          🚚
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-white/50 uppercase tracking-wide">
            Đơn đang giao
          </p>
          <p className="text-sm font-bold truncate">
            #{order.id?.slice(0, 8)} •{" "}
            {toNum(order.totalAmount).toLocaleString("vi-VN")}₫
          </p>
          <p className="text-xs text-[#ff6b35] font-semibold">
            {stageMeta.icon} {stageMeta.label}
          </p>
        </div>
        <span className="text-white/60 shrink-0">›</span>
      </button>

      {stageMeta.actionLabel && (
        <button
          type="button"
          onClick={handleAdvance}
          disabled={busy}
          className="mt-3 w-full bg-[#ff6b35] text-white py-2.5 rounded-xl text-sm font-bold hover:bg-orange-600 disabled:opacity-50 transition"
        >
          {busy ? "Đang xử lý..." : stageMeta.actionLabel}
        </button>
      )}

      {message && <p className="mt-2 text-xs text-green-400">{message}</p>}
      {error && <p className="mt-2 text-xs text-red-400">❌ {error}</p>}
    </div>
  );
}
