"use client";
import ConsumerShell from "@/components/ConsumerShell";

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
    <ConsumerShell title="🔔 Thông báo" backHref="/dashboard">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-400">
          {unreadCount > 0 ? `${unreadCount} chưa đọc` : "Đã đọc hết"}
        </p>
        <button
          onClick={markAllRead}
          disabled={unreadCount === 0}
          className="text-sm font-semibold text-[#ff6b35] hover:underline disabled:opacity-40"
        >
          Đã đọc tất cả
        </button>
      </div>
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
              {n.body && <p className="text-sm text-gray-500 mt-1">{n.body}</p>}
              <p className="text-[11px] text-gray-400 mt-2">
                {timeAgo(n.createdAt)}
              </p>
            </button>
          ))}
        </div>
      )}
    </ConsumerShell>
  );
}
