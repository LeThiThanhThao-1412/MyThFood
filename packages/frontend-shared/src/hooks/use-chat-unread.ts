"use client";

import { useEffect, useState } from "react";
import { chatApi } from "@mythfood/api-client";

const POLL_MS = 3000;

function readKey(userId: string, conversationId: string) {
  return `mythfood:chat:lastRead:${userId}:${conversationId}`;
}

function getLastRead(userId: string, conversationId: string): number {
  try {
    if (typeof window === "undefined") return 0;
    const raw = window.localStorage.getItem(readKey(userId, conversationId));
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function setLastRead(userId: string, conversationId: string, ts: number) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(readKey(userId, conversationId), String(ts));
  } catch {
    /* ignore */
  }
}

/**
 * Đếm tin nhắn chưa đọc của hội thoại hiện tại (tin từ người kia gửi sau
 * mốc "đã đọc" gần nhất, được lưu ở localStorage theo từng cặp user + cuộc trò chuyện).
 * Khi `active` (đang mở khung chat) → tự đánh dấu đã đọc và badge về 0.
 */
export function useChatUnread(
  conversationId: string | null,
  myUserId?: string | null,
  active = false,
) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!conversationId || !myUserId) {
      setUnreadCount(0);
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const res: any = await chatApi.getMessages(conversationId);
        const list: any[] = Array.isArray(res?.data) ? res.data : [];
        const lastRead = getLastRead(myUserId, conversationId);

        // Đang mở chat → đánh dấu đã đọc tới tin mới nhất.
        if (active && list.length > 0) {
          const latest = list.reduce((max: number, m: any) => {
            const t = new Date(m.createdAt).getTime();
            return Number.isFinite(t) && t > max ? t : max;
          }, 0);
          if (latest > 0) {
            setLastRead(myUserId, conversationId, latest);
            if (!cancelled) setUnreadCount(0);
            return;
          }
        }

        const unread = list.filter((m: any) => {
          if (m.senderId === myUserId) return false;
          const t = new Date(m.createdAt).getTime();
          return Number.isFinite(t) && t > lastRead;
        }).length;

        if (!cancelled) setUnreadCount(unread);
      } catch {
        /* ignore */
      }
    };

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [conversationId, myUserId, active]);

  return unreadCount;
}
