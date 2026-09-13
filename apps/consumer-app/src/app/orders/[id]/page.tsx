"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  orderApi,
  reviewApi,
  dispatchApi,
  uploadApi,
  driverApi,
} from "@mythfood/api-client";
import { useAuthStore, fetchRoute } from "@mythfood/frontend-shared";
import type { RouteInfo } from "@mythfood/frontend-shared";
import { reorderOrder } from "@/lib/reorder";

const TrackingMap = dynamic(
  () => import("@mythfood/frontend-shared/components/MapView"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[260px] w-full animate-pulse bg-gray-100" />
    ),
  },
);

const DRIVER_STATUS_LABELS: Record<string, { icon: string; text: string }> = {
  MATCHING: { icon: "🔎", text: "Đang tìm tài xế..." },
  DRIVER_ASSIGNED: { icon: "📩", text: "Đã ghép tài xế, chờ tài xế nhận đơn" },
  DRIVER_ACCEPTED: { icon: "🛵", text: "Tài xế đang đến nhà hàng" },
  DRIVER_ARRIVED: { icon: "🏪", text: "Tài xế đã đến nhà hàng" },
  PICKED_UP: { icon: "📦", text: "Tài xế đã nhận món, đang giao" },
  DELIVERING: { icon: "🚚", text: "Tài xế đang giao tới bạn" },
  DELIVERED: { icon: "✅", text: "Đơn hàng đã được giao" },
};

const STEPS = [
  { key: "PENDING", icon: "📦", label: "Chờ xác nhận" },
  { key: "CONFIRMED", icon: "✅", label: "Đã xác nhận" },
  { key: "PREPARING", icon: "👨‍🍳", label: "Đang chuẩn bị" },
  { key: "READY_FOR_PICKUP", icon: "📦", label: "Sẵn sàng" },
  { key: "READY", icon: "📦", label: "Sẵn sàng" },
  { key: "OUT_FOR_DELIVERY", icon: "🛵", label: "Đang giao" },
  { key: "DELIVERED", icon: "🏠", label: "Đã giao" },
];

/** Các bước hiển thị dạng thanh ngang (không trùng trạng thái). */
const PROGRESS_STEPS = [
  { key: "PENDING", icon: "📦", label: "Chờ xác nhận" },
  { key: "CONFIRMED", icon: "✅", label: "Đã xác nhận" },
  { key: "PREPARING", icon: "👨‍🍳", label: "Đang chuẩn bị" },
  { key: "READY_FOR_PICKUP", icon: "📦", label: "Sẵn sàng" },
  { key: "OUT_FOR_DELIVERY", icon: "🛵", label: "Đang giao" },
  { key: "DELIVERED", icon: "🏠", label: "Đã giao" },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-50 border-yellow-200 text-yellow-700",
  CONFIRMED: "bg-blue-50 border-blue-200 text-blue-700",
  PREPARING: "bg-blue-50 border-blue-200 text-blue-700",
  READY_FOR_PICKUP: "bg-green-50 border-green-200 text-green-700",
  OUT_FOR_DELIVERY: "bg-purple-50 border-purple-200 text-purple-700",
  DELIVERED: "bg-green-50 border-green-200 text-green-700",
  CANCELLED: "bg-red-50 border-red-200 text-red-700",
  REJECTED: "bg-red-50 border-red-200 text-red-700",
};

