"use client";

import { useRef } from "react";

/**
 * Thanh cuộn ngang dùng chung cho danh mục:
 *  - Cuộn bằng nút `<` / `>` (không hiện thanh cuộn ngang).
 *  - Ẩn native scrollbar (dùng class .hide-scrollbar trong globals.css).
 */
export default function CategoryScroller({
  children,
  scrollAmount = 280,
  gapClassName = "gap-2 sm:gap-3",
}: {
  children: React.ReactNode;
  scrollAmount?: number;
  /** Khoảng cách giữa các item — danh mục trang chủ truyền "gap-5" (20px). */
  gapClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const scroll = (dir: -1 | 1) => {
    ref.current?.scrollBy({ left: dir * scrollAmount, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => scroll(-1)}
        aria-label="Cuộn trái"
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white shadow-md border border-gray-200 text-gray-600 hover:bg-[#fff7ed] hover:text-[#ff6b35] flex items-center justify-center text-lg transition shrink-0"
      >
        {"<"}
      </button>

      <div
        ref={ref}
        className={`flex ${gapClassName} overflow-x-auto hide-scrollbar scroll-smooth px-9`}
      >
        {children}
      </div>

      <button
        type="button"
        onClick={() => scroll(1)}
        aria-label="Cuộn phải"
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white shadow-md border border-gray-200 text-gray-600 hover:bg-[#fff7ed] hover:text-[#ff6b35] flex items-center justify-center text-lg transition shrink-0"
      >
        {">"}
      </button>
    </div>
  );
}
