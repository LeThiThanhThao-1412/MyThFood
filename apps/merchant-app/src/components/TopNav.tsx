"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore, NotificationBell } from "@mythfood/frontend-shared";
import { useMerchantSocket } from "./SocketProvider";

const NAV_ITEMS = [
  { href: "/dashboard", icon: "📊", label: "Tổng quan" },
  { href: "/orders", icon: "📦", label: "Đơn hàng" },
  { href: "/menu", icon: "📋", label: "Menu" },
  { href: "/promotions", icon: "🏷️", label: "Khuyến mãi" },
  { href: "/reviews", icon: "⭐", label: "Đánh giá" },
  { href: "/wallet", icon: "💰", label: "Ví" },
  { href: "/settings", icon: "⚙️", label: "Cài đặt" },
];

export default function TopNav({
  merchantName,
  isOpen,
}: {
  merchantName?: string;
  isOpen?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { clearAuth, user } = useAuthStore();
  const { newOrderCount } = useMerchantSocket();

  return (
    <header className="sticky top-0 z-50 bg-[#1a1a2e] text-white shadow-md">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="text-lg sm:text-xl font-extrabold shrink-0"
        >
          MyTh<span className="text-[#ff6b35]">Food</span>
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto hide-scrollbar">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/orders"
                ? pathname.startsWith("/orders")
                : pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  active
                    ? "bg-[#ff6b35] text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span>{item.icon}</span>
                <span className="hidden sm:inline">{item.label}</span>
                {item.href === "/orders" && newOrderCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {newOrderCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {merchantName && (
            <span className="hidden md:block text-sm text-white/70 truncate max-w-[140px]">
              {merchantName}
            </span>
          )}
          {isOpen !== undefined && (
            <span
              className={`hidden sm:inline text-xs px-2 py-0.5 rounded-full ${isOpen === false ? "bg-red-500/20 text-red-300" : "bg-green-500/20 text-green-300"}`}
            >
              {isOpen === false ? "🔴 Tạm đóng" : "🟢 Mở cửa"}
            </span>
          )}
          <NotificationBell userId={user?.id} />
          <button
            onClick={() => {
              clearAuth();
              router.push("/");
            }}
            className="text-xs text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition whitespace-nowrap"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </header>
  );
}
