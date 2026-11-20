"use client";

// ============================================================================
// Hộp thoại buộc tài xế chụp ảnh món ăn lúc giao cho khách trước khi xác nhận
// “Giao hàng thành công”. Ảnh được tải lên upload-service (folder delivery-proof)
// và lưu vào đơn (order.deliveryProofPhotoUrl) làm bằng chứng khi khách khiếu nại.
// ============================================================================

import { useState } from "react";
import { uploadApi } from "@mythfood/api-client";

export default function DeliveryProofDialog({
  open,
  busy,
  serverError,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  /** Lỗi từ bước xác nhận giao hàng (VD: order-service từ chối). */
  serverError?: string;
  onClose: () => void;
  /** Trả về `true` khi giao hàng đã được xác nhận thành công. */
  onConfirm: (photoUrl: string) => Promise<boolean>;
}) {
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState("");

  if (!open) return null;

  function close() {
    setPhotoUrl("");
    setLocalError("");
    onClose();
  }

  async function uploadPhoto(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setLocalError("");
    try {
      const res: any = await uploadApi.uploadImage(file, "delivery-proof");
      const url = res?.data?.url || res?.url || "";
      if (!url) throw new Error("Không nhận được URL ảnh");
      setPhotoUrl(url);
    } catch (err: any) {
      setLocalError(err?.message || "Không thể tải ảnh xác nhận giao hàng");
    } finally {
      setUploading(false);
    }
  }

  async function confirm() {
    if (!photoUrl) {
      setLocalError(
        "Vui lòng chụp ảnh món ăn khi giao cho khách trước khi xác nhận",
      );
      return;
    }
    setLocalError("");
    const ok = await onConfirm(photoUrl);
    if (ok) {
      setPhotoUrl("");
      setLocalError("");
      onClose();
    }
  }

  const message = localError || serverError || "";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[80] px-4 pb-6 sm:pb-0">
      <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-[#1a1a2e]">
              📷 Chụp ảnh xác nhận giao hàng
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Chụp rõ món ăn/túi hàng khi giao đến tay khách. Ảnh được lưu làm
              bằng chứng nếu khách khiếu nại chưa nhận hàng.
            </p>
          </div>
          <button
            onClick={close}
            className="text-gray-400 text-lg leading-none shrink-0"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        <label
          className={`block border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition ${
            photoUrl
              ? "border-green-300 bg-green-50"
              : "border-orange-200 bg-orange-50 hover:bg-orange-100"
          }`}
        >
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={uploadPhoto}
            disabled={uploading || busy}
            className="hidden"
          />
          <p className="text-3xl mb-1">{photoUrl ? "✅" : "📸"}</p>
          <p className="text-sm font-semibold text-[#1a1a2e]">
            {photoUrl
              ? "Đã chụp ảnh — bấm để chụp lại"
              : "Bấm để chụp ảnh món ăn"}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">
            Mở camera sau (hoặc chọn ảnh có sẵn trong máy)
          </p>
        </label>

        {uploading && (
          <p className="text-xs text-gray-400 text-center">
            Đang tải ảnh lên...
          </p>
        )}

        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt="Ảnh xác nhận giao hàng"
            className="w-full max-h-56 object-cover rounded-xl border border-gray-200"
          />
        )}

        {message && (
          <p className="text-xs text-red-600 text-center font-medium">
            ❌ {message}
          </p>
        )}

        <button
          onClick={confirm}
          disabled={busy || uploading || !photoUrl}
          className="w-full bg-[#ff6b35] text-white py-3.5 rounded-xl font-bold disabled:opacity-50"
        >
          {busy ? "Đang xác nhận..." : "✅ Xác nhận đã giao thành công"}
        </button>
        <p className="text-[11px] text-gray-400 text-center">
          Bắt buộc có ảnh mới được xác nhận giao hàng thành công.
        </p>
      </div>
    </div>
  );
}
