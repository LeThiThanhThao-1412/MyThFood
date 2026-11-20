"use client";

import { useCallback, useEffect, useState } from "react";
import { notificationApi } from "@mythfood/api-client";

export function useNotifications(userId?: string | null) {
  const [items, setItems] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res: any = await notificationApi.getByUser(userId, { take: 50 });
      setItems(Array.isArray(res?.data) ? res.data : []);
      setUnreadCount(Number(res?.unreadCount ?? 0));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const markRead = useCallback(async (id: string) => {
    try {
      await notificationApi.markRead(id);
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      /* ignore */
    }
  }, []);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    try {
      await notificationApi.markAllRead(userId);
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      /* ignore */
    }
  }, [userId]);

  return { items, unreadCount, loading, refresh, markRead, markAllRead };
}