function toNum(v: unknown, fallback = 0): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const parsed = parseFloat(v);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const [order, setOrder] = useState<any>(null);
  const [dispatch, setDispatch] = useState<any>(null);
  const [dispatchLocation, setDispatchLocation] = useState<any>(null);
  const [trackingRoute, setTrackingRoute] = useState<RouteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [reordering, setReordering] = useState(false);
  const [reorderMsg, setReorderMsg] = useState("");

  // Review state
  const [existingReview, setExistingReview] = useState<any>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewImages, setReviewImages] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  // Driver info + rating
  const [driverProfile, setDriverProfile] = useState<any>(null);
  const [driverRating, setDriverRating] = useState(5);

  // Cancel order
  const [cancelling, setCancelling] = useState(false);
  const [cancelStatus, setCancelStatus] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    const refresh = async () => {
      try {
        const o = await orderApi.getById(id);
        const dRes = await dispatchApi.getByOrder(id).catch(() => null);
        const d = (dRes as any)?.data ?? null;
        setOrder(o);
        setDispatch(d);

        // Lấy thông tin tài xế (tên, ảnh, biển số, số sao) khi đơn đã có tài xế
        const driverId = o?.driverId || d?.driverId;
        if (driverId) {
          const pRes = await driverApi
            .getPublicProfile(driverId)
            .catch(() => null);
          const p = (pRes as any)?.data ?? null;
          if (p) setDriverProfile(p);
        }

        if (d?.id) {
          const locRes = await dispatchApi.getLocation(d.id).catch(() => null);
          const loc = (locRes as any)?.data ?? null;
          setDispatchLocation(loc);

          // Vẽ tuyến đường thực tế (OSRM) giống app tài xế
          const driverLat = toNum(
            loc?.driverLatitude ?? loc?.merchantLatitude,
            Number.NaN,
          );
          const driverLng = toNum(
            loc?.driverLongitude ?? loc?.merchantLongitude,
            Number.NaN,
          );
          const customerLat = toNum(
            loc?.deliveryLatitude ?? o?.deliveryLatitude,
            Number.NaN,
          );
          const customerLng = toNum(
            loc?.deliveryLongitude ?? o?.deliveryLongitude,
            Number.NaN,
          );
          if (
            !Number.isNaN(driverLat) &&
            !Number.isNaN(driverLng) &&
            !Number.isNaN(customerLat) &&
            !Number.isNaN(customerLng)
          ) {
            const r = await fetchRoute(
              { latitude: driverLat, longitude: driverLng },
              { latitude: customerLat, longitude: customerLng },
            );
            setTrackingRoute(r);
          } else {
            setTrackingRoute(null);
          }
        } else {
          setDispatchLocation(null);
          setTrackingRoute(null);
        }
      } catch {}
    };

    const poll = setInterval(refresh, 5000);
    (async () => {
      await refresh();
      setLoading(false);
    })();
    return () => clearInterval(poll);
  }, [id, isAuthenticated, router]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const r: any = await reviewApi.getByOrder(id);
        setExistingReview(r?.data ?? null);
      } catch {
        /* ignore */
      }
    })();
  }, [id]);

  async function submitReview() {
    if (!order) return;
    setSubmittingReview(true);
    setReviewStatus("");
    try {
      const driverId = order.driverId || driverProfile?.id;
      const created: any = await reviewApi.create({
        orderId: order.id,
        consumerId: order.consumerId,
        merchantId: order.merchantId,
        rating: reviewRating,
        comment: reviewComment.trim() || undefined,
        images: reviewImages.length ? reviewImages : undefined,
        ...(driverId ? { driverId, driverRating } : {}),
      });
      setExistingReview(
        created?.data ?? {
          rating: reviewRating,
          comment: reviewComment.trim(),
          images: reviewImages,
        },
      );
      setReviewStatus("✅ Đã gửi đánh giá");
    } catch (err: any) {
      setReviewStatus(`❌ ${err?.message || "Gửi đánh giá thất bại"}`);
    } finally {
      setSubmittingReview(false);
    }
  }

  async function handleReviewImageUpload(e: any) {
    const files = Array.from(e.target.files || []) as File[];
    if (!files.length) return;
    setUploadingImages(true);
    setReviewStatus("");
    const urls: string[] = [];
    try {
      for (const file of files) {
        const res: any = await uploadApi.uploadImage(file, "reviews");
        urls.push(res.data.url);
      }
      setReviewImages((prev) => [...prev, ...urls].slice(0, 6));
    } catch (err: any) {
      setReviewStatus(`❌ ${err?.message || "Tải ảnh thất bại"}`);
    } finally {
      setUploadingImages(false);
      e.target.value = "";
    }
  }

  function removeReviewImage(url: string) {
    setReviewImages((prev) => prev.filter((u) => u !== url));
  }

  async function handleReorder() {
    if (!order) return;
    setReordering(true);
    setReorderMsg("");
    try {
      const result = await reorderOrder(order);
      if (result.ok) {
        setReorderMsg(
          result.skipped > 0
            ? `✅ Đã thêm ${result.added} món vào giỏ (bỏ qua ${result.skipped} món không còn bán)`
            : `✅ Đã thêm ${result.added} món vào giỏ hàng`,
        );
        router.push("/cart");
      } else {
        setReorderMsg(result.error || "Không có món nào còn bán để đặt lại");
      }
    } finally {
      setReordering(false);
    }
  }

  async function handleCancel() {
    if (!order) return;
    const reason = window.prompt("Lý do hủy đơn:", "Tôi muốn hủy đơn");
    if (reason === null) return;
    if (!reason.trim()) {
      alert("Vui lòng nhập lý do hủy đơn");
      return;
    }
    setCancelling(true);
    setCancelStatus("");
    try {
      const updated = await orderApi.cancel(order.id, {
        reason: reason.trim(),
      });
      setOrder(updated);
      setCancelStatus("✅ Đã hủy đơn");
    } catch (err: any) {
      setCancelStatus(`❌ ${err?.message || "Không thể hủy đơn"}`);
    } finally {
      setCancelling(false);
    }
  }

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

  const currentStepIdx = PROGRESS_STEPS.findIndex(
    (s) =>
      s.key === order.status ||
      (order.status === "READY" && s.key === "READY_FOR_PICKUP"),
  );
  const isCancelled =
    order.status === "CANCELLED" || order.status === "REJECTED";
  const isDelivered = order.status === "DELIVERED";

  // Theo dõi tài xế trên bản đồ khi đang giao
  const isTrackingDelivery =
    !isDelivered &&
    !isCancelled &&
    (order.status === "OUT_FOR_DELIVERY" ||
      dispatch?.status === "PICKED_UP" ||
      dispatch?.status === "DELIVERING");

  const trackingDriverLat = toNum(
    dispatchLocation?.driverLatitude ?? dispatchLocation?.merchantLatitude,
    Number.NaN,
  );
  const trackingDriverLng = toNum(
    dispatchLocation?.driverLongitude ?? dispatchLocation?.merchantLongitude,
    Number.NaN,
  );
  const trackingCustomerLat = toNum(
    dispatchLocation?.deliveryLatitude ?? order?.deliveryLatitude,
    Number.NaN,
  );
  const trackingCustomerLng = toNum(
    dispatchLocation?.deliveryLongitude ?? order?.deliveryLongitude,
    Number.NaN,
  );

  const trackingMarkers: any[] = [];
  if (!Number.isNaN(trackingDriverLat) && !Number.isNaN(trackingDriverLng)) {
    trackingMarkers.push({
      latitude: trackingDriverLat,
      longitude: trackingDriverLng,
      emoji: "🛵",
      label: "🛵 Tài xế",
    });
  }
  if (
    !Number.isNaN(trackingCustomerLat) &&
    !Number.isNaN(trackingCustomerLng)
  ) {
    trackingMarkers.push({
      latitude: trackingCustomerLat,
      longitude: trackingCustomerLng,
      emoji: "🏠",
      label: "🏠 Khách hàng",
    });
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] lg:max-w-3xl mx-auto relative pb-24">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="px-4 h-16 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-gray-400 hover:text-[#ff6b35] text-lg transition"
          >
            ←
          </Link>
          <h1 className="text-lg font-bold text-[#1a1a2e]">
            Đơn #{order.id?.slice(0, 8)}
          </h1>
          <div className="w-6" />
        </div>
      </header>

      <main className="px-4 py-6 space-y-5">
        {/* Status Banner */}
        <div
          className={`rounded-2xl p-6 text-center border ${STATUS_COLORS[order.status] || STATUS_COLORS.PENDING}`}
        >
          <p className="text-4xl mb-2">
            {isDelivered ? "🎉" : isCancelled ? "❌" : "🔄"}
          </p>
          <p className="text-xl font-bold">
            {STEPS.find((s) => s.key === order.status)?.icon}{" "}
            {STEPS.find((s) => s.key === order.status)?.label}
          </p>
          <p className="text-sm mt-1 opacity-70">
            {isDelivered
              ? "Đơn hàng đã giao thành công!"
              : isCancelled
                ? "Đơn hàng đã bị hủy"
                : "Đơn hàng đang được xử lý. Tự động cập nhật mỗi 5s."}
          </p>

          {(order.status === "PENDING" || order.status === "CONFIRMED") && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="mt-4 bg-red-500 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-red-600 transition disabled:opacity-50"
            >
              {cancelling ? "Đang hủy..." : "❌ Hủy đơn"}
            </button>
          )}
          {cancelStatus && (
            <p
              className={`text-sm mt-2 font-medium ${cancelStatus.startsWith("✅") ? "text-green-600" : "text-red-600"}`}
            >
              {cancelStatus}
            </p>
          )}
        </div>

        {/* Real-time tài xế (theo dispatch) */}
        {!isDelivered &&
          !isCancelled &&
          (order.status === "READY_FOR_PICKUP" ||
            order.status === "OUT_FOR_DELIVERY") && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-start gap-3">
              <span className="text-2xl">
                {DRIVER_STATUS_LABELS[dispatch?.status]?.icon ?? "🛵"}
              </span>
              <div>
                <p className="font-bold text-[#1a1a2e] text-sm">
                  {DRIVER_STATUS_LABELS[dispatch?.status]?.text ??
                    "Đang tìm tài xế..."}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {dispatch?.status === "DELIVERING" ||
                  dispatch?.status === "PICKED_UP"
                    ? "Tài xế đã nhận món và đang trên đường tới bạn."
                    : dispatch?.status === "DRIVER_ARRIVED"
                      ? "Tài xế đang chờ nhà hàng bàn giao món."
                      : dispatch?.status === "DRIVER_ACCEPTED"
                        ? "Tài xế đang trên đường đến nhà hàng."
                        : "Trạng thái tự động cập nhật mỗi 5 giây."}
                </p>
              </div>
            </div>
          )}

        {/* Thông tin tài xế giao hàng */}
        {driverProfile && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h3 className="font-bold text-[#1a1a2e] mb-3">
              🛵 Tài xế giao hàng
            </h3>
            <div className="flex items-center gap-4">
              {driverProfile.avatar ? (
                <img
                  src={driverProfile.avatar}
                  alt={driverProfile.fullName}
                  className="w-14 h-14 rounded-full object-cover border border-gray-100 bg-gray-50"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-[#1a1a2e] text-white flex items-center justify-center text-xl font-bold">
                  {driverProfile.fullName?.charAt(0)?.toUpperCase() || "🧑"}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-gray-800">
                  {driverProfile.fullName || "Tài xế"}
                </p>
                <p className="text-sm text-gray-500">
                  🏍️ Biển số: {driverProfile.vehicleRegistrationNumber || "—"}
                </p>
                <p className="text-sm text-gray-500">
                  ⭐ {Number(driverProfile.rating || 0).toFixed(1)}
                  {driverProfile.totalRatings
                    ? ` (${driverProfile.totalRatings} đánh giá)`
                    : ""}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Bản đồ theo dõi tài xế */}
        {isTrackingDelivery && trackingMarkers.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="font-bold text-[#1a1a2e] text-sm">
                🗺️ Theo dõi tài xế giao hàng
              </p>
              <span className="text-xs text-gray-400">
                {trackingRoute
                  ? `${trackingRoute.distanceKm < 1 ? `${Math.round(trackingRoute.distanceKm * 1000)}m` : `${trackingRoute.distanceKm.toFixed(1)}km`} · ~${trackingRoute.durationMin} phút`
                  : "Cập nhật 5s"}
              </span>
            </div>
            <TrackingMap
              locations={trackingMarkers}
              route={trackingRoute?.points}
              height="260px"
              zoom={14}
              className="border-0 rounded-none"
            />
          </div>
        )}

        {/* Progress Tracker */}
        {!isCancelled && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h3 className="font-bold text-[#1a1a2e] mb-4">
              📋 Tiến trình đơn hàng
            </h3>
            <div className="flex items-start">
              {PROGRESS_STEPS.map((step, idx) => {
                const isDone = idx <= currentStepIdx;
                const isCurrent = idx === currentStepIdx;
                return (
                  <div
                    key={step.key}
                    className="flex-1 flex flex-col items-center text-center relative"
                  >
                    {idx < PROGRESS_STEPS.length - 1 && (
                      <div
                        className={`absolute top-4 left-1/2 w-full h-0.5 ${
                          idx < currentStepIdx ? "bg-[#ff6b35]" : "bg-gray-200"
                        }`}
                      />
                    )}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm z-10 ${
                        isDone
                          ? "bg-[#ff6b35] text-white"
                          : "bg-gray-100 text-gray-400"
                      } ${isCurrent ? "ring-4 ring-orange-200" : ""}`}
                    >
                      {step.icon}
                    </div>
                    <span
                      className={`text-[10px] mt-1 leading-tight ${
                        isDone || isCurrent
                          ? "text-[#1a1a2e] font-semibold"
                          : "text-gray-400"
                      }`}
                    >
                      {step.label}
                    </span>
                    <span className="text-[9px] text-gray-400">
                      {isDelivered
                        ? "✅"
                        : isCurrent && !isDelivered
                          ? "Đang xử lý..."
                          : isDone
                            ? "✅"
                            : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Items */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-[#1a1a2e] mb-3">🛒 Món đã đặt</h3>
          <div className="space-y-2">
            {order.items?.map((item: any, i: number) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-700">
                  {item.quantity}x {item.name}
                </span>
                <span className="text-gray-600 font-medium">
                  {((item.unitPrice || 0) * item.quantity).toLocaleString(
                    "vi-VN",
                  )}
                  ₫
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Delivery Info */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-[#1a1a2e] mb-3">📍 Giao hàng</h3>
          <p className="text-sm text-gray-600">{order.deliveryAddress}</p>
          {order.notes && (
            <p className="text-xs text-gray-400 mt-2 bg-gray-50 rounded-lg px-3 py-1.5 inline-block">
              📝 {order.notes}
            </p>
          )}
        </div>

        {/* Payment Summary */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-[#1a1a2e] mb-3">💰 Thanh toán</h3>
          <div className="flex items-center gap-2 mb-3">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                order.paymentMethod === "CREDIT_CARD"
                  ? "bg-purple-100 text-purple-700"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {order.paymentMethod === "CREDIT_CARD"
                ? "💳 Thẻ"
                : order.paymentMethod === "CASH"
                  ? "💵 Tiền mặt"
                  : order.paymentMethod || "💵 Tiền mặt"}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Tạm tính</span>
              <span className="font-medium">
                {Math.max(
                  0,
                  toNum(order.totalAmount) -
                    toNum(order.deliveryFee) -
                    toNum(order.serviceFee) +
                    toNum(order.discount),
                ).toLocaleString("vi-VN")}
                ₫
              </span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Phí giao hàng</span>
              <span className="font-medium">
                {toNum(order.deliveryFee).toLocaleString("vi-VN")}₫
              </span>
            </div>
            <div className="border-t pt-2 mt-1 flex justify-between font-bold">
              <span>Tổng cộng</span>
              <span className="text-[#ff6b35] text-lg">
                {toNum(order.totalAmount).toLocaleString("vi-VN")}₫
              </span>
            </div>
          </div>
        </div>

        {isDelivered && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h3 className="font-bold text-[#1a1a2e] mb-3">
              ⭐ Đánh giá đơn hàng
            </h3>
            {existingReview ? (
              <div className="text-sm">
                <p className="text-yellow-500 mb-1">
                  {"⭐".repeat(Math.max(0, Math.min(5, existingReview.rating)))}
                </p>
                {existingReview.comment && (
                  <p className="text-gray-700">{existingReview.comment}</p>
                )}
                {existingReview.images?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {existingReview.images.map((img: string, i: number) => (
                      <img
                        key={i}
                        src={img}
                        alt={`Ảnh đánh giá ${i + 1}`}
                        className="w-20 h-20 object-cover rounded-lg border border-gray-100"
                      />
                    ))}
                  </div>
                )}
                {existingReview.merchantReply && (
                  <div className="mt-2 bg-[#fff7ed] rounded-xl p-3 text-sm">
                    <p className="font-semibold text-[#ff6b35] text-xs mb-1">
                      🏪 Phản hồi nhà hàng:
                    </p>
                    <p className="text-gray-700">
                      {existingReview.merchantReply}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setReviewRating(n)}
                      className={`text-2xl ${n <= reviewRating ? "" : "opacity-30"}`}
                    >
                      ⭐
                    </button>
                  ))}
                </div>
                {driverProfile && (
                  <div className="mb-3 border-t border-gray-100 pt-3">
                    <p className="text-sm font-semibold text-gray-700 mb-1">
                      🛵 Đánh giá tài xế giao hàng
                    </p>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setDriverRating(n)}
                          className={`text-2xl ${n <= driverRating ? "" : "opacity-30"}`}
                        >
                          ⭐
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Chia sẻ trải nghiệm của bạn..."
                  rows={3}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
                />
                <div className="mt-3">
                  <div className="flex flex-wrap gap-2 mb-2">
                    {reviewImages.map((img, i) => (
                      <div key={i} className="relative">
                        <img
                          src={img}
                          alt={`Ảnh ${i + 1}`}
                          className="w-20 h-20 object-cover rounded-lg border border-gray-100"
                        />
                        <button
                          type="button"
                          onClick={() => removeReviewImage(img)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white w-5 h-5 rounded-full text-xs leading-5"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <label className="inline-block cursor-pointer text-sm text-[#ff6b35] border border-[#ff6b35] rounded-xl px-3 py-2 hover:bg-orange-50 transition">
                    📷 Thêm ảnh
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleReviewImageUpload}
                      disabled={uploadingImages}
                      className="hidden"
                    />
                  </label>
                  {uploadingImages && (
                    <span className="ml-2 text-sm text-gray-400">
                      Đang tải ảnh...
                    </span>
                  )}
                </div>
                <button
                  onClick={submitReview}
                  disabled={submittingReview}
                  className="mt-3 bg-[#ff6b35] text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-orange-600 transition disabled:opacity-50"
                >
                  {submittingReview ? "Đang gửi..." : "Gửi đánh giá"}
                </button>
                {reviewStatus && (
                  <p
                    className={`mt-2 text-sm font-medium ${reviewStatus.startsWith("✅") ? "text-green-600" : "text-red-600"}`}
                  >
                    {reviewStatus}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleReorder}
          disabled={reordering}
          className="w-full bg-white border-2 border-[#ff6b35] text-[#ff6b35] py-3.5 rounded-xl font-semibold hover:bg-orange-50 transition disabled:opacity-50"
        >
          {reordering ? "Đang thêm vào giỏ..." : "🔄 Đặt lại đơn này"}
        </button>
        {reorderMsg && (
          <p
            className={`text-sm font-medium text-center ${reorderMsg.startsWith("✅") ? "text-green-600" : "text-red-600"}`}
          >
            {reorderMsg}
          </p>
        )}

        <Link
          href="/dashboard"
          className="block text-center bg-[#ff6b35] text-white py-3.5 rounded-xl font-semibold hover:bg-orange-600 transition"
        >
          ← Về trang chủ
        </Link>
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full lg:max-w-3xl bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        <Link
          href="/dashboard"
          className="flex flex-col items-center text-[10px] text-[#ff6b35] no-underline"
        >
          <span className="text-[22px]">🏠</span>
          <span>Trang chủ</span>
        </Link>
        <Link
          href="/restaurants"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">🔍</span>
          <span>Tìm kiếm</span>
        </Link>
        <Link
          href="/cart"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">🛒</span>
          <span>Giỏ hàng</span>
        </Link>
        <Link
          href="/orders"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">📦</span>
          <span>Đơn hàng</span>
        </Link>
        <Link
          href="/dashboard"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">👤</span>
          <span>Tài khoản</span>
        </Link>
      </nav>
    </div>
  );
}
