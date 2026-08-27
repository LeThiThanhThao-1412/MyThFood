"use client";

import { useEffect } from "react";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Reusable responsive drawer.
 * - Desktop: slides in from the right (fixed 480px panel).
 * - Mobile: slides up as a bottom-sheet (full width, max 92vh).
 */
export default function Drawer({
  open,
  onClose,
  title,
  children,
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-stretch sm:justify-end">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative flex flex-col w-full sm:w-[480px] max-h-[92vh] sm:max-h-none sm:h-full bg-white shadow-2xl rounded-t-2xl sm:rounded-t-none sm:rounded-l-2xl">
        {title != null && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
            <h3 className="font-bold text-lg text-[#1a1a2e]">{title}</h3>
            <button
              onClick={onClose}
              aria-label="Đóng"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 text-lg transition"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
