"use client";

import { useCallback, useEffect, useState } from "react";
import { driverApi } from "@mythfood/api-client";
import {
  canAccessApp,
  useAuthStore,
  useLocationStore,
  type GeoFix,
} from "@mythfood/frontend-shared";
import { useDriverLocationStream } from "@/hooks/use-driver-location-stream";

// ============================================================================
// DriverLocationTracker — mount 1 lần ở layout nên chạy trên mọi trang của
// driver-app. Nhiệm vụ:
//   1. Theo dõi trạng thái ONLINE/OFFLINE của tài xế (poll nhẹ mỗi 5 giây).
//   2. Khi ONLINE → mở luồng GPS realtime `useDriverLocationStream`
//      (`watchPosition` + lấy mẫu thích ứng + buffer offline + WS/HTTP batch).
//   3. Đồng bộ toạ độ mới nhất vào `useLocationStore` để bản đồ/UI đi theo.
//
// Tài xế vừa bật ONLINE: `lastSentAt` được reset nên điểm GPS đầu tiên được gửi
// ngay, backend có nhịp tim trước khi auto-offline sweep kịp quét.
// ============================================================================

const STATUS_POLL_MS = 5000;

export default function DriverLocationTracker() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const setLocation = useLocationStore((s) => s.setLocation);
  const [driver, setDriver] = useState<any>(null);

  const userId = user?.id;
  const canTrack =
    isAuthenticated && !!userId && canAccessApp(user?.roles, "DRIVER");

  useEffect(() => {
    if (!canTrack || !userId) {
      setDriver(null);
      return;
    }

    let cancelled = false;
    const refreshDriver = async () => {
      try {
        const res = await driverApi.getByUserId(userId);
        if (cancelled) return;
        setDriver((res as any)?.data ?? res);
      } catch {
        // Chưa có hồ sơ tài xế / lỗi mạng → tick sau thử lại.
      }
    };

    void refreshDriver();
    const timer = setInterval(refreshDriver, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [canTrack, userId]);

  const handleFix = useCallback(
    (fix: GeoFix) => {
      setLocation({
        latitude: fix.latitude,
        longitude: fix.longitude,
        address: `GPS ${fix.latitude.toFixed(5)}, ${fix.longitude.toFixed(5)}`,
        source: "gps",
      });
    },
    [setLocation],
  );

  const isOnline = driver?.onlineStatus === "ONLINE";
  const isDelivering =
    Boolean(driver?.currentOrderId) ||
    (Array.isArray(driver?.currentOrderIds) &&
      driver.currentOrderIds.length > 0);

  useDriverLocationStream({
    driverId: driver?.id ?? null,
    enabled: isOnline,
    isDelivering,
    token,
    onFix: handleFix,
  });

  return null;
}
