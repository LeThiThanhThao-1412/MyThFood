// ============================================================================
// Dẫn đường dùng chung (OSRM public API, fallback đường chim bay).
// Cả driver-app lẫn consumer-app đều dùng hàm này để vẽ tuyến thực tế giống nhau.
// ============================================================================

import { haversineKm } from "./distance";

export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface RouteInfo {
  /** Danh sách điểm `[lat, lng]` để vẽ polyline trên bản đồ. */
  points: [number, number][];
  distanceKm: number;
  durationMin: number;
  source: "osrm" | "straight";
}

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const AVG_SPEED_KMH = 25;

function toNum(v: unknown, fallback = 0): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const parsed = parseFloat(v);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

/** Lấy tuyến đường thực tế giữa 2 điểm; lỗi mạng → đường thẳng nối 2 điểm. */
export async function fetchRoute(
  from: RoutePoint,
  to: RoutePoint,
): Promise<RouteInfo> {
  const distanceKm = haversineKm(
    from.latitude,
    from.longitude,
    to.latitude,
    to.longitude,
  );
  const straight: RouteInfo = {
    points: [
      [from.latitude, from.longitude],
      [to.latitude, to.longitude],
    ],
    distanceKm,
    durationMin: Math.max(1, Math.round((distanceKm / AVG_SPEED_KMH) * 60)),
    source: "straight",
  };

  try {
    const url =
      `${OSRM_BASE}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
      `?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return straight;
    const data: any = await res.json();
    const route = data?.routes?.[0];
    const coords: [number, number][] = route?.geometry?.coordinates ?? [];
    if (!coords.length) return straight;
    return {
      points: coords.map(([lng, lat]) => [lat, lng] as [number, number]),
      distanceKm: toNum(route.distance) / 1000,
      durationMin: Math.max(1, Math.round(toNum(route.duration) / 60)),
      source: "osrm",
    };
  } catch {
    return straight;
  }
}
