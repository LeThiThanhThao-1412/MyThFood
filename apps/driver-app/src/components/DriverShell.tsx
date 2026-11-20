"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { driverApi } from "@mythfood/api-client";
import {
  useAuthStore,
  getAccountBlockFromProfile,
  storeAccountBlock,
} from "@mythfood/frontend-shared";

const NAV_ITEMS = [
  { href: "/dashboard", icon: "📊", label: "Tổng quan" },
  { href: "/earnings", icon: "💰", label: "Thu nhập" },
  { href: "/reviews", icon: "⭐", label: "Đánh giá" },
  { href: "/wallet", icon: "💳", label: "Ví" },
  { href: "/location", icon: "📍", label: "Khu vực" },
  { href: "/complaints", icon: "🛡️", label: "Khiếu nại" },
  { href: "/profile", icon: "👤", label: "Hồ sơ" },
];

const BOTTOM_NAV = [
  { href: "/dashboard", icon: "🏠", label: "Trang chủ" },
  { href: "/earnings", icon: "💰", label: "Thu nhập" },
  { href: "/wallet", icon: "💳", label: "Ví" },
  { href: "/profile", icon: "👤", label: "Tôi" },
];

/**
 * Khung giao diện dùng chung cho toàn bộ trang tài xế:
 *  - Header tối màu đồng nhất (logo + nav, hoặc nút quay lại + tiêu đề).
 *  - Main căn giữa theo max-width chuẩn, padding responsive.
 *  - Footer + bottom-nav mobile.
 */
export default function DriverShell({
  children,
  title,
  backHref,
  contentClassName = "max-w-[1600px]",
}: {
  children: React.ReactNode;
  title?: string;
  backHref?: string;
  contentClassName?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();

  // Nếu hồ sơ tài xế đã bị từ chối trong khi vẫn còn token cũ,
  // buộc đăng xuất và chuyển về trang login kèm thông báo.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) return;
      try {
        const res: any = await driverApi.getByUserId(user.id);
        const d = res?.data ?? res;
        if (cancelled || !d) return;
        if (d.status === "REJECTED") {
          const block = getAccountBlockFromProfile({
            status: "REJECTED",
            rejectedAt: d.rejectedAt,
            rejectReason: d.rejectReason,
          });
          if (block) {
            storeAccountBlock(block);
            clearAuth();
            router.replace("/login");
          }
        }
      } catch {
        // Bỏ qua khi chưa tải được hồ sơ tài xế.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, clearAuth, router]);

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex flex-col">
      <header className="bg-[#1a1a2e] px-4 sm:px-6 py-4 text-white sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3">
          {backHref ? (
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => router.push(backHref)}
                className="text-white/60 hover:text-white text-lg shrink-0"
                aria-label="Quay lại"
              >
                ←
              </button>
              <span className="font-extrabold text-lg truncate">
                {title || "MyThFood"}
              </span>
            </div>
          ) : (
            <Link href="/dashboard" className="text-xl font-extrabold shrink-0">
              MyTh<span className="text-[#ff6b35]">Food</span>
            </Link>
          )}

          {!backHref && (
            <nav className="hidden md:flex items-center gap-1 overflow-x-auto hide-scrollbar">
              {NAV_ITEMS.map((item) => {
                const active =
                  item.href === pathname || pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                      active
                        ? "bg-[#ff6b35] text-white"
                        : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span className="mr-1">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}

          <button
            onClick={() => {
              clearAuth();
              router.push("/");
            }}
            className="text-xs text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition whitespace-nowrap shrink-0"
          >
            Đăng xuất
          </button>
        </div>
      </header>

      <main
        className={`flex-1 w-full mx-auto px-4 sm:px-6 py-6 pb-24 lg:pb-6 ${contentClassName}`}
      >
        {children}
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        {BOTTOM_NAV.map((item) => {
          const active =
            item.href === pathname || pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center text-[10px] no-underline ${
                active ? "text-[#ff6b35]" : "text-gray-400"
              }`}
            >
              <span className="text-[22px]">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <footer className="bg-[#1a1a2e] text-white/60 py-6 mt-auto hidden lg:block">
        <div className="max-w-[1600px] mx-auto px-4 text-center text-xs">
          © {new Date().getFullYear()} MyThFood Driver · Nền tảng giao đồ ăn
          hàng đầu Việt Nam
        </div>
      </footer>
    </div>
  );
}
