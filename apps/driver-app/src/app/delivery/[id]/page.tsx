"use client";

// ============================================================================
// Màn hình giao hàng của tài xế — 4 bước:
//   Nhận đơn → Đã đến quán → Đã nhận món → Giao hàng thành công
// Bản đồ tự cập nhật tuyến (tài xế→quán, rồi quán→khách) và mỗi bước đều
// gửi thông báo tới khách hàng.
// ============================================================================

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAuthStore } from "@mythfood/frontend-shared";
import { useDeliveryTrip } from "@/hooks/use-delivery-trip";
import {
  STAGE_ORDER,
  formatKm,
  googleMapsDirections,
  toNum,
} from "@/lib/delivery-flow";

const TripMap = dynamic(
  () => import("@mythfood/frontend-shared/components/MapView"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] w-full animate-pulse bg-gray-100" />
    ),
  },
);

export default function DeliveryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const trip = useDeliveryTrip(id);

  useEffect(() => {
    if (!isAuthenticated) router.push("/login");
  }, [isAuthenticated, router]);

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
    restaurant,
    customer,
    driverLocation,
    route,
    mapMarkers,
    driverEarning,
    advance,
    reload,
  } = trip;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5] px-4">
        <div className="text-center bg-white rounded-2xl shadow-sm p-8 max-w-md">
          <p className="text-5xl mb-4">🔍</p>
          <p className="text-xl font-bold text-[#1a1a2e]">
            Không tìm thấy đơn hàng
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-block bg-[#ff6b35] text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-orange-600 transition"
          >
            ← Về trang chủ
          </Link>
        </div>
      </div>
    );
  }

  // ─── Đã giao xong: màn hình thu nhập ─────────────────────────
  if (stage === "DELIVERED") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5] px-4">
        <div className="w-full max-w-md">
          <div className="text-center bg-white rounded-2xl shadow-sm p-8">
            <p className="text-6xl mb-4">🎉</p>
            <p className="text-xl font-bold text-[#1a1a2e] mb-1">
              Đã giao món thành công!
            </p>
            <p className="text-gray-500 text-sm mb-2">
              Đơn #{order.id?.slice(0, 8)} · đã thông báo cho khách hàng
            </p>
            <p className="text-[#ff6b35] font-bold text-lg mb-6">
              {toNum(order.totalAmount).toLocaleString("vi-VN")}₫
            </p>

            <div className="bg-[#f8fafb] rounded-2xl p-5 mb-4 text-left text-sm">
              <p className="font-bold text-[#1a1a2e] mb-3 text-center">
                💰 Thu nhập của bạn
              </p>
              <div className="flex justify-between items-center bg-blue-50 rounded-xl p-3">
                <div>
                  <p className="font-semibold text-blue-700">
                    🛵 Phí ship nhận được
                  </p>
                  <p className="text-xs text-blue-600">80% phí giao hàng</p>
                </div>
                <span className="font-bold text-blue-700 text-lg">
                  +{driverEarning.toLocaleString("vi-VN")}₫
                </span>
              </div>
            </div>

            <p className="text-xs text-gray-400 mb-4">
              {order.paymentMethod === "COD"
                ? "💵 COD: Phần tiền món đã được tự động trừ khỏi ví để chuyển cho nhà hàng & nền tảng."
                : "Tiền đã được cộng vào ví thu nhập của bạn."}
            </p>

            <div className="space-y-3">
              <Link
                href="/wallet"
                className="block w-full bg-[#ff6b35] text-white py-3.5 rounded-xl font-semibold hover:bg-orange-600 transition"
              >
                💰 Xem ví thu nhập →
              </Link>
              <Link
                href="/dashboard"
                className="block w-full bg-gray-100 text-gray-700 py-3.5 rounded-xl font-semibold hover:bg-gray-200 transition"
              >
                ← Về trang chủ
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Đang trong chuyến ───────────────────────────────────────
  const stageIndex = STAGE_ORDER.indexOf(stage);
  const target = stageMeta.target === "CUSTOMER" ? customer : restaurant;
  const paymentMethod = order.paymentMethod || "CARD";
  const isCod = paymentMethod === "COD" || paymentMethod === "CASH";
  const steps = [
    { icon: "📥", label: "Nhận đơn" },
    { icon: "📍", label: "Đã đến quán" },
    { icon: "📦", label: "Đã nhận món" },
    { icon: "✅", label: "Giao thành công" },
  ];

  return (
    <div className="min-h-screen bg-[#f0f2f5] max-w-[1400px] mx-auto pb-28 w-full">
      <header className="bg-[#1a1a2e] px-4 sm:px-6 py-4 text-white sticky top-0 z-[60]">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="text-white/60 text-lg">
            ←
          </Link>
          <h1 className="text-lg font-bold">🚚 Giao hàng</h1>
          <button
            onClick={() => reload()}
            className="text-white/60 text-lg"
            title="Làm mới"
          >
            🔄
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-4">
        {/* Trạng thái hiện tại */}
        <div className="bg-gradient-to-br from-[#1a1a2e] to-[#2d2d44] rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-white/60">
                Đơn #{order.id?.slice(0, 8)}
              </p>
              <p className="text-xl font-bold mt-0.5">
                {stageMeta.icon} {stageMeta.label}
              </p>
            </div>
            <span className="text-[#ff9f6b] font-bold text-lg">
              {toNum(order.totalAmount).toLocaleString("vi-VN")}₫
            </span>
          </div>
          <p className="text-sm text-white/70 mt-2">{stageMeta.hint}</p>
        </div>

        {/* Tiến trình 4 bước */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
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
                      className={`absolute top-4 left-1/2 w-full h-0.5 ${done ? "bg-[#ff6b35]" : "bg-gray-200"}`}
                    />
                  )}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm z-10 ${
                      done
                        ? "bg-[#ff6b35] text-white"
                        : "bg-gray-100 text-gray-400"
                    } ${current ? "ring-4 ring-orange-200" : ""}`}
                  >
                    {step.icon}
                  </div>
                  <span
                    className={`text-[10px] mt-1.5 leading-tight ${done || current ? "text-[#1a1a2e] font-semibold" : "text-gray-400"}`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bản đồ dẫn đường */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
            <p className="font-bold text-[#1a1a2e] text-sm">
              {stage === "DELIVERING"
                ? "🗺️ Tuyến: vị trí tài xế → khách hàng"
                : stageMeta.target === "CUSTOMER"
                  ? "🗺️ Tuyến: nhà hàng → khách hàng"
                  : "🗺️ Tuyến: vị trí của bạn → nhà hàng"}
            </p>
            {route && (
              <span className="text-xs text-gray-500">
                {formatKm(route.distanceKm)} · ~{route.durationMin} phút
                {route.source === "straight" ? " (ước tính)" : ""}
              </span>
            )}
          </div>
          {mapMarkers.length > 0 ? (
            <TripMap
              locations={mapMarkers}
              route={route?.points}
              height="300px"
              zoom={14}
              className="border-0 rounded-none"
            />
          ) : (
            <p className="text-sm text-gray-400 text-center py-10">
              Chưa có toạ độ để hiển thị bản đồ
            </p>
          )}
          {target && (
            <div className="px-4 py-3 border-t border-gray-100">
              <a
                href={googleMapsDirections(driverLocation, target)}
                target="_blank"
                rel="noreferrer"
                className="block w-full text-center bg-gray-100 text-gray-700 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-200 transition"
              >
                🧭 Mở dẫn đường bằng Google Maps
              </a>
            </div>
          )}
        </div>

        {/* Điểm lấy hàng */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-1">
          <p className="text-xs text-gray-400 font-semibold">
            🏪 LẤY MÓN TẠI NHÀ HÀNG
          </p>
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
            <p className="font-bold text-[#1a1a2e]">
              {merchant?.name || "Nhà hàng"}
            </p>
          </div>
          <p className="text-sm text-gray-600">
            {merchant?.address || "Chưa có địa chỉ nhà hàng"}
          </p>
          {merchant?.phone && (
            <a
              href={`tel:${merchant.phone}`}
              className="inline-block text-sm text-[#ff6b35] font-semibold mt-1"
            >
              📞 Gọi nhà hàng: {merchant.phone}
            </a>
          )}
          {distanceToRestaurantKm != null && (
            <p className="text-sm text-gray-600">
              📏 Cách bạn {formatKm(distanceToRestaurantKm)}
              {distanceToRestaurantMin != null
                ? ` · ~${distanceToRestaurantMin} phút`
                : ""}
            </p>
          )}
        </div>

        {/* Điểm giao hàng */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-1">
          <p className="text-xs text-gray-400 font-semibold">
            🏠 GIAO CHO KHÁCH
          </p>
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
            <div>
              {customerInfo?.fullName && (
                <p className="font-semibold text-[#1a1a2e]">
                  {customerInfo.fullName}
                </p>
              )}
              {customerInfo?.phone && (
                <a
                  href={`tel:${customerInfo.phone}`}
                  className="inline-block text-sm text-[#ff6b35] font-semibold"
                >
                  📞 Gọi khách: {customerInfo.phone}
                </a>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-600">{order.deliveryAddress}</p>
          {order.notes && (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-1.5 inline-block mt-1">
              📝 {order.notes}
            </p>
          )}
        </div>

        {/* Món cần giao */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <h3 className="font-bold text-[#1a1a2e] mb-3">🛒 Món cần giao</h3>
          <div className="space-y-2">
            {order.items?.map((item: any, i: number) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-700">
                  {item.quantity}x {item.name}
                </span>
                <span className="text-gray-600 font-medium">
                  {(
                    toNum(item.unitPrice) * toNum(item.quantity)
                  ).toLocaleString("vi-VN")}
                  ₫
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 text-center">
            <span
              className={`text-sm font-semibold px-4 py-1.5 rounded-full ${isCod ? "bg-yellow-100 text-yellow-800" : "bg-blue-100 text-blue-800"}`}
            >
              {isCod
                ? "💵 Thanh toán COD (thu tiền mặt)"
                : "💳 Đã thanh toán qua thẻ"}
            </span>
          </div>
        </div>

        {/* Thông báo kết quả */}
        {message && (
          <div className="p-3 rounded-xl text-sm font-medium text-center bg-green-50 text-green-700">
            {message}
          </div>
        )}
        {error && (
          <div className="p-3 rounded-xl text-sm font-medium text-center bg-red-50 text-red-600">
            ❌ {error}
          </div>
        )}
      </main>

      {/* Nút hành động của bước hiện tại */}
      {stageMeta.actionLabel && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-5xl bg-white border-t border-gray-100 px-4 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] z-[70]">
          <button
            onClick={advance}
            disabled={busy}
            className="w-full bg-[#ff6b35] text-white py-4 rounded-2xl font-bold text-base hover:bg-orange-600 disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Đang xử lý...
              </>
            ) : (
              stageMeta.actionLabel
            )}
          </button>
          <p className="text-[11px] text-gray-400 text-center mt-1.5">
            {stage === "WAITING"
              ? "Khách sẽ nhận thông báo “Tài xế đang đến nhà hàng”"
              : stage === "GOING_TO_RESTAURANT"
                ? "Khách sẽ nhận thông báo “Tài xế đã đến nhà hàng”"
                : stage === "AT_RESTAURANT"
                  ? "Khách sẽ nhận thông báo “Tài xế đã nhận món, đang giao”"
                  : "Khách sẽ nhận thông báo “Đơn hàng đã được giao”"}
          </p>
        </div>
      )}
    </div>
  );
}
