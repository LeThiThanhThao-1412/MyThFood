/**
 * Bộ xếp lộ trình gộp đơn SAVER (Phase 2).
 *
 * Mục tiêu: tối ưu TOÀN BỘ lộ trình, không ưu tiên thứ tự tài xế nhận đơn.
 * - Mỗi đơn gồm 2 điểm: PICKUP (quán) và DROPOFF (khách).
 * - Ràng buộc duy nhất: PICKUP của một đơn phải đứng trước DROPOFF của
 *   chính đơn đó.
 * - Các điểm còn lại được xếp theo tổng quãng đường ngắn nhất (Haversine),
 *   nên lộ trình có thể đan xen: lấy B1 trên đường tới A1, giao A2 trên
 *   đường tới C1, v.v.
 * - Với lô ≤ 14 node, dùng quy hoạch động chính xác; vượt ngưỡng thì
 *   fallback greedy để tránh bùng nổ bộ nhớ.
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

export interface RouteCandidateInput {
  orderId?: string;
  merchantLatitude?: number;
  merchantLongitude?: number;
  deliveryLatitude: number;
  deliveryLongitude: number;
  status?: string;
}

export interface RouteCompatibilityOptions {
  /** Bán kính tối đa từ điểm giao mới tới một điểm giao hiện có. */
  maxDropoffDeviationKm?: number;
  /** Bán kính tối đa từ quán mới tới một quán hiện có (hoặc tài xế). */
  maxPickupDeviationKm?: number;
  /** Tổng quãng đường được phép tăng thêm khi gộp đơn mới. */
  maxDetourKm?: number;
}

export interface PlannedStop {
  orderId: string;
  /** Thứ hạng 1-based của đơn trong lộ trình (theo lần ghé đầu tiên). */
  sequence: number;
  merchantLatitude: number;
  merchantLongitude: number;
  deliveryLatitude: number;
  deliveryLongitude: number;
  status: string;
  pickupDone: boolean;
  deliveryDone: boolean;
  /** Thứ tự chặng lấy hàng; null nếu đã lấy xong hoặc đơn đã giao. */
  pickupSequence: number | null;
  /** Thứ tự chặng giao hàng; null nếu đơn đã giao. */
  dropoffSequence: number | null;
}

/** Một chặng cụ thể trên lộ trình (lấy món hoặc giao hàng). */
export interface PlannedLeg {
  orderId: string;
  type: "PICKUP" | "DROPOFF";
  /** Thứ tự 1-based của chặng trong toàn bộ lộ trình. */
  sequence: number;
  latitude: number;
  longitude: number;
  status: string;
}

export interface PlannedRoute {
  stops: PlannedStop[];
  legs: PlannedLeg[];
  /** Tổng quãng đường ước tính (Haversine) từ vị trí tài xế qua các chặng. */
  totalDistanceKm: number;
}

/** Các trạng thái cho biết tài xế đã lấy hàng tại quán. */
const PICKED_UP_STATUSES = new Set(["PICKED_UP", "DELIVERING", "DELIVERED"]);

const DELIVERED_STATUS = "DELIVERED";

/**
 * Số node tối đa để chạy quy hoạch động chính xác.
 * 3 đơn = 6 node; 14 node vẫn đủ nhanh cho một request đồng bộ.
 * Vượt ngưỡng này sẽ dùng greedy để tránh bùng nổ bộ nhớ.
 */
const MAX_OPTIMAL_NODES = 14;

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

interface RouteNode {
  orderId: string;
  type: "PICKUP" | "DROPOFF";
  latitude: number;
  longitude: number;
  status: string;
  /** Bitmask các node bắt buộc phải đi qua trước node này. */
  prerequisiteMask: number;
}

