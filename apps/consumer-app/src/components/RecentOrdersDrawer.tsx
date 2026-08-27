"use client";

import { Drawer } from "@mythfood/frontend-shared";

const statusLabels: Record<string, string> = {
  PENDING: "⏳ Chờ xác nhận",
  CONFIRMED: "✅ Đã xác nhận",
  PREPARING: "👨‍🍳 Đang chuẩn bị",
  READY_FOR_PICKUP: "📦 Sẵn sàng",
  OUT_FOR_DELIVERY: "🛵 Đang giao",
  DELIVERED: "🏠 Đã giao",
  CANCELLED: "❌ Đã hủy",
  REJECTED: "🚫 Từ chối",
};

export default function RecentOrdersDrawer({
  open,
  onClose,
  orders,
  onSelectOrder,
}: {
  open: boolean;
  onClose: () => void;
  orders: any[];
  onSelectOrder: (id: string) => void;
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`📋 Đơn hàng gần đây (${orders.length})`}
    >
      <div className="px-5 py-4">
        {orders.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-gray-400 text-sm">Chưa có đơn hàng nào</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order: any) => (
              <button
                key={order.id}
                onClick={() => {
                  onClose();
                  onSelectOrder(order.id);
                }}
                className="w-full text-left border border-gray-100 rounded-xl p-3 hover:bg-gray-50 hover:border-[#ff6b35] transition"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold text-gray-800">
                    #{order.id.slice(0, 8)}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      order.status === "DELIVERED"
                        ? "bg-green-100 text-green-700"
                        : order.status === "CANCELLED" ||
                            order.status === "REJECTED"
                          ? "bg-red-100 text-red-700"
                          : "bg-orange-100 text-orange-700"
                    }`}
                  >
                    {statusLabels[order.status] || order.status}
                  </span>
                </div>
                <div className="text-xs text-gray-500 truncate mb-1">
                  🛒{" "}
                  {order.items
                    ?.map((i: any) => `${i.quantity}x ${i.name}`)
                    .join(", ")}
                </div>
                <div className="text-sm font-bold text-[#ff6b35]">
                  {order.totalAmount?.toLocaleString("vi-VN")}₫
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}
