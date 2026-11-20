"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const BOTTOM_NAV = [
  { href: "/dashboard", icon: "🏠", label: "Trang chủ" },
  { href: "/restaurants", icon: "🔍", label: "Tìm kiếm" },
  { href: "/cart", icon: "🛒", label: "Giỏ hàng" },
  { href: "/orders", icon: "📦", label: "Đơn hàng" },
  { href: "/profile", icon: "👤", label: "Tôi" },
];

/**
 * Khung giao diện dùng chung cho toàn bộ trang khách hàng:
 *  - Header tối màu đồng nhất (nút quay lại + tiêu đề) cho các trang con.
 *  - Main căn giữa theo max-width chuẩn, padding responsive.
 *  - Footer + bottom-nav mobile.
 */
export default function ConsumerShell({
  children,
  title,
  backHref,
  contentClassName = "max-w-[1280px]",
}: {
  children: React.ReactNode;
  title?: string;
  backHref?: string;
  contentClassName?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex flex-col">
      {title && (
        <header className="bg-[#1a1a2e] px-6 py-4 text-white sticky top-0 z-50">
          <div className="max-w-[1280px] mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              {backHref && (
                <button
                  onClick={() => router.push(backHref)}
                  className="text-white/60 hover:text-white text-lg shrink-0"
                  aria-label="Quay lại"
                >
                  ←
                </button>
              )}
              <span className="font-extrabold text-lg truncate">{title}</span>
            </div>
            <Link href="/cart" className="text-xl shrink-0" title="Giỏ hàng">
              🛒
            </Link>
          </div>
        </header>
      )}

      <main
        className={`flex-1 w-full mx-auto px-6 py-6 pb-24 lg:pb-6 ${contentClassName}`}
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
        <div className="max-w-[1280px] mx-auto px-6 text-center text-xs">
          © {new Date().getFullYear()} MyThFood · Nền tảng giao đồ ăn hàng đầu
          Việt Nam
        </div>
      </footer>
    </div>
  );
}