function buildRouteNodes(stops: RouteStopInput[]): {
  nodes: RouteNode[];
  pickupNodeByOrder: Map<string, number>;
  dropoffNodeByOrder: Map<string, number>;
} {
  const nodes: RouteNode[] = [];
  const pickupNodeByOrder = new Map<string, number>();
  const dropoffNodeByOrder = new Map<string, number>();

  // Tạo node PICKUP trước để biết bit của từng đơn.
  for (const stop of stops) {
    if (PICKED_UP_STATUSES.has(stop.status)) continue;
    const index = nodes.length;
    pickupNodeByOrder.set(stop.orderId, index);
    nodes.push({
      orderId: stop.orderId,
      type: "PICKUP",
      latitude: stop.merchantLatitude,
      longitude: stop.merchantLongitude,
      status: stop.status,
      prerequisiteMask: 0,
    });
  }

  for (const stop of stops) {
    if (stop.status === DELIVERED_STATUS) continue;
    const pickupIndex = pickupNodeByOrder.get(stop.orderId);
    const index = nodes.length;
    dropoffNodeByOrder.set(stop.orderId, index);
    nodes.push({
      orderId: stop.orderId,
      type: "DROPOFF",
      latitude: stop.deliveryLatitude,
      longitude: stop.deliveryLongitude,
      status: stop.status,
      // Chỉ bắt buộc lấy món của chính đơn này trước khi giao.
      // Đơn đã lấy món rồi thì không cần chờ pickup nữa.
      prerequisiteMask: pickupIndex == null ? 0 : 1 << pickupIndex,
    });
  }

  return { nodes, pickupNodeByOrder, dropoffNodeByOrder };
}

/** Fallback cho lô quá lớn: chọn node hợp lệ gần nhất tại mỗi bước. */
function greedyNodeOrder(
  driverLatitude: number,
  driverLongitude: number,
  nodes: RouteNode[],
): number[] {
  const remaining = new Set<number>(nodes.map((_, index) => index));
  const path: number[] = [];
  let latitude = driverLatitude;
  let longitude = driverLongitude;
  let visitedMask = 0;

  while (path.length < nodes.length) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const index of remaining) {
      const node = nodes[index]!;
      if ((node.prerequisiteMask & visitedMask) !== node.prerequisiteMask) {
        continue;
      }
      const distance = haversineKm(
        latitude,
        longitude,
        node.latitude,
        node.longitude,
      );
      if (distance < bestDistance - 1e-9) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    if (bestIndex < 0) {
      // Dữ liệu lỗi (ràng buộc vòng tròn) → giữ đủ node thay vì mất stop.
      for (const index of remaining) path.push(index);
      break;
    }

    const chosen = nodes[bestIndex]!;
    path.push(bestIndex);
    remaining.delete(bestIndex);
    visitedMask |= 1 << bestIndex;
    latitude = chosen.latitude;
    longitude = chosen.longitude;
  }

  return path;
}

/**
 * Tìm thứ tự đi qua các node sao cho tổng quãng đường nhỏ nhất, đồng thời
 * tôn trọng ràng buộc pickup-before-dropoff. Quy hoạch động trên bitmask.
 */
function optimalNodeOrder(
  driverLatitude: number,
  driverLongitude: number,
  nodes: RouteNode[],
): number[] {
  const count = nodes.length;
  if (count === 0) return [];
  if (count > MAX_OPTIMAL_NODES) {
    return greedyNodeOrder(driverLatitude, driverLongitude, nodes);
  }

  const size = 1 << count;
  const cost = Array.from({ length: size }, () =>
    new Float64Array(count).fill(Number.POSITIVE_INFINITY),
  );
  const previous = Array.from({ length: size }, () =>
    new Int16Array(count).fill(-1),
  );

  for (let index = 0; index < count; index += 1) {
    const node = nodes[index]!;
    if (node.prerequisiteMask !== 0) continue;
    cost[1 << index]![index] = haversineKm(
      driverLatitude,
      driverLongitude,
      node.latitude,
      node.longitude,
    );
  }

  for (let mask = 1; mask < size; mask += 1) {
    const row = cost[mask]!;
    for (let last = 0; last < count; last += 1) {
      const currentCost = row[last]!;
      if (!Number.isFinite(currentCost)) continue;

      const lastNode = nodes[last]!;
      for (let next = 0; next < count; next += 1) {
        const bit = 1 << next;
        if ((mask & bit) !== 0) continue;

        const nextNode = nodes[next]!;
        if ((nextNode.prerequisiteMask & mask) !== nextNode.prerequisiteMask) {
          continue;
        }

        const nextCost =
          currentCost +
          haversineKm(
            lastNode.latitude,
            lastNode.longitude,
            nextNode.latitude,
            nextNode.longitude,
          );
        const nextMask = mask | bit;
        const targetRow = cost[nextMask]!;
        if (nextCost + 1e-9 < targetRow[next]!) {
          targetRow[next] = nextCost;
          previous[nextMask]![next] = last;
        }
      }
    }
  }

  const fullMask = size - 1;
  const fullRow = cost[fullMask]!;
  let bestLast = -1;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let index = 0; index < count; index += 1) {
    if (fullRow[index]! + 1e-9 < bestCost) {
      bestCost = fullRow[index]!;
      bestLast = index;
    }
  }

  if (bestLast < 0) {
    return greedyNodeOrder(driverLatitude, driverLongitude, nodes);
  }

  const path: number[] = [];
  let mask = fullMask;
  let current = bestLast;
  while (current >= 0) {
    path.push(current);
    const previousIndex = previous[mask]![current]!;
    mask &= ~(1 << current);
    current = previousIndex;
  }
  path.reverse();
  return path;
}

