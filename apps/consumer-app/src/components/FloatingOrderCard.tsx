"use client";
import { useRouter } from "next/navigation";

const STATUS_META: Record<string, { icon: string; label: string }> = {
  PENDING: { icon: "⏳", label: "Chờ xác nhận" },
  CONFIRMED: { icon: "✅", label: "Đã xác nhận" },
  PREPARING: { icon: "👨‍🍳", label: "Đang chuẩn bị" },
  READY_FOR_PICKUP: { icon: "📦", label: "Sẵn sàng giao" },
  OUT_FOR_DELIVERY: { icon: "🛵", label: "Đang giao hàng" },
};

/**
 * Mini floating card hiển thị khi có đơn đang được giao.
 * Bấm vào để chuyển tới trang theo dõi trạng thái đơn (/orders/:id).
 */
export default function FloatingOrderCard({ order }: { order: any }) {
  const router = useRouter();
  if (!order) return null;

  const meta = STATUS_META[order.status] ?? {
    icon: "🛵",
    label: order.status || "Đang xử lý",
  };

  return (
    <button
      type="button"
      onClick={() => router.push(`/orders/${order.id}`)}
      className="fixed z-[95] left-4 right-4 bottom-20 lg:left-auto lg:right-6 lg:bottom-6 lg:w-96 bg-white rounded-2xl shadow-xl border border-orange-100 p-3.5 flex items-center gap-3 text-left hover:shadow-2xl hover:-translate-y-0.5 transition-all"
    >
      <div className="w-11 h-11 rounded-xl bg-[#fff7ed] flex items-center justify-center text-xl shrink-0">
        {meta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          Theo dõi đơn hàng
        </p>
        <p className="text-sm font-bold text-gray-800 truncate">
          #{order.id?.slice(0, 8)}
        </p>
        <p className="text-xs text-[#ff6b35] font-semibold">
          {meta.icon} {meta.label}
        </p>
      </div>
      <span className="text-[#ff6b35] font-semibold text-sm shrink-0">
        Xem →
      </span>
    </button>
  );
}
