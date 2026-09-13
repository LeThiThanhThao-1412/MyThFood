"use client";

// ============================================================================
// Drawer/Slide-over liệt kê các đơn ĐÃ GIAO thành công (lịch sử đơn của tài xế).
// Mở từ icon trên dashboard; bấm vào 1 đơn sẽ mở chi tiết giao hàng.
// ============================================================================

import { Drawer } from "@mythfood/frontend-shared";
import { toNum } from "@/lib/delivery-flow";

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
      title={`📦 Đơn đã giao (${orders.length})`}
    >
      <div className="px-5 py-4 space-y-3">
        {orders.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📦</p>
            <p className="text-gray-400 text-sm">Chưa có đơn nào đã giao</p>
          </div>
        ) : (
          orders.map((o: any) => (
            <div
              key={o.id}
              onClick={() => onSelectOrder?.(o.id)}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 cursor-pointer hover:shadow-md transition"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-gray-800">
                  #{o.id?.slice(0, 8)}
                </span>
                <span className="text-xs bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full font-semibold">
                  🎉 Đã giao
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
          ))
        )}
      </div>
    </Drawer>
  );
}