/**
 * Xếp lộ trình chi tiết: trả về cả thứ tự từng chặng (legs) để UI/map vẽ
 * đúng trình tự lấy hàng và giao hàng đan xen theo tuyến tối ưu.
 */
export function planRouteDetailed(
  driverLatitude: number,
  driverLongitude: number,
  stops: RouteStopInput[],
): PlannedRoute {
  const { nodes, pickupNodeByOrder, dropoffNodeByOrder } =
    buildRouteNodes(stops);
  const visitOrder = optimalNodeOrder(driverLatitude, driverLongitude, nodes);
  const sequenceByNode = new Map<number, number>();
  visitOrder.forEach((nodeIndex, index) => {
    sequenceByNode.set(nodeIndex, index + 1);
  });

  const legs: PlannedLeg[] = visitOrder.map((nodeIndex, index) => {
    const node = nodes[nodeIndex]!;
    return {
      orderId: node.orderId,
      type: node.type,
      sequence: index + 1,
      latitude: node.latitude,
      longitude: node.longitude,
      status: node.status,
    };
  });

  let totalDistanceKm = 0;
  let latitude = driverLatitude;
  let longitude = driverLongitude;
  for (const leg of legs) {
    totalDistanceKm += haversineKm(
      latitude,
      longitude,
      leg.latitude,
      leg.longitude,
    );
    latitude = leg.latitude;
    longitude = leg.longitude;
  }

  let fallbackSequence = legs.length;
  const plannedStops: PlannedStop[] = stops.map((stop) => {
    const pickupNodeIndex = pickupNodeByOrder.get(stop.orderId);
    const dropoffNodeIndex = dropoffNodeByOrder.get(stop.orderId);
    const pickupSequence =
      pickupNodeIndex == null
        ? null
        : (sequenceByNode.get(pickupNodeIndex) ?? null);
    const dropoffSequence =
      dropoffNodeIndex == null
        ? null
        : (sequenceByNode.get(dropoffNodeIndex) ?? null);

    let sequence = Math.min(
      pickupSequence ?? Number.POSITIVE_INFINITY,
      dropoffSequence ?? Number.POSITIVE_INFINITY,
    );
    if (!Number.isFinite(sequence)) {
      fallbackSequence += 1;
      sequence = fallbackSequence;
    }

    return {
      orderId: stop.orderId,
      sequence,
      merchantLatitude: stop.merchantLatitude,
      merchantLongitude: stop.merchantLongitude,
      deliveryLatitude: stop.deliveryLatitude,
      deliveryLongitude: stop.deliveryLongitude,
      status: stop.status,
      pickupDone: PICKED_UP_STATUSES.has(stop.status),
      deliveryDone: stop.status === DELIVERED_STATUS,
      pickupSequence,
      dropoffSequence,
    };
  });

  plannedStops.sort((a, b) => a.sequence - b.sequence);
  // `sequence` của stop là thứ hạng đơn trong lộ trình (1..n) để tương thích
  // với API cũ; thứ tự chặng thật nằm ở `pickupSequence`/`dropoffSequence`.
  plannedStops.forEach((stop, index) => {
    stop.sequence = index + 1;
  });
  return { stops: plannedStops, legs, totalDistanceKm };
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
  return planRouteDetailed(driverLatitude, driverLongitude, stops).stops;
}

