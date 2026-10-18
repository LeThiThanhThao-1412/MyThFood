/**
 * Bộ xếp lộ trình gộp đơn SAVER (Phase 2).
 *
 * Thuật toán nearest-neighbor có ràng buộc "lấy hàng trước khi giao":
 * - Mỗi đơn gồm 2 điểm: PICKUP (quán) và DROPOFF (khách).
 * - Từ vị trí hiện tại của tài xế, luôn chọn điểm gần nhất trong các điểm
 *   còn hợp lệ (pickup chưa lấy, hoặc dropoff của đơn đã lấy).
 * - Ưu tiên (priorityRank) chỉ dùng để phá thế cân bằng khoảng cách.
 *
 * Đây là heuristic đủ tốt cho 2–3 đơn/lộ trình, không gọi dịch vụ ngoài.
 */

export interface RouteStopInput {
  orderId: string;
  merchantLatitude: number;
  merchantLongitude: number;
  deliveryLatitude: number;
  deliveryLongitude: number;
  status: string;
  priorityRank?: number;
}

export interface PlannedStop {
  orderId: string;
  /** Thứ tự 1-based trong lộ trình. */
  sequence: number;
  merchantLatitude: number;
  merchantLongitude: number;
  deliveryLatitude: number;
  deliveryLongitude: number;
  status: string;
  pickupDone: boolean;
  deliveryDone: boolean;
}

/** Các trạng thái cho biết tài xế đã lấy hàng tại quán. */
const PICKED_UP_STATUSES = new Set(["PICKED_UP", "DELIVERING", "DELIVERED"]);

const DELIVERED_STATUS = "DELIVERED";

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Xếp thứ tự điểm dừng cho một lộ trình gộp đơn.
 * Trả về danh sách đã sắp theo `sequence` (1-based).
 */
export function planRoute(
  driverLatitude: number,
  driverLongitude: number,
  stops: RouteStopInput[],
): PlannedStop[] {
  const state = stops.map((stop) => ({
    stop,
    pickupDone: PICKED_UP_STATUSES.has(stop.status),
    deliveryDone: stop.status === DELIVERED_STATUS,
    pickupVisited: PICKED_UP_STATUSES.has(stop.status),
    sequence: 0,
  }));

  let currentLat = driverLatitude;
  let currentLng = driverLongitude;
  let sequence = 0;

  while (true) {
    type Candidate = {
      item: (typeof state)[number];
      type: "PICKUP" | "DROPOFF";
      lat: number;
      lng: number;
      distance: number;
    };

    const candidates: Candidate[] = [];
    for (const item of state) {
      const { stop } = item;
      if (!item.pickupVisited) {
        candidates.push({
          item,
          type: "PICKUP",
          lat: stop.merchantLatitude,
          lng: stop.merchantLongitude,
          distance: haversineKm(
            currentLat,
            currentLng,
            stop.merchantLatitude,
            stop.merchantLongitude,
          ),
        });
      } else if (!item.deliveryDone) {
        candidates.push({
          item,
          type: "DROPOFF",
          lat: stop.deliveryLatitude,
          lng: stop.deliveryLongitude,
          distance: haversineKm(
            currentLat,
            currentLng,
            stop.deliveryLatitude,
            stop.deliveryLongitude,
          ),
        });
      }
    }

    if (candidates.length === 0) break;

    candidates.sort((a, b) => {
      if (Math.abs(a.distance - b.distance) > 0.3) {
        return a.distance - b.distance;
      }
      const rankDiff =
        (b.item.stop.priorityRank ?? 1) - (a.item.stop.priorityRank ?? 1);
      if (rankDiff !== 0) return rankDiff;
      return a.distance - b.distance;
    });

    const chosen = candidates[0]!;
    if (chosen.type === "PICKUP") {
      // Chỉ đánh dấu đã đi qua khi lập kế hoạch; `pickupDone` giữ nguyên
      // trạng thái thực tế để UI hiển thị đúng.
      chosen.item.pickupVisited = true;
    } else {
      chosen.item.deliveryDone = true;
    }

    if (chosen.item.sequence === 0) {
      sequence += 1;
      chosen.item.sequence = sequence;
    }

    currentLat = chosen.lat;
    currentLng = chosen.lng;
  }

  return state
    .map((item) => ({
      orderId: item.stop.orderId,
      sequence: item.sequence || sequence + 1,
      merchantLatitude: item.stop.merchantLatitude,
      merchantLongitude: item.stop.merchantLongitude,
      deliveryLatitude: item.stop.deliveryLatitude,
      deliveryLongitude: item.stop.deliveryLongitude,
      status: item.stop.status,
      pickupDone: item.pickupDone,
      deliveryDone: item.deliveryDone,
    }))
    .sort((a, b) => a.sequence - b.sequence);
}

/**
 * Kiểm tra đơn mới có phù hợp để gộp vào lộ trình hiện tại không.
 * Điều kiện: điểm giao mới nằm trong bán kính `maxDeviationKm` quanh một
 * điểm giao đang có (hoặc quanh vị trí tài xế nếu chưa có đơn nào).
 */
export function isRouteCompatible(
  driverLatitude: number,
  driverLongitude: number,
  activeStops: RouteStopInput[],
  candidate: { deliveryLatitude: number; deliveryLongitude: number },
  maxDeviationKm = 3,
): boolean {
  const anchors = activeStops.map((stop) => ({
    lat: stop.deliveryLatitude,
    lng: stop.deliveryLongitude,
  }));
  if (anchors.length === 0) {
    anchors.push({ lat: driverLatitude, lng: driverLongitude });
  }

  return anchors.some(
    (anchor) =>
      haversineKm(
        anchor.lat,
        anchor.lng,
        candidate.deliveryLatitude,
        candidate.deliveryLongitude,
      ) <= maxDeviationKm,
  );
}
