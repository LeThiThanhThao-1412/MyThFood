import { io, Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3004";
const CHAT_SOCKET_URL =
  process.env.NEXT_PUBLIC_CHAT_WS_URL || "http://localhost:3015/chat";
/** driver-service (port 3007) — namespace `/tracking`. */
const TRACKING_SOCKET_URL =
  process.env.NEXT_PUBLIC_DRIVER_WS_URL || "http://localhost:3007/tracking";

type EventHandler = (data: unknown) => void;

class SocketClient {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<EventHandler>> = new Map();

  constructor(private readonly url: string) {}

  connect(token?: string) {
    if (this.socket?.connected) return;

    this.socket = io(this.url, {
      auth: token ? { token } : undefined,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    this.socket.on("connect", () => {
      console.log("[Socket] Connected:", this.socket?.id);
    });

    this.socket.on("disconnect", (reason) => {
      console.log("[Socket] Disconnected:", reason);
    });

    this.socket.on("connect_error", (err) => {
      console.error("[Socket] Connection error:", err.message);
    });

    // Re-register all listeners after reconnect
    this.listeners.forEach((handlers, event) => {
      handlers.forEach((handler) => {
        this.socket?.on(event, handler);
      });
    });
  }

  disconnect() {
    this.listeners.clear();
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    this.socket?.on(event, handler);

    return () => {
      this.listeners.get(event)?.delete(handler);
      this.socket?.off(event, handler);
    };
  }

  off(event: string, handler: EventHandler) {
    this.listeners.get(event)?.delete(handler);
    this.socket?.off(event, handler);
  }

  emit(event: string, data: unknown) {
    this.socket?.emit(event, data);
  }

  isConnected(): boolean {
    return this.socket?.connected === true;
  }

  /**
   * Emit kèm ack — dùng cho luồng GPS realtime: server trả `{ ok: true }` sau khi
   * đã lưu điểm, nhờ đó client biết có thể xoá điểm khỏi buffer offline.
   *
   * Trả `false` khi chưa kết nối, timeout hoặc server báo lỗi để client fallback
   * sang HTTP.
   */
  emitWithAck(
    event: string,
    data: unknown,
    timeoutMs = 5000,
  ): Promise<boolean> {
    const socket = this.socket;
    if (!socket?.connected) return Promise.resolve(false);

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(false);
      }, timeoutMs);

      socket.emit(event, data, (ack?: { ok?: boolean }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ack?.ok !== false);
      });
    });
  }
}

export const socketClient = new SocketClient(SOCKET_URL);
export const chatSocketClient = new SocketClient(CHAT_SOCKET_URL);
/**
 * Namespace `/tracking` của driver-service: đẩy GPS lên (driver) và nhận
 * `tracking:update` (app khách / điều phối) theo room `order:<orderId>`.
 */
export const trackingSocketClient = new SocketClient(TRACKING_SOCKET_URL);
