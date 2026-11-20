import { CaseGpsSignals } from "../domain/assistant.types";

export interface GpsPointInput {
  latitude: number | string | null;
  longitude: number | string | null;
  recordedAt: string | Date | null;
  orderId?: string | null;
}

export interface DeliveryPointInput {
  latitude?: number | string | null;
  longitude?: number | string | null;
}

export interface GpsWindow {
  from?: string | Date | null;
  to?: string | Date | null;
}

const EARTH_RADIUS_M = 6_371_000;
const MAX_PLAUSIBLE_SPEED_KMH = 200;
const STOP_DISTANCE_M = 50;
const STOP_MAX_GAP_MIN = 60;

function toNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toTime(value: unknown): number | null {
  if (!value) return null;
  const time = new Date(value as string | Date).getTime();
  return Number.isFinite(time) ? time : null;
}

/** Khoảng cách (mét) giữa 2 toạ độ theo công thức haversine. */
export function distanceMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const round = (value: number, digits = 1): number =>
  Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * Biến vết GPS thô thành **tín hiệu dẫn xuất** cho AI.
 *
 * Cố ý không trả về toạ độ: AI chỉ cần biết tài xế có tới gần điểm giao hay
 * không, có nhảy vị trí bất thường hay không — không cần (và không nên) thấy
 * vị trí nhà khách.
 */
export function deriveGpsSignals(
  points: GpsPointInput[] | null | undefined,
  delivery?: DeliveryPointInput | null,
  window?: GpsWindow,
): CaseGpsSignals | null {
  if (!Array.isArray(points) || points.length === 0) return null;

  const from = toTime(window?.from);
  const to = toTime(window?.to);
  const parsed = points
    .map((point) => {
      const lat = toNumber(point?.latitude);
      const lng = toNumber(point?.longitude);
      const time = toTime(point?.recordedAt);
      if (lat === null || lng === null || time === null) return null;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
      if (from !== null && time < from) return null;
      if (to !== null && time > to) return null;
      return { lat, lng, time, orderId: point.orderId ?? null };
    })
    .filter(
      (
        p,
      ): p is {
        lat: number;
        lng: number;
        time: number;
        orderId: string | null;
      } => !!p,
    )
    .sort((a, b) => a.time - b.time);

  if (parsed.length === 0) return null;

  const deliveryLat = toNumber(delivery?.latitude);
  const deliveryLng = toNumber(delivery?.longitude);
  const hasDelivery =
    deliveryLat !== null &&
    deliveryLng !== null &&
    Math.abs(deliveryLat) <= 90 &&
    Math.abs(deliveryLng) <= 180;

  let minDistance: number | null = null;
  let closestAt: number | null = null;
  let lastDistance: number | null = null;

  if (hasDelivery) {
    for (const point of parsed) {
      const distance = distanceMeters(
        point.lat,
        point.lng,
        deliveryLat as number,
        deliveryLng as number,
      );
      if (minDistance === null || distance < minDistance) {
        minDistance = distance;
        closestAt = point.time;
      }
      lastDistance = distance;
    }
  }

  const speeds: number[] = [];
  let jumpCount = 0;
  let duplicates = 0;
  let stoppedMinutes = 0;

  for (let i = 1; i < parsed.length; i += 1) {
    const prev = parsed[i - 1]!;
    const current = parsed[i]!;
    const deltaMinutes = (current.time - prev.time) / 60_000;
    if (deltaMinutes <= 0) continue;
    const distance = distanceMeters(
      prev.lat,
      prev.lng,
      current.lat,
      current.lng,
    );
    const speedKmh = distance / 1000 / (deltaMinutes / 60);

    if (speedKmh > MAX_PLAUSIBLE_SPEED_KMH) {
      jumpCount += 1;
    } else {
      speeds.push(speedKmh);
      if (distance < STOP_DISTANCE_M && deltaMinutes <= STOP_MAX_GAP_MIN) {
        stoppedMinutes += deltaMinutes;
      }
    }
    if (
      Math.abs(prev.lat - current.lat) < 0.00001 &&
      Math.abs(prev.lng - current.lng) < 0.00001
    ) {
      duplicates += 1;
    }
  }

  const avgSpeed =
    speeds.length > 0
      ? speeds.reduce((sum, value) => sum + value, 0) / speeds.length
      : 0;

  return {
    points: parsed.length,
    firstPointAt: new Date(parsed[0]!.time).toISOString(),
    lastPointAt: new Date(parsed[parsed.length - 1]!.time).toISOString(),
    minDistanceToDeliveryMeters:
      minDistance === null ? null : round(minDistance, 0),
    closestAt: closestAt === null ? null : new Date(closestAt).toISOString(),
    lastPointDistanceMeters:
      lastDistance === null ? null : round(lastDistance, 0),
    avgSpeedKmh: speeds.length > 0 ? round(avgSpeed, 1) : null,
    maxSpeedKmh: speeds.length > 0 ? round(Math.max(...speeds), 1) : null,
    jumpCount,
    duplicateRatio:
      parsed.length > 1 ? round(duplicates / (parsed.length - 1), 2) : 0,
    stoppedMinutes: round(stoppedMinutes, 0),
  };
}
