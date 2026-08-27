"use client";

import { useEffect, useState } from "react";
import { orderApi } from "@mythfood/api-client";
import { Drawer } from "@mythfood/frontend-shared";

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

export default function DeliveryDrawer({
  orderId,
  onClose,
  onChanged,
}: {
  orderId: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setSuccess(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const o = await orderApi.getById(orderId);
        setOrder(o);
      } catch {
        setOrder(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  async function handlePickup() {
    if (!order) return;
    setActionLoading(true);
    try {
      await orderApi.outForDelivery(order.id, {
        driverId: order.driverId || "",
      });
      setOrder({ ...order, status: "OUT_FOR_DELIVERY" });
      onChanged?.();
    } catch {
      /* ignore */
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelivered() {
    if (!order) return;
    setActionLoading(true);
    try {
      await orderApi.delivered(order.id);
      setSuccess(true);
      onChanged?.();
    } catch {
      /* ignore */
    } finally {
      setActionLoading(false);
    }
  }

  const isOutForDelivery = order?.status === "OUT_FOR_DELIVERY";
  const isPending =
    order &&
    ["PENDING", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP"].includes(
      order.status,
    );
  const shipFee = toNum(order?.deliveryFee || 15000);
  const driverShare = Math.round(shipFee * 0.8);

  return (
    <Drawer
      open={!!orderId}
      onClose={onClose}
      title={order ? `Đơn #${order.id?.slice(0, 8)}` : "Giao hàng"}
    >
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
        </div>
      ) : !order ? (
        <p className="text-center text-gray-400 py-20">
          Không tìm thấy đơn hàng
        </p>
      ) : success ? (
        <div className="px-5 py-10 text-center">
          <p className="text-5xl mb-3">🎉</p>
          <p className="font-bold text-lg text-[#1a1a2e] mb-1">
            Đã giao hàng thành công!
          </p>
          <p className="text-sm text-gray-500 mb-3">
            Thu nhập:{" "}
            <span className="font-bold text-[#ff6b35]">
              +{driverShare.toLocaleString("vi-VN")}₫
            </span>{" "}
            (80% phí ship)
          </p>
          <button
            onClick={onClose}
            className="bg-[#ff6b35] text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-orange-600 transition"
          >
            Đóng
          </button>
        </div>
      ) : (
        <div className="px-5 py-4 space-y-4">
          <div className="bg-[#1a1a2e] rounded-2xl p-5 text-white text-center">
            <p className="text-3xl mb-1">{isOutForDelivery ? "🛵" : "📦"}</p>
            <p className="font-bold">
              {isOutForDelivery ? "Đang giao" : "Chờ lấy hàng"}
            </p>
            <p className="text-white/60 text-sm mt-1">
              {toNum(order.totalAmount).toLocaleString("vi-VN")}₫
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4">
            <h4 className="font-semibold text-sm text-gray-700 mb-2">
              🛒 Món cần giao
            </h4>
            <div className="space-y-2">
              {order.items?.map((item: any, i: number) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-700">
                    {item.quantity}x {item.name}
                  </span>
                  <span className="text-gray-600">
                    {((item.unitPrice || 0) * item.quantity).toLocaleString(
                      "vi-VN",
                    )}
                    ₫
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
            <p>📍 {order.deliveryAddress}</p>
            {order.notes && (
              <p className="text-xs text-gray-400 mt-1">📝 {order.notes}</p>
            )}
          </div>

          <div className="text-center">
            <span
              className={`text-sm font-semibold px-4 py-1.5 rounded-full ${order.paymentMethod === "COD" ? "bg-yellow-100 text-yellow-800" : "bg-blue-100 text-blue-800"}`}
            >
              {order.paymentMethod === "COD" ? "💵 COD (tiền mặt)" : "💳 Thẻ"}
            </span>
          </div>

          <div className="space-y-2">
            {isPending && (
              <button
                onClick={handlePickup}
                disabled={actionLoading}
                className="w-full bg-[#2ecc71] text-white py-3.5 rounded-xl font-bold hover:bg-green-600 disabled:opacity-50 transition"
              >
                {actionLoading
                  ? "Đang xử lý..."
                  : "📦 Đã lấy hàng - Bắt đầu giao"}
              </button>
            )}
            {isOutForDelivery && (
              <button
                onClick={handleDelivered}
                disabled={actionLoading}
                className="w-full bg-[#ff6b35] text-white py-3.5 rounded-xl font-bold hover:bg-orange-600 disabled:opacity-50 transition"
              >
                {actionLoading
                  ? "Đang xử lý + chia tiền..."
                  : "✅ Đã giao hàng thành công"}
              </button>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
