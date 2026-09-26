"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  chatApi,
  consumerApi,
  driverApi,
  type ChatConversation,
} from "@mythfood/api-client";
import Drawer from "./Drawer";

interface ChatListDrawerProps {
  open: boolean;
  onClose: () => void;
  myUserId?: string | null;
  onOpenConversation: (
    conversation: ChatConversation,
    counterpart: { name: string; avatar?: string | null },
  ) => void;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return "Vừa xong";
  if (diff < 60) return `${diff} phút trước`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

export default function ChatListDrawer({
  open,
  onClose,
  myUserId,
  onOpenConversation,
}: ChatListDrawerProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [counterparts, setCounterparts] = useState<
    Record<string, { name: string; avatar?: string | null }>
  >({});
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef<Record<string, { name: string; avatar?: string | null }>>(
    {},
  );

  const load = useCallback(async () => {
    if (!myUserId) return;
    setLoading(true);
    try {
      const res: any = await chatApi.listConversations(myUserId);
      const list: ChatConversation[] = Array.isArray(res?.data)
        ? res.data
        : [];
      setConversations(list);

      for (const conv of list) {
        const cached = cacheRef.current[conv.id];
        if (cached) {
          setCounterparts((prev) => ({ ...prev, [conv.id]: cached }));
          continue;
        }
        resolveCounterpart(conv).then((info) => {
          cacheRef.current[conv.id] = info;
          setCounterparts((prev) => ({ ...prev, [conv.id]: info }));
        });
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [myUserId]);

  useEffect(() => {
    if (!open) return;
    load();
    const poll = setInterval(load, 5000);
    return () => clearInterval(poll);
  }, [open, load]);

  async function resolveCounterpart(
    conv: ChatConversation,
  ): Promise<{ name: string; avatar?: string | null }> {
    const iAmConsumer = conv.consumerUserId === myUserId;
    const counterpartId = iAmConsumer
      ? conv.driverUserId
      : conv.consumerUserId;
    if (!counterpartId) return { name: "Đối tác" };

    try {
      if (iAmConsumer) {
        const res: any = await driverApi.getByUserId(counterpartId);
        const p = res?.data || res;
        return { name: p?.fullName || "Tài xế", avatar: p?.avatar || null };
      }
      const res: any = await consumerApi.getByUserId(counterpartId);
      const p = res?.data || res;
      return { name: p?.fullName || "Khách hàng", avatar: p?.avatar || null };
    } catch {
      return { name: iAmConsumer ? "Tài xế" : "Khách hàng" };
    }
  }

  function preview(conv: ChatConversation): string {
    const last = conv.lastMessage;
    if (!last) return "Bắt đầu trò chuyện";
    if (last.type === "IMAGE") return "🖼️ Đã gửi ảnh";
    return last.content;
  }

  return (
    <Drawer open={open} onClose={onClose} title="💬 Tin nhắn">
      {loading && conversations.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
        </div>
      ) : conversations.length === 0 ? (
        <p className="text-center text-gray-400 py-16 px-6">
          Chưa có đoạn chat nào. Khi có đơn hàng đang giao, bạn có thể nhắn tin
          với tài xế/khách hàng.
        </p>
      ) : (
        <div className="divide-y divide-gray-50">
          {conversations.map((conv) => {
            const c = counterparts[conv.id] || { name: "Đối tác" };
            return (
              <button
                key={conv.id}
                onClick={() => onOpenConversation(conv, c)}
                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition"
              >
                {c.avatar ? (
                  <img
                    src={c.avatar}
                    alt=""
                    className="w-11 h-11 rounded-full object-cover bg-gray-100 shrink-0"
                  />
                ) : (
                  <span className="w-11 h-11 rounded-full bg-[#ff6b35] text-white flex items-center justify-center font-bold shrink-0">
                    {c.name?.charAt(0)?.toUpperCase() || "👤"}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm text-gray-800 truncate">
                      {c.name}
                    </p>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {timeAgo(conv.lastMessageAt)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {preview(conv)}
                  </p>
                  <p className="text-[10px] text-gray-300 mt-0.5">
                    Đơn #{conv.orderId?.slice(0, 8)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Drawer>
  );
}
