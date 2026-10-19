"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";

const STATUS_META: Record<string, { icon: string; label: string }> = {
  PENDING: { icon: "⏳", label: "Chờ xác nhận" },
  CONFIRMED: { icon: "✅", label: "Đã xác nhận" },
  PREPARING: { icon: "👨‍🍳", label: "Đang chuẩn bị" },
  READY_FOR_PICKUP: { icon: "📦", label: "Sẵn sàng giao" },
  OUT_FOR_DELIVERY: { icon: "🛵", label: "Đang giao hàng" },
};

/** Số thẻ tối đa hiển thị cùng lúc; phần còn lại gom vào link "Xem tất cả". */
const MAX_VISIBLE = 3;

/**
 * Mini floating card hiển thị các đơn đang được xử lý/giao.
 *
 * Khách có thể đặt nhiều đơn cùng lúc nên component nhận danh sách đơn và xếp
 * chồng từng thẻ; bấm vào thẻ nào thì mở đúng đơn đó (/orders/:id). Khi có
 * nhiều hơn `MAX_VISIBLE` đơn, hiển thị thêm link tới trang quản lý đơn.
 */
export default function FloatingOrderCard({
  orders,
}: {
  orders?: any[] | null;
}) {
  const router = useRouter();
  const activeOrders = (orders ?? []).filter(Boolean);
  if (activeOrders.length === 0) return null;

  const visibleOrders = activeOrders.slice(0, MAX_VISIBLE);
  const hiddenCount = activeOrders.length - visibleOrders.length;

  return (
    <div className="fixed z-[95] left-4 right-4 bottom-20 lg:left-auto lg:right-6 lg:bottom-6 lg:w-96 flex flex-col gap-2">
      {visibleOrders.map((order) => {
        const meta = STATUS_META[order.status] ?? {
          icon: "🛵",
          label: order.status || "Đang xử lý",
        };

        return (
          <button
            key={order.id}
            type="button"
            onClick={() => router.push(`/orders/${order.id}`)}
            className="w-full bg-white rounded-2xl shadow-xl border border-orange-100 p-3.5 flex items-center gap-3 text-left hover:shadow-2xl hover:-translate-y-0.5 transition-all"
          >
            <div className="w-11 h-11 rounded-xl bg-[#fff7ed] flex items-center justify-center text-xl shrink-0">
              {meta.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                Theo dõi đơn hàng
                {activeOrders.length > 1 ? ` · ${activeOrders.length} đơn` : ""}
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
      })}

      {hiddenCount > 0 && (
        <Link
          href="/orders"
          className="w-full bg-[#1a1a2e] text-white rounded-xl px-3.5 py-2 text-xs font-semibold text-center hover:bg-[#2a2a4e] transition-colors"
        >
          +{hiddenCount} đơn khác đang xử lý · Xem tất cả →
        </Link>
      )}
    </div>
  );
}