/**
 * Kiểm tra đơn mới có phù hợp để gộp vào lộ trình hiện tại không.
 *
 * Điều kiện (khi tài xế đã có ít nhất 1 đơn):
 * 1. Điểm giao mới cách một điểm giao hiện có ≤ `maxDropoffDeviationKm`.
 * 2. Quán mới cách một quán hiện có (hoặc vị trí tài xế) ≤ `maxPickupDeviationKm`.
 * 3. Nếu thêm đơn, tổng quãng đường tối ưu tăng thêm ≤ `maxDetourKm`.
 *
 * Tài xế chưa có đơn nào → luôn tương thích (đơn đầu tiên không phải "gộp").
 * Có thể truyền một số thay cho object options để tương thích code cũ; khi đó
 * cả 3 ngưỡng đều dùng cùng giá trị.
 */
export function isRouteCompatible(
  driverLatitude: number,
  driverLongitude: number,
  activeStops: RouteStopInput[],
  candidate: RouteCandidateInput,
  options: number | RouteCompatibilityOptions = {},
): boolean {
  if (activeStops.length === 0) return true;

  const normalized =
    typeof options === "number"
      ? {
          maxDropoffDeviationKm: options,
          maxPickupDeviationKm: options,
          maxDetourKm: options,
        }
      : options;

  const maxDropoff =
    normalized.maxDropoffDeviationKm != null &&
    Number.isFinite(normalized.maxDropoffDeviationKm)
      ? normalized.maxDropoffDeviationKm
      : 3;
  const maxPickup =
    normalized.maxPickupDeviationKm != null &&
    Number.isFinite(normalized.maxPickupDeviationKm)
      ? normalized.maxPickupDeviationKm
      : maxDropoff;
  const maxDetour =
    normalized.maxDetourKm != null && Number.isFinite(normalized.maxDetourKm)
      ? normalized.maxDetourKm
      : 3;

  // 1) Điểm giao mới phải gần ít nhất một điểm giao hiện có.
  const dropoffAnchors = activeStops.map((stop) => ({
    lat: stop.deliveryLatitude,
    lng: stop.deliveryLongitude,
  }));
  const dropoffCompatible = dropoffAnchors.some(
    (anchor) =>
      haversineKm(
        anchor.lat,
        anchor.lng,
        candidate.deliveryLatitude,
        candidate.deliveryLongitude,
      ) <= maxDropoff,
  );
  if (!dropoffCompatible) return false;

  const candidatePickupLatitude = candidate.merchantLatitude;
  const candidatePickupLongitude = candidate.merchantLongitude;

  // Code cũ chỉ truyền điểm giao → bỏ qua kiểm tra quán/detour.
  if (
    candidatePickupLatitude == null ||
    candidatePickupLongitude == null ||
    !Number.isFinite(candidatePickupLatitude) ||
    !Number.isFinite(candidatePickupLongitude)
  ) {
    return true;
  }

  // 2) Quán mới phải gần ít nhất một quán hiện có (hoặc tài xế nếu thiếu dữ liệu).
  const pickupAnchors = activeStops
    .filter(
      (stop) =>
        Number.isFinite(stop.merchantLatitude) &&
        Number.isFinite(stop.merchantLongitude),
    )
    .map((stop) => ({
      lat: stop.merchantLatitude,
      lng: stop.merchantLongitude,
    }));
  if (pickupAnchors.length === 0) {
    pickupAnchors.push({ lat: driverLatitude, lng: driverLongitude });
  }
  const pickupCompatible = pickupAnchors.some(
    (anchor) =>
      haversineKm(
        anchor.lat,
        anchor.lng,
        candidatePickupLatitude,
        candidatePickupLongitude,
      ) <= maxPickup,
  );
  if (!pickupCompatible) return false;

  // 3) Detour: lộ trình tối ưu sau khi thêm đơn không được dài hơn quá ngưỡng.
  const before = planRouteDetailed(
    driverLatitude,
    driverLongitude,
    activeStops,
  ).totalDistanceKm;
  const after = planRouteDetailed(driverLatitude, driverLongitude, [
    ...activeStops,
    {
      orderId: candidate.orderId ?? "__candidate__",
      merchantLatitude: candidatePickupLatitude,
      merchantLongitude: candidatePickupLongitude,
      deliveryLatitude: candidate.deliveryLatitude,
      deliveryLongitude: candidate.deliveryLongitude,
      status: candidate.status ?? "DRIVER_ACCEPTED",
      priorityRank: 1,
    },
  ]).totalDistanceKm;

  return after - before <= maxDetour + 1e-9;
}
