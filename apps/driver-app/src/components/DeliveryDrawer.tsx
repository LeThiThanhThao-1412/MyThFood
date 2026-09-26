"use client";

// ============================================================================
// Drawer giao hàng dùng chung luồng 4 bước với màn hình /delivery/[id]:
// Nhận đơn → Đã đến quán → Đã nhận món → Giao hàng thành công.
// ============================================================================

import { useState, useEffect } from "react";
import Link from "next/link";
import { chatApi, resolutionApi } from "@mythfood/api-client";
import { Drawer, ChatDrawer, useAuthStore } from "@mythfood/frontend-shared";
import { useDeliveryTrip } from "@/hooks/use-delivery-trip";
import { STAGE_ORDER, formatKm, toNum } from "@/lib/delivery-flow";

const TERMINAL_STATUS: Record<string, { icon: string; label: string }> = {
  DELIVERY_FAILED: { icon: "❌", label: "Giao hàng thất bại" },
  CANCELLED: { icon: "🚫", label: "Đơn đã hủy" },
  CANCELLED_NO_DRIVER: { icon: "🛑", label: "Không có tài xế" },
  REJECTED: { icon: "🚫", label: "Đơn bị từ chối" },
};

export default function DeliveryDrawer({
  orderId,
  onClose,
}: {
  orderId: string | null;
  onClose: () => void;
}) {
  const trip = useDeliveryTrip(orderId);
  const {
    order,
    merchant,
    customerInfo,
    distanceToRestaurantKm,
    distanceToRestaurantMin,
    loading,
    busy,
    error,
    message,
    stage,
    stageMeta,
    driverEarning,
    advance,
  } = trip;

  const { user } = useAuthStore();
  const [chatOpen, setChatOpen] = useState(false);
  const [chatConversationId, setChatConversationId] = useState<string | null>(
    null,
  );
  const [deliveryCase, setDeliveryCase] = useState<any>(null);

  useEffect(() => {
    if (order?.status !== "DELIVERY_FAILED") {
      setDeliveryCase(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res: any = await resolutionApi.listCases({
          orderId: order.id,
          take: 5,
        });
        const list = res?.data ?? [];
        if (!cancelled) setDeliveryCase(list[0] ?? null);
      } catch {
        if (!cancelled) setDeliveryCase(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order?.id, order?.status]);

  const openChatWithCustomer = async () => {
    if (!order || !user?.id || !customerInfo?.userId) return;
    try {
      const res: any = await chatApi.getOrCreateConversation({
        orderId: order.id,
        consumerUserId: customerInfo.userId,
        driverUserId: user.id,
      });
      const conv = res?.data || res;
      if (conv?.id) {
        setChatConversationId(conv.id);
        setChatOpen(true);
      }
    } catch {
      /* ignore */
    }
  };

  const stageIndex = STAGE_ORDER.indexOf(stage);
  const steps = [
    { icon: "📥", label: "Nhận đơn" },
    { icon: "📍", label: "Đến quán" },
    { icon: "📦", label: "Nhận món" },
    { icon: "✅", label: "Giao xong" },
  ];

  const handleAdvance = async () => {
    await advance();
  };

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
      ) : stage === "DELIVERED" ? (
        <div className="px-5 py-10 text-center">
          <p className="text-5xl mb-3">🎉</p>
          <p className="font-bold text-lg text-[#1a1a2e] mb-1">
            Đơn hàng đã được giao
          </p>
          <p className="text-sm text-gray-500 mb-3">
            Thu nhập:{" "}
            <span className="font-bold text-[#ff6b35]">
              +{driverEarning.toLocaleString("vi-VN")}₫
            </span>{" "}
            (80% phí ship)
          </p>
          <Link
            href={`/complaints?orderId=${order.id}`}
            onClick={onClose}
            className="block text-sm text-[#ff6b35] font-semibold hover:underline mb-3"
          >
            🛡️ Khiếu nại
          </Link>
          <button
            onClick={onClose}
            className="bg-[#ff6b35] text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-orange-600 transition"
          >
            Đóng
          </button>
        </div>
      ) : TERMINAL_STATUS[order.status] ? (
        <div className="px-5 py-4 space-y-4">
          <div className="text-center py-6">
            <p className="text-5xl mb-3">
              {TERMINAL_STATUS[order.status].icon}
            </p>
            <p className="font-bold text-lg text-[#1a1a2e] mb-1">
              {TERMINAL_STATUS[order.status].label}
            </p>
            <p className="text-sm text-gray-500">
              {order.cancelReason ||
                order.rejectionReason ||
                "Đơn hàng đã kết thúc"}
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 space-y-1">
            <p className="font-bold text-[#ff6b35]">
              💰 {toNum(order.totalAmount).toLocaleString("vi-VN")}₫
            </p>
            <p>📍 {order.deliveryAddress}</p>
          </div>

          {order.status === "DELIVERY_FAILED" && deliveryCase && (
            <div className="bg-amber-50 rounded-xl p-4 text-sm space-y-2 border border-amber-100">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-800">
                  ⚠️ Khiếu nại của bạn
                </h4>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white text-gray-600 border border-gray-200">
                  {deliveryCase.status}
                </span>
              </div>
              {deliveryCase.respondentResponse ? (
                <>
                  <p className="text-gray-600">
                    <span className="font-semibold">Phản hồi khách:</span>{" "}
                    {deliveryCase.respondentResponse}
                  </p>
                  {deliveryCase.respondentEvidence?.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {deliveryCase.respondentEvidence.map(
                        (url: string, i: number) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={i}
                            src={url}
                            alt="Phản hồi khách"
                            className="h-16 w-16 object-cover rounded-lg border border-gray-200"
                          />
                        ),
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-gray-500">
                  {deliveryCase.status === "OPEN"
                    ? "Đang chờ khách phản hồi..."
                    : "Khách chưa phản hồi"}
                </p>
              )}
              {deliveryCase.resolutionNote && (
                <p className="text-xs text-gray-400">
                  📝 {deliveryCase.resolutionNote}
                </p>
              )}
            </div>
          )}

          <Link
            href={`/complaints?orderId=${order.id}`}
            onClick={onClose}
            className="block text-center text-sm text-[#ff6b35] font-semibold hover:underline"
          >
            🛡️ Khiếu nại
          </Link>
          <button
            onClick={onClose}
            className="w-full bg-[#ff6b35] text-white py-3 rounded-xl font-semibold hover:bg-orange-600 transition"
          >
            Đóng
          </button>
        </div>
      ) : (
        <div className="px-5 py-4 space-y-4">
          <div className="bg-[#1a1a2e] rounded-2xl p-5 text-white text-center">
            <p className="text-3xl mb-1">{stageMeta.icon}</p>
            <p className="font-bold">{stageMeta.label}</p>
            <p className="text-white/60 text-sm mt-1">
              {toNum(order.totalAmount).toLocaleString("vi-VN")}₫
            </p>
          </div>

          {/* Tiến trình */}
          <div className="flex items-start justify-between">
            {steps.map((step, i) => {
              const done = stageIndex >= i + 1;
              const current = stageIndex === i;
              return (
                <div
                  key={step.label}
                  className="flex-1 flex flex-col items-center text-center relative"
                >
                  {i < steps.length - 1 && (
                    <div
                      className={`absolute top-3.5 left-1/2 w-full h-0.5 ${done ? "bg-[#ff6b35]" : "bg-gray-200"}`}
                    />
                  )}
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs z-10 ${
                      done
                        ? "bg-[#ff6b35] text-white"
                        : "bg-gray-100 text-gray-400"
                    } ${current ? "ring-2 ring-orange-200" : ""}`}
                  >
                    {step.icon}
                  </div>
                  <span
                    className={`text-[9px] mt-1 ${done || current ? "text-[#1a1a2e] font-semibold" : "text-gray-400"}`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
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
                    {(
                      toNum(item.unitPrice) * toNum(item.quantity)
                    ).toLocaleString("vi-VN")}
                    ₫
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Nhà hàng */}
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 space-y-1">
            <h4 className="font-semibold text-sm text-gray-700 mb-2">
              🏪 Nhà hàng
            </h4>
            <div className="flex items-center gap-2.5">
              {merchant?.logoUrl ? (
                <img
                  src={merchant.logoUrl}
                  alt=""
                  className="w-9 h-9 rounded-lg object-cover shrink-0"
                />
              ) : (
                <span className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center text-lg shrink-0">
                  🏪
                </span>
              )}
              <p className="font-semibold text-gray-800">
                {merchant?.name || "Nhà hàng"}
              </p>
            </div>
            {merchant?.address && <p>📍 {merchant.address}</p>}
            {merchant?.phone && (
              <a
                href={`tel:${merchant.phone}`}
                className="inline-block text-[#ff6b35] font-semibold"
              >
                📞 {merchant.phone}
              </a>
            )}
            {distanceToRestaurantKm != null && (
              <p>
                📏 Cách bạn {formatKm(distanceToRestaurantKm)}
                {distanceToRestaurantMin != null
                  ? ` · ~${distanceToRestaurantMin} phút`
                  : ""}
              </p>
            )}
          </div>

          {/* Khách hàng */}
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 space-y-1">
            <h4 className="font-semibold text-sm text-gray-700 mb-2">
              🏠 Khách hàng
            </h4>
            <div className="flex items-center gap-2.5">
              {customerInfo?.avatar ? (
                <img
                  src={customerInfo.avatar}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover shrink-0"
                />
              ) : (
                <span className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-lg shrink-0">
                  👤
                </span>
              )}
              <div className="flex-1 min-w-0">
                {customerInfo?.fullName && (
                  <p className="font-semibold text-gray-800">
                    {customerInfo.fullName}
                  </p>
                )}
                {customerInfo?.phone && (
                  <a
                    href={`tel:${customerInfo.phone}`}
                    className="text-[#ff6b35] font-semibold"
                  >
                    📞 {customerInfo.phone}
                  </a>
                )}
              </div>
              <button
                onClick={openChatWithCustomer}
                className="w-9 h-9 rounded-full bg-[#ff6b35]/10 text-[#ff6b35] flex items-center justify-center text-lg shrink-0 hover:bg-[#ff6b35]/20 transition"
                title="Nhắn tin với khách hàng"
              >
                💬
              </button>
            </div>
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

          {message && (
            <p className="text-sm text-green-600 text-center bg-green-50 rounded-xl p-2.5">
              {message}
            </p>
          )}
          {error && (
            <p className="text-sm text-red-600 text-center bg-red-50 rounded-xl p-2.5">
              ❌ {error}
            </p>
          )}

          {stageMeta.actionLabel && (
            <button
              onClick={handleAdvance}
              disabled={busy}
              className="w-full bg-[#ff6b35] text-white py-3.5 rounded-xl font-bold hover:bg-orange-600 disabled:opacity-50 transition"
            >
              {busy ? "Đang xử lý..." : stageMeta.actionLabel}
            </button>
          )}

          <Link
            href={`/delivery/${order.id}`}
            className="block text-center text-sm text-[#ff6b35] font-semibold hover:underline"
          >
            Mở bản đồ dẫn đường →
          </Link>
        </div>
      )}

      <ChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        conversationId={chatConversationId}
        myUserId={user?.id}
        counterpartName={customerInfo?.fullName || "Khách hàng"}
        counterpartAvatar={customerInfo?.avatar}
      />
    </Drawer>
  );
}
