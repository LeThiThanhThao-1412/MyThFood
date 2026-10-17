"use client";

import { useEffect, useRef } from "react";
import { driverApi } from "@mythfood/api-client";
import {
  canAccessApp,
  useAuthStore,
  useLocationStore,
} from "@mythfood/frontend-shared";

// ============================================================================
// DriverLocationTracker — tự động ghi vị trí GPS của tài xế mỗi 5 giây khi
// tài xế đang ONLINE. Mount 1 lần duy nhất ở layout nên chạy trên mọi trang
// của driver-app (không phụ thuộc trang dashboard / location).
//
// Mỗi tick:
//   1. Lấy toạ độ hiện tại từ navigator.geolocation.
//   2. Gửi PATCH /drivers/:id/location → backend lưu vào bảng lịch sử
//      vị trí (driver_location_history) + cập nhật currentLat/Lng.
//   3. Đồng bộ vào useLocationStore để bản đồ/UI đi theo thời gian thực.
//
// Tài xế vừa bật ONLINE: gửi vị trí NGAY (không chờ tick kế tiếp) để backend
// luôn có nhịp tim — tránh bị cơ chế auto-offline (quét mỗi 15 giây) chuyển
// sang OFFLINE ngay sau khi vừa bật Online.
// ============================================================================

const TRACK_INTERVAL_MS = 5000; // ghi vị trí mỗi 5 giây
const STATUS_POLL_MS = 5000; // kiểm tra lại trạng thái online mỗi 5 giây

export default function DriverLocationTracker() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const setLocation = useLocationStore((s) => s.setLocation);

  const driverRef = useRef<any>(null);
  const trackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendingRef = useRef(false);
  // Trạng thái ONLINE ở lần đọc gần nhất → phát hiện đúng thời điểm tài xế vừa
  // bật ONLINE để gửi ngay nhịp tim đầu tiên (không chờ tới tick kế tiếp).
  const wasOnlineRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    if (!canAccessApp(user?.roles, "DRIVER")) return;

    let cancelled = false;

    const sendLocation = () => {
      const d = driverRef.current;
      if (!d?.id || d.onlineStatus !== "ONLINE") return;
      if (sendingRef.current) return;
      if (typeof navigator === "undefined" || !navigator.geolocation) return;

      sendingRef.current = true;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          try {
            await driverApi.updateLocation(d.id, { latitude, longitude });
            setLocation({
              latitude,
              longitude,
              address: `GPS ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
              source: "gps",
            });
          } catch {
            // Ghi vị trí thất bại (mất mạng, hết phiên...) → thử lại ở tick sau.
          } finally {
            sendingRef.current = false;
          }
        },
        () => {
          // Thiết bị chưa cấp quyền GPS / không có tín hiệu → thử lại ở tick sau.
          sendingRef.current = false;
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 4000 },
      );
    };

    const refreshDriver = async () => {
      try {
        const res = await driverApi.getByUserId(user.id);
        const d = (res as any)?.data ?? res;
        if (cancelled) return;
        const isOnline = d?.onlineStatus === "ONLINE";
        const justWentOnline = isOnline && !wasOnlineRef.current;
        driverRef.current = d;
        wasOnlineRef.current = isOnline;
        // Vừa bật ONLINE → gửi ngay nhịp tim đầu tiên để backend không chuyển
        // tài xế sang OFFLINE do chưa nhận được vị trí nào (auto-offline sweep).
        if (justWentOnline) sendLocation();
      } catch {
        // Chưa có hồ sơ tài xế / lỗi mạng → bỏ qua, tick sau sẽ thử lại.
      }
    };

    // Nạp hồ sơ tài xế lần đầu rồi bắt đầu vòng lặp ghi vị trí.
    refreshDriver().then(() => {
      if (cancelled) return;
      sendLocation();
      trackTimerRef.current = setInterval(sendLocation, TRACK_INTERVAL_MS);
    });

    // Đồng bộ trạng thái online (bật/tắt) để kịp thời bắt đầu/dừng ghi vị trí.
    statusTimerRef.current = setInterval(refreshDriver, STATUS_POLL_MS);

    return () => {
      cancelled = true;
      if (trackTimerRef.current) clearInterval(trackTimerRef.current);
      if (statusTimerRef.current) clearInterval(statusTimerRef.current);
      sendingRef.current = false;
      wasOnlineRef.current = false;
    };
  }, [isAuthenticated, user?.id, setLocation]);

  return null;
}
