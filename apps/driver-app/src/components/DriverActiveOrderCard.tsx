"use client";

// ============================================================================
// Floating card hiển thị "Đơn đang giao".
// 1 tài xế chỉ nhận 1 đơn tại một thời điểm → thẻ nổi hiện đúng 1 đơn đang giao.
// - Hiện từ lúc tài xế nhận đơn, hiển thị trạng thái hiện tại của ĐƠN (order.status).
// - Không có nút thao tác — bấm vào thẻ để chuyển tới trang /delivery/[id].
// ============================================================================

import { useRouter } from "next/navigation";
import { useDeliveryTrip } from "@/hooks/use-delivery-trip";
import { toNum } from "@/lib/delivery-flow";

const ORDER_STATUS_META: Record<string, { icon: string; label: string }> = {
  PENDING: { icon: "⏳", label: "Chờ xác nhận" },
  CONFIRMED: { icon: "✅", label: "Đã xác nhận" },
  PREPARING: { icon: "🍳", label: "Đang chuẩn bị" },
  READY_FOR_PICKUP: { icon: "📦", label: "Sẵn sàng giao" },
  OUT_FOR_DELIVERY: { icon: "🛵", label: "Đang giao" },
  DELIVERED: { icon: "🏠", label: "Đã giao" },
  CANCELLED: { icon: "❌", label: "Đã hủy" },
  CANCELLED_NO_DRIVER: { icon: "🛑", label: "Đã hủy - Không có tài xế" },
  DELIVERY_FAILED: { icon: "❌", label: "Giao hàng thất bại" },
  REJECTED: { icon: "🚫", label: "Đã từ chối" },
};

export default function DriverActiveOrderCard({
  orderId,
}: {
  orderId: string | null;
}) {
  const router = useRouter();
  const { order, stage, driverEarning } = useDeliveryTrip(orderId);

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

  const statusMeta = ORDER_STATUS_META[order.status] || {
    icon: "📋",
    label: order.status || "Đang xử lý",
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => orderId && router.push(`/delivery/${orderId}`)}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && orderId)
          router.push(`/delivery/${orderId}`);
      }}
      className="fixed z-[95] left-4 right-4 bottom-20 lg:left-auto lg:right-6 lg:bottom-6 lg:w-96 bg-[#1a1a2e] rounded-2xl shadow-xl border border-orange-200/60 p-4 text-white flex items-center gap-3 text-left cursor-pointer"
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
          {statusMeta.icon} {statusMeta.label}
        </p>
      </div>
      <span className="text-white/60 shrink-0">›</span>
    </div>
  );
}
