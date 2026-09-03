"use client";

import { useEffect, useState } from "react";
import { orderApi, driverApi } from "@mythfood/api-client";
import { useAuthStore } from "@mythfood/frontend-shared";
import { useMerchantSocket } from "./SocketProvider";

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

// Nhóm các option đã chọn theo groupName để hiển thị gọn gàng
function groupOptions(options: any[]): {
  name: string;
  items: { name: string; qty: number; priceDelta: number }[];
}[] {
  const map = new Map<string, any[]>();
  for (const o of options || []) {
    const key = o?.groupName || o?.groupId || "Tùy chọn";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(o);
  }
  return Array.from(map.entries()).map(([name, opts]) => ({
    name,
    items: opts.map((o: any) => ({
      name: o?.name || "",
      qty: toNum(o?.quantity) || 1,
      priceDelta: toNum(o?.priceDelta),
    })),
  }));
}

const STATUS_STEPS = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];
const STEP_ICONS: Record<string, string> = {
  PENDING: "⏳",
  CONFIRMED: "✅",
  PREPARING: "🍳",
  READY_FOR_PICKUP: "📦",
  OUT_FOR_DELIVERY: "🛵",
  DELIVERED: "🏠",
};
const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "⏳ Chờ xác nhận", cls: "bg-yellow-100 text-yellow-800" },
  CONFIRMED: { label: "✅ Đã xác nhận", cls: "bg-blue-100 text-blue-800" },
  PREPARING: { label: "🍳 Đang nấu", cls: "bg-orange-100 text-orange-800" },
  READY_FOR_PICKUP: {
    label: "📦 Sẵn sàng",
    cls: "bg-green-100 text-green-800",
  },
  OUT_FOR_DELIVERY: {
    label: "🛵 Đang giao",
    cls: "bg-purple-100 text-purple-800",
  },
  DELIVERED: { label: "🏠 Đã giao", cls: "bg-green-100 text-green-800" },
  CANCELLED: { label: "❌ Đã hủy", cls: "bg-gray-100 text-gray-600" },
  REJECTED: { label: "🚫 Đã từ chối", cls: "bg-red-100 text-red-700" },
};

