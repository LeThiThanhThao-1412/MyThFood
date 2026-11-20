"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  driverApi,
  trackingSocketClient,
  type DriverLocationBatchPoint,
} from "@mythfood/api-client";
import {
  DRIVER_SAMPLING_PROFILES,
  isValidFix,
  shouldSendFix,
  type GeoFix,
  type GeoFixState,
} from "@mythfood/frontend-shared";

// ============================================================================
// useDriverLocationStream — luồng GPS realtime cho app tài xế (Phase 0 + 1).
//
// Thay vì `getCurrentPosition` mỗi 5 giây:
//   1. `watchPosition` liên tục → vị trí mượt, không lỡ điểm khi di chuyển nhanh.
//   2. Lấy mẫu thích ứng: đang giao hàng dày hơn (4s/15m), rảnh thưa hơn
//      (10s/50m) + nhịp tim tối đa 15s để không bị auto-offline.
//   3. Lọc điểm có sai số lớn (GPS nhảy trong toà nhà).
//   4. Gửi qua WebSocket `/tracking` (ack) → fallback HTTP batch khi WS lỗi.
//   5. Buffer offline: giữ tối đa 200 điểm, gửi bù khi có mạng (bỏ điểm > 5 phút).
// ============================================================================

/** Nhịp thử gửi lại buffer khi mất mạng / WS chưa kết nối. */
const FLUSH_RETRY_MS = 10_000;
/** Số điểm tối đa giữ trong buffer offline. */
const MAX_BUFFERED_POINTS = 200;
/** Số điểm tối đa mỗi request HTTP batch (backend giới hạn 100). */
const MAX_POINTS_PER_REQUEST = 100;
/** Chờ ack từ WS bao lâu thì coi như thất bại và fallback HTTP. */
const SOCKET_ACK_TIMEOUT_MS = 4_000;
/** Điểm cũ hơn mốc này khi gửi bù sẽ bị bỏ (tránh lịch sử sai lệch). */
const MAX_POINT_AGE_MS = 5 * 60_000;

export type DriverWatchStatus = "idle" | "watching" | "denied" | "unsupported";

interface PendingPoint extends DriverLocationBatchPoint {
  recordedAt: string;
}

export interface UseDriverLocationStreamOptions {
  /** Id hồ sơ tài xế (không phải userId). */
  driverId: string | null;
  /** Chỉ stream khi tài xế đang ONLINE. */
  enabled: boolean;
  /** Đang có đơn → lấy mẫu dày hơn. */
  isDelivering?: boolean;
  /** JWT để bắt tay WebSocket. */
  token?: string | null;
  /** Nhận mọi điểm GPS hợp lệ (kể cả điểm không gửi lên server) để vẽ UI. */
  onFix?: (fix: GeoFix) => void;
}

