"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Carousel ngang dùng chung cho các danh sách thẻ trên dashboard:
 *  - Cuộn bằng 2 nút điều hướng `<` / `>` (ẩn native scrollbar).
 *  - Nút tự vô hiệu hóa khi đã cuộn tới đầu/cuối
 *    (hoặc danh sách không đủ dài để cuộn).
 *  - Hỗ trợ snap từng thẻ (dùng class `snap-start` trên thẻ con).
 */
export default function CardCarousel({
  children,
  ariaLabel,
  scrollAmount = 320,
  className = "",
}: {
  children: React.ReactNode;
  /** Nhãn dùng cho aria-label của 2 nút điều hướng. */
  ariaLabel: string;
  /** Số pixel mỗi lần bấm nút điều hướng. */
  scrollAmount?: number;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const updateControls = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    setCanScrollPrev(el.scrollLeft > 4);
    setCanScrollNext(el.scrollLeft < maxScrollLeft - 4);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    updateControls();
    el.addEventListener("scroll", updateControls, { passive: true });

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(updateControls);
      observer.observe(el);
      Array.from(el.children).forEach((child) => observer?.observe(child));
    } else {
      window.addEventListener("resize", updateControls);
    }

    return () => {
      el.removeEventListener("scroll", updateControls);
      observer?.disconnect();
      window.removeEventListener("resize", updateControls);
    };
  }, [updateControls]);

  const scroll = (direction: -1 | 1) => {
    trackRef.current?.scrollBy({
      left: direction * scrollAmount,
      behavior: "smooth",
    });
  };

  const controlClassName =
    "absolute top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white shadow-md border border-gray-200 text-gray-600 hover:bg-[#fff7ed] hover:text-[#ff6b35] flex items-center justify-center text-lg transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-gray-600";

  return (
    <div className={`relative ${className}`.trim()}>
      <button
        type="button"
        onClick={() => scroll(-1)}
        disabled={!canScrollPrev}
        aria-label={`${ariaLabel}: xem mục trước`}
        className={`${controlClassName} left-0`}
      >
        {"<"}
      </button>

      <div
        ref={trackRef}
        className="flex gap-4 overflow-x-auto hide-scrollbar scroll-smooth snap-x snap-mandatory px-9 py-1"
      >
        {children}
      </div>

      <button
        type="button"
        onClick={() => scroll(1)}
        disabled={!canScrollNext}
        aria-label={`${ariaLabel}: xem mục tiếp theo`}
        className={`${controlClassName} right-0`}
      >
        {">"}
      </button>
    </div>
  );
}