export default function OrderDetailDrawer({
  orderId,
  onClose,
}: {
  orderId: string | null;
  onClose: () => void;
}) {
  const { socket } = useMerchantSocket();
  const { token } = useAuthStore();
  const [order, setOrder] = useState<any>(null);
  const [driver, setDriver] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Load order + driver when opened
  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setDriver(null);
      setRejecting(false);
      setRejectReason("");
      return;
    }
    setLoading(true);
    const id = orderId;
    async function load() {
      try {
        const o = await orderApi.getById(id);
        setOrder(o);
        if (o.driverId) {
          try {
            const dr = await driverApi.getById(o.driverId);
            setDriver((dr as any)?.data || dr || null);
          } catch {
            setDriver(null);
          }
        } else {
          setDriver(null);
        }
      } catch {
        setOrder(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [orderId]);

  // Live status updates via socket
  useEffect(() => {
    if (!socket || !orderId) return;
    const update = (data: any) => {
      if (data.id === orderId) {
        setOrder((prev: any) => (prev ? { ...prev, ...data } : prev));
      }
    };
    socket.on("order:confirmed", update);
    socket.on("order:preparing", update);
    socket.on("order:ready", update);
    socket.on("order:rejected", update);
    socket.on("order:delivered", update);
    return () => {
      socket.off("order:confirmed", update);
      socket.off("order:preparing", update);
      socket.off("order:ready", update);
      socket.off("order:rejected", update);
      socket.off("order:delivered", update);
    };
  }, [socket, orderId]);

  async function handleAction(action: string) {
    if (!order) return;
    setActionLoading(true);
    try {
      let updated: any;
      if (action === "confirm") updated = await orderApi.confirm(order.id);
      else if (action === "preparing")
        updated = await orderApi.preparing(order.id);
      else if (action === "ready") updated = await orderApi.ready(order.id);
      if (updated) setOrder(updated);
    } catch (e: any) {
      alert("Lỗi: " + (e?.message || "Không thể cập nhật trạng thái"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject() {
    if (!order) return;
    if (!rejectReason.trim()) {
      alert("Vui lòng nhập lý do từ chối");
      return;
    }
    setActionLoading(true);
    try {
      const updated = await orderApi.reject(order.id, {
        reason: rejectReason.trim(),
      });
      setOrder(updated);
      setRejecting(false);
      setRejectReason("");
    } catch (e: any) {
      alert("Lỗi: " + (e?.message || "Không thể từ chối đơn"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePrintInvoice() {
    if (!order) return;
    try {
      const base = process.env.NEXT_PUBLIC_ORDER_API || "http://localhost:3004";
      const res = await fetch(`${base}/api/v1/orders/${order.id}/invoice`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 403) {
          alert("Bạn không có quyền in hóa đơn này");
        } else {
          alert("Không thể tải hóa đơn (HTTP " + res.status + ")");
        }
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      if (!w) {
        alert(
          "Trình duyệt đã chặn popup. Vui lòng cho phép popup để xem hóa đơn.",
        );
        return;
      }
    } catch (err: any) {
      alert("Lỗi: " + (err?.message || "Không thể in hóa đơn"));
    }
  }

  if (!orderId) return null;

  const badge = STATUS_BADGE[order?.status] || STATUS_BADGE.PENDING;
  const activeIdx = STATUS_STEPS.indexOf(order?.status);

  return (
    <div className="fixed inset-0 z-[200]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel: bottom-sheet on mobile, right drawer on desktop */}
      <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-hidden bg-white rounded-t-2xl flex flex-col lg:left-auto lg:right-0 lg:top-0 lg:max-h-none lg:h-full lg:w-[440px] lg:rounded-none lg:border-l lg:border-gray-200">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin w-8 h-8 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
          </div>
        ) : !order ? (
          <div className="p-10 text-center text-gray-400">
            Không tìm thấy đơn hàng
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
              <div>
                <p className="font-bold text-[#1a1a2e]">
                  Chi tiết đơn #{order.id?.slice(0, 8)}
                </p>
                <span
                  className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mt-1 ${badge.cls}`}
                >
                  {badge.label}
                </span>
              </div>
              <button
                onClick={onClose}
                className="text-2xl text-gray-400 hover:text-gray-600 leading-none"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Stepper */}
              <div className="bg-gray-50 rounded-xl p-3">
                {order.status === "REJECTED" || order.status === "CANCELLED" ? (
                  <p className="text-xs text-gray-500 text-center py-2">
                    {order.status === "REJECTED"
                      ? "🚫 Đơn đã bị từ chối"
                      : "❌ Đơn đã bị hủy"}
                  </p>
                ) : (
                  <>
                    <div className="flex items-center">
                      {STATUS_STEPS.map((s, i) => {
                        const done = activeIdx >= i;
                        return (
                          <div
                            key={s}
                            className={`flex items-center ${i < STATUS_STEPS.length - 1 ? "flex-1" : ""}`}
                          >
                            <div
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 ${done ? "bg-[#ff6b35] text-white" : "bg-gray-200 text-gray-400"}`}
                            >
                              {STEP_ICONS[s]}
                            </div>
                            {i < STATUS_STEPS.length - 1 && (
                              <div
                                className={`flex-1 h-0.5 mx-0.5 ${activeIdx > i ? "bg-[#ff6b35]" : "bg-gray-200"}`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {order.status === "PENDING" && (
                      <p className="text-[11px] text-orange-500 mt-2 text-center">
                        ⏰ Tự động từ chối sau 3 phút nếu không phản hồi
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Items */}
              <div className="bg-white rounded-xl border border-gray-100 p-3">
                <p className="font-bold text-sm text-[#1a1a2e] mb-2">
                  🛒 Món đã đặt
                </p>
                {order.items?.map((item: any, i: number) => (
                  <div
                    key={i}
                    className="py-2 border-b border-gray-50 last:border-0"
                  >
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">
                        {item.quantity}x {item.name}
                      </span>
                      <span className="text-gray-600 font-medium">
                        {toNum(
                          item.subtotal ??
                            (item.unitPrice || 0) * item.quantity,
                        ).toLocaleString("vi-VN")}
                        ₫
                      </span>
                    </div>
                    {item.options &&
                      item.options.length > 0 &&
                      groupOptions(item.options).map((grp) => {
                        const delta = grp.items.reduce(
                          (s, it) => s + it.priceDelta * it.qty,
                          0,
                        );
                        return (
                          <p
                            key={grp.name}
                            className="text-xs text-gray-400 mt-0.5"
                          >
                            ↳ <span className="text-gray-500">{grp.name}:</span>{" "}
                            {grp.items
                              .map((it) =>
                                it.qty > 1 ? `${it.name} x${it.qty}` : it.name,
                              )
                              .join(", ")}
                            {delta !== 0 && (
                              <span className="text-gray-500">
                                {" "}
                                ({delta > 0 ? "+" : ""}
                                {delta.toLocaleString("vi-VN")}₫)
                              </span>
                            )}
                          </p>
                        );
                      })}
                    {item.specialInstructions && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        ↳ {item.specialInstructions}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Payment */}
              <div className="bg-white rounded-xl border border-gray-100 p-3">
                <p className="font-bold text-sm text-[#1a1a2e] mb-2">
                  💵 Thanh toán
                </p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tạm tính</span>
                    <span>
                      {toNum(order.subtotal).toLocaleString("vi-VN")}₫
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Phí ship</span>
                    <span>
                      {toNum(order.deliveryFee).toLocaleString("vi-VN")}₫
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Phí dịch vụ</span>
                    <span>
                      {toNum(order.serviceFee).toLocaleString("vi-VN")}₫
                    </span>
                  </div>
                  {toNum(order.discount) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Giảm giá</span>
                      <span>
                        -{toNum(order.discount).toLocaleString("vi-VN")}₫
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-[#1a1a2e] pt-2 border-t border-gray-100">
                    <span>Tổng cộng</span>
                    <span className="text-[#ff6b35]">
                      {toNum(order.totalAmount).toLocaleString("vi-VN")}₫
                    </span>
                  </div>
                  <div className="text-right pt-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${order.paymentMethod === "CREDIT_CARD" ? "bg-purple-100 text-purple-700" : "bg-green-100 text-green-700"}`}
                    >
                      {order.paymentMethod === "CREDIT_CARD"
                        ? "💳 Thẻ"
                        : "💵 COD"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Delivery */}
              <div className="bg-white rounded-xl border border-gray-100 p-3">
                <p className="font-bold text-sm text-[#1a1a2e] mb-2">
                  📍 Giao hàng
                </p>
                <p className="text-sm text-gray-700">{order.deliveryAddress}</p>
                {order.notes && (
                  <p className="text-xs text-gray-500 mt-1.5 bg-gray-50 rounded-lg px-2 py-1">
                    📝 {order.notes}
                  </p>
                )}
              </div>

              {/* Driver */}
              {driver && (
                <div className="bg-white rounded-xl border border-gray-100 p-3">
                  <p className="font-bold text-sm text-[#1a1a2e] mb-2">
                    🛵 Tài xế
                  </p>
                  <p className="text-sm text-gray-700">{driver.fullName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    📞 {driver.phone}
                  </p>
                  {driver.licensePlate && (
                    <p className="text-xs text-gray-500">
                      🏍 {driver.licensePlate}
                    </p>
                  )}
                </div>
              )}

              {/* Rejection reason */}
              {order.status === "REJECTED" && order.rejectionReason && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  ⚠️ Lý do từ chối: {order.rejectionReason}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-gray-100 shrink-0 space-y-2 bg-white">
              <button
                onClick={handlePrintInvoice}
                className="w-full bg-white border-2 border-[#ff6b35] text-[#ff6b35] py-2.5 rounded-xl text-sm font-semibold hover:bg-orange-50 transition"
              >
                🖨️ In hóa đơn
              </button>
              {order.status === "PENDING" &&
                (rejecting ? (
                  <div className="space-y-2">
                    <input
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Lý do từ chối (VD: hết nguyên liệu)"
                      className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleReject}
                        disabled={actionLoading}
                        className="flex-1 bg-red-500 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                      >
                        Xác nhận từ chối
                      </button>
                      <button
                        onClick={() => {
                          setRejecting(false);
                          setRejectReason("");
                        }}
                        className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm font-semibold"
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction("confirm")}
                      disabled={actionLoading}
                      className="flex-1 bg-[#ff6b35] text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
                    >
                      ✅ Xác nhận đơn
                    </button>
                    <button
                      onClick={() => setRejecting(true)}
                      className="px-4 bg-red-50 text-red-500 py-3 rounded-xl text-sm font-semibold"
                    >
                      🚫 Từ chối
                    </button>
                  </div>
                ))}
              {order.status === "CONFIRMED" && (
                <button
                  onClick={() => handleAction("preparing")}
                  disabled={actionLoading}
                  className="w-full bg-[#ff6b35] text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
                >
                  🍳 Bắt đầu nấu
                </button>
              )}
              {order.status === "PREPARING" && (
                <button
                  onClick={() => handleAction("ready")}
                  disabled={actionLoading}
                  className="w-full bg-[#2ecc71] text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
                >
                  📦 Sẵn sàng giao
                </button>
              )}
              {(order.status === "READY_FOR_PICKUP" ||
                order.status === "OUT_FOR_DELIVERY") && (
                <p className="text-center text-sm text-gray-500 py-2">
                  🛵 Đang chờ tài xế nhận đơn...
                </p>
              )}
              {(order.status === "DELIVERED" ||
                order.status === "REJECTED" ||
                order.status === "CANCELLED") && (
                <button
                  onClick={onClose}
                  className="w-full bg-gray-100 text-gray-600 py-3 rounded-xl text-sm font-semibold"
                >
                  Đóng
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
