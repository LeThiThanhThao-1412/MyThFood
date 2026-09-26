"use client";

// ============================================================================
// Drawer/Slide-over hiển thị LỊCH SỬ ĐƠN của tài xế (tất cả trạng thái:
// thành công, thất bại, đã hủy, không có tài xế...). Mở từ icon trên dashboard.
// ============================================================================

import { Drawer } from "@mythfood/frontend-shared";
import { toNum } from "@/lib/delivery-flow";

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  DELIVERED: { label: "🎉 Đã giao", cls: "bg-green-100 text-green-700" },
  DELIVERY_FAILED: { label: "❌ Giao thất bại", cls: "bg-red-100 text-red-700" },
  CANCELLED: { label: "🚫 Đã hủy", cls: "bg-gray-100 text-gray-600" },
  CANCELLED_NO_DRIVER: {
    label: "🛑 Không có tài xế",
    cls: "bg-gray-100 text-gray-600",
  },
  REJECTED: { label: "🚫 Từ chối", cls: "bg-gray-100 text-gray-600" },
  OUT_FOR_DELIVERY: { label: "🚚 Đang giao", cls: "bg-blue-100 text-blue-700" },
  READY_FOR_PICKUP: { label: "📦 Sẵn sàng", cls: "bg-orange-100 text-orange-700" },
  PREPARING: { label: "👨‍🍳 Đang nấu", cls: "bg-purple-100 text-purple-700" },
  CONFIRMED: { label: "✅ Đã xác nhận", cls: "bg-blue-100 text-blue-700" },
  PENDING: { label: "⏳ Chờ xác nhận", cls: "bg-yellow-100 text-yellow-700" },
};

export default function DeliveredOrdersDrawer({
  open,
  onClose,
  orders,
  onSelectOrder,
}: {
  open: boolean;
  onClose: () => void;
  orders: any[];
  onSelectOrder?: (orderId: string) => void;
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`📦 Lịch sử đơn (${orders.length})`}
    >
      <div className="px-5 py-4 space-y-3">
        {orders.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📦</p>
            <p className="text-gray-400 text-sm">Chưa có đơn nào</p>
          </div>
        ) : (
          orders.map((o: any) => {
            const b =
              STATUS_BADGE[o.status] ?? {
                label: o.status,
                cls: "bg-gray-100 text-gray-600",
              };
            return (
              <div
                key={o.id}
                onClick={() => onSelectOrder?.(o.id)}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 cursor-pointer hover:shadow-md transition"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-800">
                    #{o.id?.slice(0, 8)}
                  </span>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${b.cls}`}
                  >
                    {b.label}
                  </span>
                </div>
                <div className="text-sm text-gray-500 space-y-1">
                  <p>📍 Giao đến: {o.deliveryAddress}</p>
                  <p className="font-bold text-[#ff6b35]">
                    💰 {toNum(o.totalAmount).toLocaleString("vi-VN")}₫
                  </p>
                  {o.updatedAt && (
                    <p className="text-xs text-gray-400">
                      🕒 {new Date(o.updatedAt).toLocaleString("vi-VN")}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Drawer>
  );
}