export function useDriverLocationStream({
  driverId,
  enabled,
  isDelivering = false,
  token = null,
  onFix,
}: UseDriverLocationStreamOptions): { watchStatus: DriverWatchStatus } {
  const [watchStatus, setWatchStatus] = useState<DriverWatchStatus>("idle");

  const onFixRef = useRef(onFix);
  const driverIdRef = useRef<string | null>(driverId);
  const enabledRef = useRef(enabled);
  const profileRef = useRef(
    isDelivering
      ? DRIVER_SAMPLING_PROFILES.delivering
      : DRIVER_SAMPLING_PROFILES.idle,
  );
  const activeDriverRef = useRef<string | null>(null);

  const queueRef = useRef<PendingPoint[]>([]);
  const lastSentRef = useRef<GeoFixState>({
    lastSentAt: null,
    lastSentFix: null,
  });
  const flushingRef = useRef(false);
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  /** Fix hợp lệ gần nhất — dùng cho nhịp tim khi thiết bị đứng yên. */
  const lastFixRef = useRef<GeoFix | null>(null);

  useEffect(() => {
    onFixRef.current = onFix;
  }, [onFix]);

  useEffect(() => {
    driverIdRef.current = driverId;
  }, [driverId]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    profileRef.current = isDelivering
      ? DRIVER_SAMPLING_PROFILES.delivering
      : DRIVER_SAMPLING_PROFILES.idle;
  }, [isDelivering]);

  /**
   * Gửi buffer: ưu tiên WS (từng điểm để có ack + fan-out realtime ngay), rơi
   * về HTTP batch khi WS chưa kết nối / ack thất bại. Điểm chỉ bị xoá khỏi
   * buffer khi server đã xác nhận (ack hoặc HTTP 2xx).
   */
  const flush = useCallback(async () => {
    const id = driverIdRef.current;
    if (!id || !enabledRef.current) return;
    if (flushingRef.current) return;
    if (queueRef.current.length === 0) return;

    flushingRef.current = true;
    try {
      // Bỏ điểm quá cũ (buffer tồn từ phiên trước / mất mạng lâu).
      const cutoff = Date.now() - MAX_POINT_AGE_MS;
      queueRef.current = queueRef.current.filter(
        (p) => new Date(p.recordedAt).getTime() >= cutoff,
      );

      while (queueRef.current.length > 0) {
        const chunk = queueRef.current.slice(0, MAX_POINTS_PER_REQUEST);
        let sent = 0;

        if (trackingSocketClient.isConnected()) {
          for (const point of chunk) {
            const ok = await trackingSocketClient.emitWithAck(
              "tracking:push",
              {
                latitude: point.latitude,
                longitude: point.longitude,
                recordedAt: point.recordedAt,
              },
              SOCKET_ACK_TIMEOUT_MS,
            );
            if (!ok) break;
            sent += 1;
          }
        }

        if (sent < chunk.length) {
          const rest = chunk.slice(sent);
          try {
            await driverApi.updateLocationBatch(
              id,
              rest.map((p) => ({
                latitude: p.latitude,
                longitude: p.longitude,
                recordedAt: p.recordedAt,
                accuracy: p.accuracy,
              })),
            );
            sent = chunk.length;
          } catch {
            // Mất mạng / hết phiên → giữ phần chưa gửi, thử lại sau.
            if (sent > 0) queueRef.current.splice(0, sent);
            break;
          }
        }

        queueRef.current.splice(0, sent);
        const last = chunk[chunk.length - 1];
        lastSentRef.current = {
          lastSentAt: Date.now(),
          lastSentFix: {
            latitude: last.latitude,
            longitude: last.longitude,
          },
        };
      }
    } finally {
      flushingRef.current = false;
    }
  }, []);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // Bật/tắt stream theo trạng thái ONLINE của tài xế.
  useEffect(() => {
    if (!enabled || !driverId) {
      setWatchStatus("idle");
      // Lần online kế tiếp phải gửi nhịp tim đầu tiên ngay lập tức.
      lastSentRef.current = { lastSentAt: null, lastSentFix: null };
      lastFixRef.current = null;
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setWatchStatus("unsupported");
      return;
    }

    // Đổi tài xế (đăng nhập tài khoản khác) → không gửi bù điểm của người cũ.
    if (activeDriverRef.current !== driverId) {
      queueRef.current = [];
      lastSentRef.current = { lastSentAt: null, lastSentFix: null };
      lastFixRef.current = null;
      activeDriverRef.current = driverId;
    }

    trackingSocketClient.connect(token ?? undefined);

    const enqueueFix = (fix: GeoFix, recordedAtMs?: number) => {
      const recordedAt = new Date(recordedAtMs ?? fix.timestamp ?? Date.now());
      queueRef.current.push({
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy: fix.accuracy ?? undefined,
        recordedAt: recordedAt.toISOString(),
      });
      if (queueRef.current.length > MAX_BUFFERED_POINTS) {
        queueRef.current.splice(
          0,
          queueRef.current.length - MAX_BUFFERED_POINTS,
        );
      }

      // Đánh dấu mốc lấy mẫu ngay (kể cả khi gửi lỗi) để sampling không dồn
      // điểm khi flush chậm; điểm đã nằm trong buffer nên không mất dữ liệu.
      lastSentRef.current = {
        lastSentAt: Date.now(),
        lastSentFix: {
          latitude: fix.latitude,
          longitude: fix.longitude,
        },
      };

      void flushRef.current();
    };

    const handlePosition = (pos: GeolocationPosition) => {
      const fix: GeoFix = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      };
      if (!isValidFix(fix)) return;

      lastFixRef.current = fix;
      onFixRef.current?.(fix);

      if (!shouldSendFix(lastSentRef.current, fix, profileRef.current)) return;
      enqueueFix(fix);
    };

    const handleError = (err: GeolocationPositionError) => {
      // code 1 = PERMISSION_DENIED
      setWatchStatus(err.code === 1 ? "denied" : "watching");
    };

    const watchId = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 3_000 },
    );
    setWatchStatus("watching");

    // `watchPosition` có thể KHÔNG phát sự kiện khi thiết bị đứng yên → chủ
    // động gửi nhịp tim từ fix cuối, nếu không backend sẽ auto-offline sau 20s.
    const heartbeat = setInterval(() => {
      const last = lastFixRef.current;
      if (!last) return;
      if (!shouldSendFix(lastSentRef.current, last, profileRef.current)) return;
      enqueueFix(last, Date.now());
    }, 2_000);

    // Tab bị throttle khi chạy nền → khi quay lại phải lấy vị trí mới ngay.
    const catchUp = () => {
      if (!enabledRef.current) return;
      navigator.geolocation.getCurrentPosition(
        handlePosition,
        () => undefined,
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
      );
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        catchUp();
        void flushRef.current();
      }
    };

    const handleOnline = () => {
      catchUp();
      void flushRef.current();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
      // Gửi nốt phần còn tồn (best-effort) trước khi dừng stream.
      void flushRef.current();
      setWatchStatus("idle");
    };
  }, [enabled, driverId, token]);

  // Thử gửi lại buffer định kỳ khi mạng chập chờn.
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      void flushRef.current();
    }, FLUSH_RETRY_MS);
    return () => clearInterval(timer);
  }, [enabled]);

  return { watchStatus };
}
