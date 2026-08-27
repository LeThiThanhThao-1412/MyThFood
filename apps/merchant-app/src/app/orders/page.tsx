"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { orderApi } from "@mythfood/api-client";
import { useAuthStore } from "@mythfood/frontend-shared";
import { useMerchantSocket } from "@/components/SocketProvider";
import OrderDetailDrawer from "@/components/OrderDetailDrawer";
import TopNav from "@/components/TopNav";

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

export default function MerchantOrdersPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { socket, status, merchantId, ready, resetNewOrderCount } =
    useMerchantSocket();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "PENDING" | "CONFIRMED" | "PREPARING" | "READY" | "REJECTED"
  >("PENDING");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (ready && !merchantId) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, ready, merchantId, router]);

  // Initial load + reset notification badge
  useEffect(() => {
    if (!merchantId) return;
    async function load() {
      try {
        const allOrders = await orderApi.listByMerchant(merchantId);
        const activeOrders = Array.isArray(allOrders)
          ? allOrders.filter((o: any) =>
              [
                "PENDING",
                "CONFIRMED",
                "PREPARING",
                "READY_FOR_PICKUP",
                "REJECTED",
              ].includes(o.status),
            )
          : [];
        setOrders(activeOrders);
      } catch {
      } finally {
        setLoading(false);
      }
    }
    load();
    resetNewOrderCount();
  }, [merchantId, resetNewOrderCount]);

  // Polling fallback (only when WebSocket is down)
  useEffect(() => {
    if (!merchantId || status === "connected") return;
    async function poll() {
      try {
        const allOrders = await orderApi.listByMerchant(merchantId);
        const activeOrders = Array.isArray(allOrders)
          ? allOrders.filter((o: any) =>
              [
                "PENDING",
                "CONFIRMED",
                "PREPARING",
                "READY_FOR_PICKUP",
                "REJECTED",
              ].includes(o.status),
            )
          : [];
        setOrders(activeOrders);
      } catch {}
    }
    poll();
    const t = setInterval(poll, 10000);
    return () => clearInterval(t);
  }, [merchantId, status]);

  // Real-time listeners on the shared socket
  useEffect(() => {
    if (!socket) return;

    const onNew = (data: any) => {
      setOrders((prev) => {
        if (prev.find((o) => o.id === data.id)) return prev;
        return [
          { ...data, createdAt: data.createdAt || new Date().toISOString() },
          ...prev,
        ];
      });
    };
    const onConfirmed = (data: any) => {
      setOrders((prev) =>
        prev.map((o) => (o.id === data.id ? { ...o, status: "CONFIRMED" } : o)),
      );
    };
    const onPreparing = (data: any) => {
      setOrders((prev) =>
        prev.map((o) => (o.id === data.id ? { ...o, status: "PREPARING" } : o)),
      );
    };
    const onReady = (data: any) => {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === data.id ? { ...o, status: "READY_FOR_PICKUP" } : o,
        ),
      );
    };
    const onDelivered = (data: any) => {
      setOrders((prev) => prev.filter((o) => o.id !== data.id));
    };
    const onRejected = (data: any) => {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === data.id
            ? {
                ...o,
                status: "REJECTED",
                rejectionReason: data.rejectionReason,
              }
            : o,
        ),
      );
    };

    socket.on("order:new", onNew);
    socket.on("order:confirmed", onConfirmed);
    socket.on("order:preparing", onPreparing);
    socket.on("order:ready", onReady);
    socket.on("order:delivered", onDelivered);
    socket.on("order:rejected", onRejected);

    return () => {
      socket.off("order:new", onNew);
      socket.off("order:confirmed", onConfirmed);
      socket.off("order:preparing", onPreparing);
      socket.off("order:ready", onReady);
      socket.off("order:delivered", onDelivered);
      socket.off("order:rejected", onRejected);
    };
  }, [socket]);

  async function handleStatusChange(orderId: string, action: string) {
    try {
      if (action === "confirm") await orderApi.confirm(orderId);
      else if (action === "preparing") await orderApi.preparing(orderId);
      else if (action === "ready") await orderApi.ready(orderId);
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;
          const newStatus =
            action === "confirm"
              ? "CONFIRMED"
              : action === "preparing"
                ? "PREPARING"
                : "READY_FOR_PICKUP";
          return { ...o, status: newStatus };
        }),
      );
    } catch (e: any) {
      alert("Lỗi: " + (e.message || "Không thể cập nhật trạng thái"));
    }
  }

  const filtered = orders.filter((o) => {
    const s = o.status;
    if (activeTab === "PENDING") return s === "PENDING";
    if (activeTab === "CONFIRMED") return s === "CONFIRMED";
    if (activeTab === "PREPARING") return s === "PREPARING";
    if (activeTab === "READY") return s === "READY_FOR_PICKUP";
    if (activeTab === "REJECTED") return s === "REJECTED";
    return true;
  });

  const tabs = [
    {
      key: "PENDING",
      label: "⏳ Chờ xác nhận",
      count: orders.filter((o) => o.status === "PENDING").length,
    },
    {
      key: "CONFIRMED",
      label: "✅ Đã xác nhận",
      count: orders.filter((o) => o.status === "CONFIRMED").length,
    },
    {
      key: "PREPARING",
      label: "🍳 Đang nấu",
      count: orders.filter((o) => o.status === "PREPARING").length,
    },
    {
      key: "READY",
      label: "📦 Sẵn sàng",
      count: orders.filter((o) => o.status === "READY_FOR_PICKUP").length,
    },
    {
      key: "REJECTED",
      label: "🚫 Đã từ chối",
      count: orders.filter((o) => o.status === "REJECTED").length,
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] max-w-[1400px] mx-auto pb-20 lg:pb-0 w-full">
      <TopNav />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-extrabold text-[#1a1a2e]">
            📋 Quản lý đơn hàng
          </h1>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${status === "connected" ? "bg-green-400" : status === "reconnecting" ? "bg-yellow-400 animate-pulse" : "bg-red-400"}`}
            />
            <span className="text-xs text-gray-500">
              {status === "connected"
                ? "Trực tuyến"
                : status === "reconnecting"
                  ? "Đang kết nối lại"
                  : "Ngoại tuyến"}
            </span>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as any)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition ${
                activeTab === t.key
                  ? "bg-[#ff6b35] text-white"
                  : "bg-white text-gray-600 border border-gray-200"
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {/* Orders List */}
        <div className="space-y-3">
          {filtered.length === 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-gray-400 text-sm">Không có đơn hàng nào</p>
            </div>
          )}
          {filtered.map((o: any) => (
            <div
              key={o.id}
              onClick={() => setSelectedId(o.id)}
              className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 cursor-pointer hover:shadow-md transition"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-gray-800">
                    #{o.id?.slice(0, 8)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(o.createdAt).toLocaleString("vi-VN")}
                    <span
                      className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        o.paymentMethod === "CREDIT_CARD"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {o.paymentMethod === "CREDIT_CARD" ? "💳 Thẻ" : "💵 COD"}
                    </span>
                  </p>
                </div>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                    o.status === "PENDING"
                      ? "bg-yellow-100 text-yellow-800"
                      : o.status === "CONFIRMED"
                        ? "bg-blue-100 text-blue-800"
                        : o.status === "PREPARING"
                          ? "bg-orange-100 text-orange-800"
                          : o.status === "REJECTED"
                            ? "bg-red-100 text-red-800"
                            : "bg-green-100 text-green-800"
                  }`}
                >
                  {o.status === "PENDING"
                    ? "⏳ Chờ xác nhận"
                    : o.status === "CONFIRMED"
                      ? "✅ Đã xác nhận"
                      : o.status === "PREPARING"
                        ? "🍳 Đang nấu"
                        : o.status === "REJECTED"
                          ? "🚫 Đã từ chối"
                          : "📦 Sẵn sàng"}
                </span>
              </div>

              {/* Rejection reason */}
              {o.status === "REJECTED" && o.rejectionReason && (
                <div className="bg-[#ffebee] border border-[#ffcdd2] rounded-lg px-3 py-2 mb-3 text-xs text-[#c62828]">
                  ⚠️ Lý do: {o.rejectionReason}
                </div>
              )}

              {/* PENDING auto-reject warning */}
              {o.status === "PENDING" && (
                <div className="bg-[#fff3e0] border border-[#ffe0b2] rounded-lg px-3 py-2 mb-3 text-xs text-[#e67e22]">
                  ⏰ Tự động từ chối sau 3 phút nếu không phản hồi
                </div>
              )}

              {/* Order items */}
              <div className="border-t border-b border-gray-100 py-3 my-3">
                {o.items?.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm py-1">
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
                <div className="flex justify-between text-sm font-bold mt-2 pt-2 border-t border-gray-100">
                  <span>Tổng cộng</span>
                  <span className="text-[#ff6b35]">
                    {toNum(o.totalAmount).toLocaleString("vi-VN")}₫
                  </span>
                </div>
              </div>

              {/* Delivery info */}
              <div className="text-xs text-gray-500 mb-3">
                <p>📍 {o.deliveryAddress}</p>
                {o.notes && <p className="text-gray-400 mt-1">📝 {o.notes}</p>}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                {o.status === "PENDING" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusChange(o.id, "confirm");
                    }}
                    className="flex-1 bg-[#ff6b35] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-orange-600 transition"
                  >
                    ✅ Xác nhận đơn
                  </button>
                )}
                {o.status === "CONFIRMED" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusChange(o.id, "preparing");
                    }}
                    className="flex-1 bg-[#ff6b35] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-orange-600 transition"
                  >
                    🍳 Bắt đầu nấu
                  </button>
                )}
                {o.status === "PREPARING" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStatusChange(o.id, "ready");
                    }}
                    className="flex-1 bg-[#2ecc71] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-green-600 transition"
                  >
                    📦 Sẵn sàng giao
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>

      <OrderDetailDrawer
        orderId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
