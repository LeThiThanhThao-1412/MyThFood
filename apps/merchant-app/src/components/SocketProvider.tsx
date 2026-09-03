"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { io, Socket } from "socket.io-client";
import { merchantApi } from "@mythfood/api-client";
import { useAuthStore } from "@mythfood/frontend-shared";

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3004";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

interface MerchantSocketContextValue {
  socket: Socket | null;
  status: ConnectionStatus;
  merchantId: string;
  ready: boolean;
  newOrderCount: number;
  resetNewOrderCount: () => void;
}

const MerchantSocketContext = createContext<MerchantSocketContextValue>({
  socket: null,
  status: "disconnected",
  merchantId: "",
  ready: false,
  newOrderCount: 0,
  resetNewOrderCount: () => {},
});

export function useMerchantSocket() {
  return useContext(MerchantSocketContext);
}

// ─── Notification helpers ──────────────────────────────────────────────
function playNotificationSound() {
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const beep = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + start;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
    };
    beep(880, 0, 0.18);
    beep(1174.66, 0.2, 0.28);
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch {}
}

function notifyNewOrder(data: any) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    const id = String(data?.id || "").slice(0, 8);
    const total = Number(data?.totalAmount || 0).toLocaleString("vi-VN");
    new Notification("🛵 Có đơn hàng mới!", {
      body: `Đơn #${id} — ${total}₫`,
      tag: `order-${data?.id}`,
    });
  } catch {}
}

// ─── Provider ───────────────────────────────────────────────────────────
export default function SocketProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, user } = useAuthStore();
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [merchantId, setMerchantId] = useState("");
  const [ready, setReady] = useState(false);
  const [newOrderCount, setNewOrderCount] = useState(0);

  // Request browser notification permission once on mount
  useEffect(() => {
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      setStatus("disconnected");
      setMerchantId("");
      setReady(true);
      return;
    }

    setReady(false);
    let cancelled = false;
    let socket: Socket | null = null;

    async function setup() {
      // Resolve merchant id by matching the logged-in user (never trust a
      // stale localStorage value from a previous account/session).
      let mid = "";
      try {
        const res = await merchantApi.list({ take: 200 });
        const m =
          (res.items || []).find((m2: any) => m2.userId === user!.id) || null;
        if (m?.id) {
          mid = m.id;
          localStorage.setItem("merchantId", m.id);
        }
      } catch {
        mid = localStorage.getItem("merchantId") || "";
      }
      if (cancelled) return;
      setMerchantId(mid);
      setReady(true);
      if (!mid) return;

      setStatus("connecting");
      socket = io(`${SOCKET_URL}/orders`, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });
      socketRef.current = socket;
      setSocket(socket);

      socket.on("connect", () => {
        setStatus("connected");
        socket!.emit("join:merchant", { merchantId: mid });
      });
      socket.on("disconnect", () => setStatus("disconnected"));
      socket.io.on("reconnect_attempt", () => setStatus("reconnecting"));

      socket.on("order:new", (data: any) => {
        setNewOrderCount((c) => c + 1);
        playNotificationSound();
        notifyNewOrder(data);
      });
    }

    setup();

    return () => {
      cancelled = true;
      if (socketRef.current) {
        const mid = localStorage.getItem("merchantId") || "";
        socketRef.current.emit("leave:merchant", { merchantId: mid });
        socketRef.current.disconnect();
      }
      socketRef.current = null;
      setSocket(null);
    };
  }, [isAuthenticated, user?.id]);

  const resetNewOrderCount = useCallback(() => setNewOrderCount(0), []);

  return (
    <MerchantSocketContext.Provider
      value={{
        socket,
        status,
        merchantId,
        ready,
        newOrderCount,
        resetNewOrderCount,
      }}
    >
      {children}
    </MerchantSocketContext.Provider>
  );
}
