"use client";

import { useEffect, useState } from "react";
import { orderApi, reviewApi, uploadApi } from "@mythfood/api-client";
import { Drawer } from "@mythfood/frontend-shared";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "⏳ Chờ xác nhận",
  CONFIRMED: "✅ Đã xác nhận",
  PREPARING: "👨‍🍳 Đang chuẩn bị",
  READY_FOR_PICKUP: "📦 Sẵn sàng",
  OUT_FOR_DELIVERY: "🛵 Đang giao",
  DELIVERED: "🏠 Đã giao",
  CANCELLED: "❌ Đã hủy",
  CANCELLED_NO_DRIVER: "🛑 Hủy - Không có tài xế",
  DELIVERY_FAILED: "❌ Giao hàng thất bại",
  REJECTED: "🚫 Từ chối",
};

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

export default function OrderDetailDrawer({
  orderId,
  onClose,
}: {
  orderId: string | null;
  onClose: () => void;
}) {
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [existingReview, setExistingReview] = useState<any>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [reviewImages, setReviewImages] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setExistingReview(null);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const o = await orderApi.getById(orderId);
        setOrder(o);
        try {
          const r: any = await reviewApi.getByOrder(orderId);
          setExistingReview(r?.data ?? null);
        } catch {
          setExistingReview(null);
        }
      } catch {
        setOrder(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  async function submitReview() {
    if (!order) return;
    setSubmitting(true);
    setReviewStatus("");
    try {
      const created: any = await reviewApi.create({
        orderId: order.id,
        consumerId: order.consumerId,
        merchantId: order.merchantId,
        rating: reviewRating,
        comment: reviewComment.trim() || undefined,
        images: reviewImages.length ? reviewImages : undefined,
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
      setSubmitting(false);
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

  return (
    <Drawer
      open={!!orderId}
      onClose={onClose}
      title={order ? `Đơn #${order.id?.slice(0, 8)}` : "Đơn hàng"}
    >
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
        </div>
      ) : !order ? (
        <p className="text-center text-gray-400 py-20">
          Không tìm thấy đơn hàng
        </p>
      ) : (
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800">
              {STATUS_LABELS[order.status] || order.status}
            </span>
            <span className="text-xs text-gray-400">
              {order.createdAt
                ? new Date(order.createdAt).toLocaleString("vi-VN")
                : ""}
            </span>
          </div>

          <div className="bg-gray-50 rounded-xl p-4">
            <h4 className="font-semibold text-sm text-gray-700 mb-2">
              🍽️ Món đã đặt
            </h4>
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

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Tạm tính</span>
              <span>{toNum(order.subtotal).toLocaleString("vi-VN")}₫</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Phí giao hàng</span>
              <span>{toNum(order.deliveryFee).toLocaleString("vi-VN")}₫</span>
            </div>
            {toNum(order.serviceFee) > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Phí dịch vụ</span>
                <span>{toNum(order.serviceFee).toLocaleString("vi-VN")}₫</span>
              </div>
            )}
            {toNum(order.discount) > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Giảm giá</span>
                <span>-{toNum(order.discount).toLocaleString("vi-VN")}₫</span>
              </div>
            )}
            <div className="border-t pt-2 flex justify-between font-bold">
              <span>Tổng cộng</span>
              <span className="text-[#ff6b35]">
                {toNum(order.totalAmount).toLocaleString("vi-VN")}₫
              </span>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
            <p>📍 {order.deliveryAddress}</p>
          </div>

          {order.status === "DELIVERED" && (
            <div className="border-t border-gray-100 pt-4">
              <h4 className="font-bold text-sm text-gray-800 mb-3">
                ⭐ Đánh giá đơn hàng
              </h4>
              {existingReview ? (
                <div className="text-sm">
                  <p className="text-yellow-500 mb-1">
                    {"⭐".repeat(
                      Math.max(0, Math.min(5, existingReview.rating)),
                    )}
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
                          className="w-16 h-16 object-cover rounded-lg border border-gray-100"
                        />
                      ))}
                    </div>
                  )}
                  {existingReview.merchantReply && (
                    <div className="mt-2 bg-[#fff7ed] rounded-xl p-3">
                      <p className="font-semibold text-[#ff6b35] text-xs mb-1">
                        🏪 Nhà hàng phản hồi:
                      </p>
                      <p className="text-gray-700">
                        {existingReview.merchantReply}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-1 mb-2">
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
                            className="w-16 h-16 object-cover rounded-lg border border-gray-100"
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
                    disabled={submitting}
                    className="mt-2 bg-[#ff6b35] text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-orange-600 transition disabled:opacity-50"
                  >
                    {submitting ? "Đang gửi..." : "Gửi đánh giá"}
                  </button>
                  {reviewStatus && (
                    <p
                      className={`mt-2 text-sm ${reviewStatus.startsWith("✅") ? "text-green-600" : "text-red-600"}`}
                    >
                      {reviewStatus}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
