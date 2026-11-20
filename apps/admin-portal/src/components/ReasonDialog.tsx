"use client";
import { useEffect, useState } from "react";

interface ReasonDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  /** Hiện ô nhập số ngày khóa (0 = khóa vĩnh viễn). */
  withDuration?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string, durationDays: number) => void;
}

/**
 * Hộp thoại nhập lý do khóa / từ chối tài khoản (nhà hàng, tài xế).
 * Lý do được lưu lại và hiển thị cho người dùng ở màn hình đăng nhập.
 */
export default function ReasonDialog({
  open,
  title,
  description,
  confirmLabel = "Xác nhận",
  withDuration = false,
  loading = false,
  onCancel,
  onConfirm,
}: ReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(0);

  useEffect(() => {
    if (open) {
      setReason("");
      setDays(0);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-gray-800">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        )}

        <label className="mt-4 block text-sm font-medium text-gray-700">
          Lý do <span className="text-red-500">*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Nhập lý do để thông báo cho người dùng..."
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#ff6b35] focus:ring-2 focus:ring-orange-100"
        />

        {withDuration && (
          <>
            <label className="mt-3 block text-sm font-medium text-gray-700">
              Số ngày khóa
            </label>
            <input
              type="number"
              min={0}
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#ff6b35] focus:ring-2 focus:ring-orange-100"
            />
            <p className="mt-1 text-xs text-gray-400">
              Nhập 0 để khóa vĩnh viễn (không có ngày tự mở khóa).
            </p>
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={loading || reason.trim().length === 0}
            onClick={() => onConfirm(reason.trim(), days)}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Đang xử lý..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
