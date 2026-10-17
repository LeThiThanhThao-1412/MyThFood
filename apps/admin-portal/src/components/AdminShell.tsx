"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@mythfood/frontend-shared";
import { merchantApi, driverApi, resolutionApi } from "@mythfood/api-client";

export const ADMIN_NAV = [
  { href: "/", label: "Tổng quan", icon: "📊" },
  { href: "/merchants", label: "Nhà hàng", icon: "🏪" },
  { href: "/drivers", label: "Tài xế", icon: "🛵" },
  { href: "/promotions", label: "Khuyến mãi", icon: "🏷️" },
  { href: "/price-management", label: "Biến động giá", icon: "📉" },
  { href: "/orders", label: "Đơn hàng", icon: "📋" },
  { href: "/transactions", label: "Giao dịch", icon: "💰" },
  { href: "/settlement", label: "Quyết toán", icon: "💼" },
  { href: "/revenue", label: "Doanh thu", icon: "📈" },
  { href: "/users", label: "Người dùng", icon: "👥" },
  { href: "/cases", label: "Sự cố", icon: "🛡️" },
];

// Các trạng thái vụ việc (sự cố) được xem là "chưa giải quyết".
const UNRESOLVED_CASE_STATUSES = [
  "OPEN",
  "UNDER_REVIEW",
  "WAITING_EVIDENCE",
  "ESCALATED",
];

export default function AdminShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, clearAuth } = useAuthStore();

  // Số lượng chờ duyệt / chưa giải quyết để hiển thị badge trên menu.
  const [badges, setBadges] = useState({
    merchants: 0,
    drivers: 0,
    cases: 0,
  });

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    (async () => {
      const [mRes, dRes, cRes] = await Promise.allSettled([
        merchantApi.list({ take: 500, status: "PENDING" } as any),
        driverApi.list({ status: "INACTIVE" } as any),
        resolutionApi.listCases({ take: 500 } as any),
      ]);
      if (!active) return;
      const merchants =
        mRes.status === "fulfilled"
          ? ((mRes.value as any)?.items?.length ??
            (mRes.value as any)?.total ??
            0)
          : 0;
      const drivers =
        dRes.status === "fulfilled"
          ? ((dRes.value as any)?.data?.length ?? 0)
          : 0;
      const cases =
        cRes.status === "fulfilled"
          ? ((cRes.value as any)?.data || []).filter((c: any) =>
              UNRESOLVED_CASE_STATUSES.includes(c.status),
            ).length
          : 0;
      setBadges({ merchants, drivers, cases });
    })();
    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  function badgeFor(href: string): number {
    if (href === "/merchants") return badges.merchants;
    if (href === "/drivers") return badges.drivers;
    if (href === "/cases") return badges.cases;
    return 0;
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex flex-col">
      <header className="bg-[#1a1a2e] text-white sticky top-0 z-40 shadow">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="text-xl font-extrabold">
              MyTh<span className="text-[#ff6b35]">Food</span>
            </span>
            <span className="text-[10px] bg-[#ff6b35] text-white px-2 py-0.5 rounded-full font-semibold">
              ADMIN
            </span>
          </Link>
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-sm text-white/70 hidden sm:block">
                👋 {user.fullName || "Admin"}
              </span>
            )}
            <button
              onClick={() => {
                clearAuth();
                router.push("/login");
              }}
              className="text-xs text-white/70 hover:text-white bg-white/10 px-3 py-1.5 rounded-lg transition"
            >
              Đăng xuất
            </button>
          </div>
        </div>
        <nav className="max-w-[1400px] mx-auto px-2 pt-2 pb-2 flex gap-1 overflow-x-auto">
          {ADMIN_NAV.map((n) => {
            const count = badgeFor(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`relative shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                  isActive(n.href)
                    ? "bg-[#ff6b35] text-white"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                {n.icon} {n.label}
                {count > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 py-6">
        {title && (
          <h1 className="text-xl font-bold text-gray-800 mb-4">{title}</h1>
        )}
        {children}
      </main>

      <footer className="border-t border-gray-200 bg-white mt-6">
        <div className="max-w-[1400px] mx-auto px-4 py-4 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} MyThFood Admin Portal · Hệ thống quản trị
          giao đồ ăn
        </div>
      </footer>
    </div>
  );
}
