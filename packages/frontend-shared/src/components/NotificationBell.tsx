"use client";

import { useState } from "react";
import { useNotifications } from "../hooks/use-notifications";

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return "Vừa xong";
  if (diff < 60) return `${diff} phút trước`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

export default function NotificationBell({
  userId,
}: {
  userId?: string | null;
}) {
  const { items, unreadCount, markRead, markAllRead } =
    useNotifications(userId);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative text-xl hover:scale-110 transition-transform"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[10px] font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="font-bold text-gray-800">🔔 Thông báo</p>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-[#ff6b35] font-semibold hover:underline"
              >
                Đánh dấu đã đọc
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                Chưa có thông báo
              </p>
            ) : (
              items.slice(0, 15).map((n: any) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.isRead) markRead(n.id);
                  }}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition ${n.isRead ? "opacity-60" : ""}`}
                >
                  <p className="text-sm font-semibold text-gray-800">
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                      {n.body}
                    </p>
                  )}
                  <p className="text-[10px] text-gray-400 mt-1">
                    {timeAgo(n.createdAt)}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
