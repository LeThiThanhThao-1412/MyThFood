"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  icon: string;
  label: string;
}

interface DesktopSidebarProps {
  appName: string;
  appIcon: string;
  navItems: NavItem[];
  extraContent?: React.ReactNode;
  onLogout?: () => void;
}

export function DesktopSidebar({
  appName,
  appIcon,
  navItems,
  extraContent,
  onLogout,
}: DesktopSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:min-h-screen lg:bg-[#1a1a2e] lg:text-white lg:fixed lg:left-0 lg:top-0 lg:bottom-0 lg:z-40 lg:overflow-y-auto">
      {/* Brand */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-2 text-xl font-extrabold">
          <span className="text-2xl">{appIcon}</span>
          <span>
            MyTh<span className="text-[#ff6b35]">Food</span>
          </span>
        </div>
        <p className="text-xs text-white/40 mt-1">{appName}</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-[#ff6b35] text-white shadow-lg shadow-orange-500/25"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Extra content (user info, etc.) */}
      {extraContent && (
        <div className="p-4 border-t border-white/10">{extraContent}</div>
      )}

      {/* Logout */}
      {onLogout && (
        <div className="p-4 border-t border-white/10">
          <button
            onClick={onLogout}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm text-white/40 hover:text-red-400 hover:bg-white/5 transition"
          >
            <span className="text-lg">🚪</span>
            <span>Đăng xuất</span>
          </button>
        </div>
      )}
    </aside>
  );
}
