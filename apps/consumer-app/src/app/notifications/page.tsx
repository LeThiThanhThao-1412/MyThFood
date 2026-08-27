"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore, useNotifications } from "@mythfood/frontend-shared";

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return "Vừa xong";
  if (diff < 60) return `${diff} phút trước`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { items, unreadCount, markRead, markAllRead } = useNotifications(
    user?.id,
  );

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-gray-400 hover:text-[#ff6b35] text-lg transition"
          >
            ←
          </Link>
          <h1 className="text-lg font-bold text-[#1a1a2e]">🔔 Thông báo</h1>
          <button
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="text-sm font-semibold text-[#ff6b35] hover:underline disabled:opacity-40"
          >
            Đã đọc tất cả
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 pb-24">
        {items.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-3">🔕</p>
            <p className="text-gray-400">Chưa có thông báo nào</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((n: any) => (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.isRead) markRead(n.id);
                }}
                className={`w-full text-left bg-white rounded-2xl shadow-sm p-4 hover:shadow-md transition ${n.isRead ? "opacity-60" : "border-l-4 border-[#ff6b35]"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-gray-800">{n.title}</p>
                  {!n.isRead && (
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ff6b35] shrink-0 mt-1" />
                  )}
                </div>
                {n.body && (
                  <p className="text-sm text-gray-500 mt-1">{n.body}</p>
                )}
                <p className="text-[11px] text-gray-400 mt-2">
                  {timeAgo(n.createdAt)}
                </p>
              </button>
            ))}
          </div>
        )}
      </main>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        <Link
          href="/dashboard"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">🏠</span>
          <span>Trang chủ</span>
        </Link>
        <Link
          href="/restaurants"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">🔍</span>
          <span>Tìm kiếm</span>
        </Link>
        <Link
          href="/cart"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">🛒</span>
          <span>Giỏ hàng</span>
        </Link>
        <Link
          href="/orders"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">📦</span>
          <span>Đơn hàng</span>
        </Link>
        <Link
          href="/profile"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">👤</span>
          <span>Tài khoản</span>
        </Link>
      </nav>
    </div>
  );
}
