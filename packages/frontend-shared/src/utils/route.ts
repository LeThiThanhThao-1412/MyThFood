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

/** Đường thẳng nối các điểm — fallback khi OSRM lỗi hoặc thiếu toạ độ. */
function straightRoute(points: RoutePoint[]): RouteInfo {
  const routePoints: [number, number][] = points.map((point) => [
    point.latitude,
    point.longitude,
  ]);
  let distanceKm = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    distanceKm += haversineKm(
      previous.latitude,
      previous.longitude,
      current.latitude,
      current.longitude,
    );
  }
  return {
    points: routePoints,
    distanceKm,
    durationMin: Math.max(1, Math.round((distanceKm / AVG_SPEED_KMH) * 60)),
    source: "straight",
  };
}

/**
 * Lấy tuyến đường thực tế đi qua nhiều điểm theo đúng thứ tự truyền vào.
 * Dùng cho lộ trình gộp đơn: 1 request OSRM cho toàn bộ chuỗi điểm.
 * Lỗi mạng → nối thẳng các điểm.
 */
export async function fetchRouteThrough(
  points: RoutePoint[],
): Promise<RouteInfo> {
  const validPoints = points.filter(
    (point) =>
      Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
  );
  if (validPoints.length < 2) {
    return {
      points: validPoints.map((point) => [point.latitude, point.longitude]),
      distanceKm: 0,
      durationMin: 0,
      source: "straight",
    };
  }

  const straight = straightRoute(validPoints);

  try {
    const coordinates = validPoints
      .map((point) => `${point.longitude},${point.latitude}`)
      .join(";");
    const url = `${OSRM_BASE}/${coordinates}?overview=full&geometries=geojson`;
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

/** Lấy tuyến đường thực tế giữa 2 điểm; lỗi mạng → đường thẳng nối 2 điểm. */
export async function fetchRoute(
  from: RoutePoint,
  to: RoutePoint,
): Promise<RouteInfo> {
  return fetchRouteThrough([from, to]);
}
