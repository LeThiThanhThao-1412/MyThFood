"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { chatApi, uploadApi } from "@mythfood/api-client";
import Drawer from "./Drawer";

interface ChatDrawerProps {
  open: boolean;
  onClose: () => void;
  conversationId: string | null;
  myUserId?: string | null;
  counterpartName?: string;
  counterpartAvatar?: string | null;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatDrawer({
  open,
  onClose,
  conversationId,
  myUserId,
  counterpartName,
  counterpartAvatar,
}: ChatDrawerProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!conversationId) return;
    try {
      const res: any = await chatApi.getMessages(conversationId);
      setMessages(Array.isArray(res?.data) ? res.data : []);
    } catch {
      /* ignore */
    }
  }, [conversationId]);

  useEffect(() => {
    if (!open || !conversationId) return;
    load();
    const poll = setInterval(load, 3000);
    return () => clearInterval(poll);
  }, [open, conversationId, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend() {
    const text = input.trim();
    if (!text || !conversationId || sending) return;
    setSending(true);
    setError("");
    try {
      await chatApi.sendMessage(conversationId, { type: "TEXT", content: text });
      setInput("");
      await load();
    } catch (err: any) {
      setError(err?.message || "Gửi tin nhắn thất bại");
    } finally {
      setSending(false);
    }
  }

  async function handleImage(e: any) {
    const files = Array.from(e.target.files || []) as File[];
    if (!files.length || !conversationId) return;
    setUploading(true);
    setError("");
    try {
      for (const file of files) {
        const res: any = await uploadApi.uploadImage(file, "chat");
        const url = res?.data?.url || res?.url;
        if (url) {
          await chatApi.sendMessage(conversationId, {
            type: "IMAGE",
            content: url,
          });
        }
      }
      await load();
    } catch (err: any) {
      setError(err?.message || "Tải ảnh thất bại");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title={counterpartName || "Trò chuyện"}>
      <div className="flex flex-col h-full">
        {/* Header info */}
        <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2.5 shrink-0">
          {counterpartAvatar ? (
            <img
              src={counterpartAvatar}
              alt=""
              className="w-8 h-8 rounded-full object-cover bg-gray-100"
            />
          ) : (
            <span className="w-8 h-8 rounded-full bg-[#ff6b35] text-white flex items-center justify-center text-sm font-bold">
              {counterpartName?.charAt(0)?.toUpperCase() || "👤"}
            </span>
          )}
          <span className="text-sm text-gray-500 truncate">
            Chat với {counterpartName || "đối tác"}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50">
          {messages.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-10">
              Chưa có tin nhắn. Bắt đầu trò chuyện nhé!
            </p>
          )}
          {messages.map((m: any) => {
            const mine = m.senderId === myUserId;
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                    mine
                      ? "bg-[#ff6b35] text-white rounded-br-sm"
                      : "bg-white text-gray-800 rounded-bl-sm border border-gray-100"
                  }`}
                >
                  {m.type === "IMAGE" ? (
                    <a href={m.content} target="_blank" rel="noreferrer">
                      <img
                        src={m.content}
                        alt="ảnh"
                        className="rounded-lg max-h-52 w-auto object-cover"
                      />
                    </a>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  )}
                  <p
                    className={`text-[10px] mt-1 ${
                      mine ? "text-white/70" : "text-gray-400"
                    }`}
                  >
                    {formatTime(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="border-t border-gray-100 px-3 py-2 shrink-0">
          {error && (
            <p className="text-xs text-red-600 mb-1 px-1">❌ {error}</p>
          )}
          <div className="flex items-center gap-2">
            <label className="text-xl cursor-pointer shrink-0" title="Gửi ảnh">
              {uploading ? "⏳" : "🖼️"}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImage}
                disabled={uploading}
              />
            </label>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Nhập tin nhắn..."
              className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm outline-none"
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="bg-[#ff6b35] text-white w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-50 shrink-0"
              title="Gửi"
            >
              ➤
            </button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
