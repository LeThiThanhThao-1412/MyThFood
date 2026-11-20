"use client";

// ============================================================================
// CurrentLocationChip — hiển thị vị trí giao hàng đang dùng và cho khách hàng
// bấm để cập nhật lại (mở LocationGate ở chế độ điều khiển).
//
// Vị trí này là nguồn dữ liệu cho khoảng cách, phí ship và bộ lọc "gần tôi",
// nên khách hàng cần đổi được ở bất cứ trang nào chứ không chỉ lần đầu vào app.
// ============================================================================

import { useState } from "react";
import { LocationGate, useLocationStore } from "@mythfood/frontend-shared";

interface CurrentLocationChipProps {
  /**
   * "light" → dùng trên nền tối/gradient (chữ trắng).
   * "dark" (mặc định) → dùng trên nền sáng (chip trắng, chữ xám).
   */
  tone?: "light" | "dark";
  /** Hiện thêm toạ độ GPS bên cạnh địa chỉ. */
  showCoords?: boolean;
  className?: string;
}

export default function CurrentLocationChip({
  tone = "dark",
  showCoords = false,
  className = "",
}: CurrentLocationChipProps) {
  const { location, hasLocation } = useLocationStore();
  const [editorOpen, setEditorOpen] = useState(false);

  const isLight = tone === "light";
  const label =
    hasLocation && location
      ? location.address || "Vị trí hiện tại"
      : "Chưa chọn vị trí giao hàng";

  return (
    <>
      <button
        type="button"
        onClick={() => setEditorOpen(true)}
        title="Cập nhật vị trí giao hàng"
        className={`inline-flex items-center gap-2 max-w-full rounded-full transition ${
          isLight
            ? "bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 text-xs"
            : "bg-white hover:bg-gray-50 text-gray-600 border border-gray-100 shadow-sm px-3.5 py-2 text-xs"
        } ${className}`}
      >
        <span>📍</span>
        <span className="truncate max-w-[180px] sm:max-w-[320px] font-medium">
          {label}
        </span>
        {showCoords && hasLocation && location && (
          <span
            className={`hidden sm:inline font-mono ${isLight ? "text-white/60" : "text-gray-400"}`}
          >
            ({Number(location.latitude).toFixed(6)},{" "}
            {Number(location.longitude).toFixed(6)})
          </span>
        )}
        <span
          className={`shrink-0 font-semibold ${isLight ? "text-white underline" : "text-[#ff6b35]"}`}
        >
          {hasLocation ? "Đổi vị trí" : "Chọn vị trí"}
        </span>
      </button>

      <LocationGate open={editorOpen} onClose={() => setEditorOpen(false)} />
    </>
  );
}
