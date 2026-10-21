import {
  buildRouteNodeCoordinates,
  haversineKm,
  isRouteCompatible,
  planRoute,
  planRouteDetailed,
} from "../../modules/dispatch/domain/route-planner";

const stop = (
  orderId: string,
  merchant: [number, number],
  delivery: [number, number],
  status = "DRIVER_ACCEPTED",
) => ({
  orderId,
  merchantLatitude: merchant[0],
  merchantLongitude: merchant[1],
  deliveryLatitude: delivery[0],
  deliveryLongitude: delivery[1],
  status,
  priorityRank: 0,
});

/**
 * Lộ trình ngắn nhất tuyệt đối bằng vét cạn — chỉ dùng trong test (n ≤ 3 đơn).
 * Duyệt mọi hoán vị node thoả "pickup(A) trước dropoff(A)" rồi lấy tổng
 * quãng đường nhỏ nhất, xuất phát từ vị trí tài xế.
 */
function bruteForceShortestKm(
  origin: [number, number],
  stops: ReturnType<typeof stop>[],
): number {
  type Node = {
    orderIndex: number;
    type: "PICKUP" | "DROPOFF";
    latitude: number;
    longitude: number;
  };
  const nodes: Node[] = [];
  stops.forEach((s, orderIndex) => {
    nodes.push({
      orderIndex,
      type: "PICKUP",
      latitude: s.merchantLatitude,
      longitude: s.merchantLongitude,
    });
  });
  stops.forEach((s, orderIndex) => {
    nodes.push({
      orderIndex,
      type: "DROPOFF",
      latitude: s.deliveryLatitude,
      longitude: s.deliveryLongitude,
    });
  });

  const used = new Array(nodes.length).fill(false) as boolean[];
  const pickedOrders = new Set<number>();
  const path: number[] = [];
  let best = Number.POSITIVE_INFINITY;

  const walk = (): void => {
    if (path.length === nodes.length) {
      let total = haversineKm(
        origin[0],
        origin[1],
        nodes[path[0]!]!.latitude,
        nodes[path[0]!]!.longitude,
      );
      for (let i = 1; i < path.length; i += 1) {
        const previous = nodes[path[i - 1]!]!;
        const current = nodes[path[i]!]!;
        total += haversineKm(
          previous.latitude,
          previous.longitude,
          current.latitude,
          current.longitude,
        );
      }
      best = Math.min(best, total);
      return;
    }

    for (let index = 0; index < nodes.length; index += 1) {
      if (used[index]) continue;
      const node = nodes[index]!;
      if (node.type === "DROPOFF" && !pickedOrders.has(node.orderIndex)) {
        continue;
      }

      used[index] = true;
      path.push(index);
      const wasPicked = pickedOrders.has(node.orderIndex);
      if (node.type === "PICKUP") pickedOrders.add(node.orderIndex);

      walk();

      if (node.type === "PICKUP" && !wasPicked) {
        pickedOrders.delete(node.orderIndex);
      }
      path.pop();
      used[index] = false;
    }
  };

  walk();
  return best;
}

describe("route-planner", () => {
  it("xếp điểm gần nhất trước và trả sequence 1..n", () => {
    const planned = planRoute(10.77, 106.7, [
      stop("far", [10.79, 106.72], [10.8, 106.73]),
      stop("near", [10.771, 106.701], [10.78, 106.71]),
    ]);

    expect(planned.map((s) => s.orderId)).toEqual(["near", "far"]);
    expect(planned.map((s) => s.sequence)).toEqual([1, 2]);
    expect(planned[0]!.pickupDone).toBe(false);
  });

  it("giữ trạng thái pickupDone theo status thực tế", () => {
    const planned = planRoute(10.77, 106.7, [
      stop("picked", [10.771, 106.701], [10.78, 106.71], "PICKED_UP"),
    ]);

    expect(planned[0]!.pickupDone).toBe(true);
  });

  it("isRouteCompatible: đơn mới gần điểm giao hiện tại", () => {
    const active = [stop("a", [10.77, 106.7], [10.78, 106.71])];

    expect(
      isRouteCompatible(
        10.77,
        106.7,
        active,
        { deliveryLatitude: 10.781, deliveryLongitude: 106.711 },
        3,
      ),
    ).toBe(true);
  });

  it("isRouteCompatible: đơn mới quá xa lộ trình", () => {
    const active = [stop("a", [10.77, 106.7], [10.78, 106.71])];

    expect(
      isRouteCompatible(
        10.77,
        106.7,
        active,
        { deliveryLatitude: 10.95, deliveryLongitude: 106.95 },
        3,
      ),
    ).toBe(false);
  });

  it("isRouteCompatible: quán mới quá xa thì từ chối dù điểm giao gần", () => {
    const active = [stop("A", [10.771, 106.701], [10.772, 106.702])];

    expect(
      isRouteCompatible(
        10.77,
        106.7,
        active,
        {
          orderId: "B",
          merchantLatitude: 10.9,
          merchantLongitude: 106.9,
          deliveryLatitude: 10.773,
          deliveryLongitude: 106.703,
          status: "DRIVER_ACCEPTED",
        },
        {
          maxDropoffDeviationKm: 3,
          maxPickupDeviationKm: 3,
          maxDetourKm: 100,
        },
      ),
    ).toBe(false);
  });

  it("isRouteCompatible: cả quán và khách đều gần nhưng detour quá lớn", () => {
    const active = [stop("A", [10.771, 106.701], [10.772, 106.702])];
    const candidate = {
      orderId: "B",
      merchantLatitude: 10.79,
      merchantLongitude: 106.72,
      deliveryLatitude: 10.791,
      deliveryLongitude: 106.721,
      status: "DRIVER_ACCEPTED",
    };

    expect(
      isRouteCompatible(10.77, 106.7, active, candidate, {
        maxDropoffDeviationKm: 3,
        maxPickupDeviationKm: 3,
        maxDetourKm: 2.5,
      }),
    ).toBe(false);

    expect(
      isRouteCompatible(10.77, 106.7, active, candidate, {
        maxDropoffDeviationKm: 3,
        maxPickupDeviationKm: 3,
        maxDetourKm: 4,
      }),
    ).toBe(true);
  });

  it("haversineKm trả 0 cho cùng toạ độ", () => {
    expect(haversineKm(10.77, 106.7, 10.77, 106.7)).toBe(0);
  });

  it("tối ưu toàn lộ trình: lấy B1 trên đường tới A1, giao A2 trên đường tới C1", () => {
    const at = (lng: number): [number, number] => [10.77, lng];
    const route = planRouteDetailed(10.77, 106.7, [
      stop("A", at(106.702), at(106.703)),
      stop("B", at(106.701), at(106.706)),
      stop("C", at(106.704), at(106.705)),
    ]);

    expect(route.legs.map((leg) => `${leg.type}:${leg.orderId}`)).toEqual([
      "PICKUP:B",
      "PICKUP:A",
      "DROPOFF:A",
      "PICKUP:C",
      "DROPOFF:C",
      "DROPOFF:B",
    ]);

    // Thứ tự đơn trong lộ trình không phải thứ tự nhận A → B → C.
    expect(route.stops.map((item) => item.orderId)).toEqual(["B", "A", "C"]);
    expect(route.stops.map((item) => item.sequence)).toEqual([1, 2, 3]);

    const byOrder = new Map(route.stops.map((item) => [item.orderId, item]));
    expect(byOrder.get("A")?.pickupSequence).toBe(2);
    expect(byOrder.get("A")?.dropoffSequence).toBe(3);
    expect(byOrder.get("B")?.pickupSequence).toBe(1);
    expect(byOrder.get("B")?.dropoffSequence).toBe(6);
    expect(byOrder.get("C")?.pickupSequence).toBe(4);
    expect(byOrder.get("C")?.dropoffSequence).toBe(5);
  });

  it("đơn đã lấy món được giao trước khi lấy đơn mới nếu gần hơn", () => {
    const at = (lng: number): [number, number] => [10.77, lng];
    const route = planRouteDetailed(10.77, 106.7, [
      stop("A", at(106.701), at(106.702), "PICKED_UP"),
      stop("B", at(106.709), at(106.71)),
    ]);

    expect(route.legs.map((leg) => `${leg.type}:${leg.orderId}`)).toEqual([
      "DROPOFF:A",
      "PICKUP:B",
      "DROPOFF:B",
    ]);
  });

  it("không bao giờ giao một đơn trước khi lấy món của chính đơn đó", () => {
    const at = (lng: number): [number, number] => [10.77, lng];
    const route = planRouteDetailed(10.77, 106.7, [
      stop("A", at(106.701), at(106.706)),
      stop("B", at(106.702), at(106.703)),
      stop("C", at(106.704), at(106.705)),
    ]);

    const pickupAt = new Map<string, number>();
    route.legs.forEach((leg, index) => {
      if (leg.type === "PICKUP") {
        pickupAt.set(leg.orderId, index);
        return;
      }
      expect(pickupAt.get(leg.orderId)).toBeLessThan(index);
    });
  });

  it("2 đơn cùng nhà hàng: lấy món cả 2 trước khi rời quán", () => {
    // Toạ độ thực của 2 đơn #86102601 và #60983d5d (cùng nhà hàng).
    const merchant: [number, number] = [10.828514617369724, 106.68460875749588];
    const stops = [
      {
        orderId: "86102601",
        merchantLatitude: merchant[0],
        merchantLongitude: merchant[1],
        deliveryLatitude: 10.8263917,
        deliveryLongitude: 106.6823443,
        status: "DRIVER_ACCEPTED",
      },
      {
        orderId: "60983d5d",
        merchantLatitude: merchant[0],
        merchantLongitude: merchant[1],
        deliveryLatitude: 10.8216008,
        deliveryLongitude: 106.6870365,
        status: "DRIVER_ACCEPTED",
      },
    ];

    // Dù tài xế xuất phát ở khách nào / ở quán, 2 chặng đầu phải là PICKUP.
    for (const start of [
      [10.8216234, 106.6870349],
      [10.8285146, 106.6846088],
      [10.8263917, 106.6823443],
    ]) {
      const route = planRouteDetailed(start[0]!, start[1]!, stops);
      expect(route.legs.slice(0, 2).map((leg) => leg.type)).toEqual([
        "PICKUP",
        "PICKUP",
      ]);
      // Không được quay lại quán sau khi đã giao đơn đầu.
      const firstDropoff = route.legs.findIndex(
        (leg) => leg.type === "DROPOFF",
      );
      const pickupsAfterFirstDropoff = route.legs
        .slice(firstDropoff)
        .filter((leg) => leg.type === "PICKUP");
      expect(pickupsAfterFirstDropoff).toEqual([]);
    }
  });

  it("3 đơn (7 điểm gồm vị trí tài xế) khớp lộ trình ngắn nhất tuyệt đối", () => {
    // 3 đơn: A và B cùng nhà hàng, C ở nhà hàng khác; tài xế xuất phát tại
    // điểm giao của B → tổng cộng 1 vị trí tài xế + 3 pickup + 3 dropoff.
    const stops = [
      stop("A", [10.8285, 106.6846], [10.8263, 106.6823]),
      stop("B", [10.8285, 106.6846], [10.8216, 106.687]),
      stop("C", [10.833, 106.69], [10.83, 106.695]),
    ];
    const origin: [number, number] = [10.8216, 106.687];

    const planned = planRouteDetailed(origin[0], origin[1], stops);

    // 6 chặng cho 3 đơn (chưa tính vị trí tài xế là điểm xuất phát).
    expect(planned.legs).toHaveLength(6);
    // DP phải cho đúng tổng quãng đường ngắn nhất như vét cạn mọi hoán vị.
    expect(planned.totalDistanceKm).toBeCloseTo(
      bruteForceShortestKm(origin, stops),
      6,
    );

    // Ràng buộc duy nhất: pickup(A) trước dropoff(A) với mọi đơn.
    for (const orderId of ["A", "B", "C"]) {
      const pickupIndex = planned.legs.findIndex(
        (leg) => leg.type === "PICKUP" && leg.orderId === orderId,
      );
      const dropoffIndex = planned.legs.findIndex(
        (leg) => leg.type === "DROPOFF" && leg.orderId === orderId,
      );
      expect(pickupIndex).toBeGreaterThanOrEqual(0);
      expect(dropoffIndex).toBeGreaterThan(pickupIndex);
    }
  });

  it("dùng ma trận đường đi thực tế: chọn thứ tự tối ưu theo matrix", () => {
    // 2 đơn → 4 node theo thứ tự buildRouteNodeCoordinates:
    // [PICKUP A, PICKUP B, DROPOFF A, DROPOFF B] (index matrix 1..4).
    const stops = [
      stop("A", [10.77, 106.7], [10.78, 106.71]),
      stop("B", [10.771, 106.701], [10.779, 106.709]),
    ];
    const far = 100;
    const distanceKm = [
      [0, 1, 1, far, far], // origin
      [far, 0, 1, 50, far], // A pickup
      [far, 1, 0, far, 1], // B pickup
      [far, far, far, 0, 1], // A dropoff
      [far, far, far, 1, 0], // B dropoff
    ];

    const planned = planRouteDetailed(10.77, 106.7, stops, {
      distanceKm,
      metric: "distance",
      source: "osrm",
    });

    // Đường thực tế rẻ nhất: lấy A → lấy B → giao B → giao A (tổng 4).
    expect(planned.legs.map((leg) => `${leg.type}:${leg.orderId}`)).toEqual([
      "PICKUP:A",
      "PICKUP:B",
      "DROPOFF:B",
      "DROPOFF:A",
    ]);
    expect(planned.totalDistanceKm).toBeCloseTo(4, 6);
    expect(planned.source).toBe("osrm");
  });

  it("tối ưu theo duration (giao thông) có thể khác distance", () => {
    const stops = [
      stop("A", [10.77, 106.7], [10.78, 106.71]),
      stop("B", [10.771, 106.701], [10.779, 106.709]),
    ];
    const far = 100;
    const distanceKm = [
      [0, 1, 1, far, far],
      [far, 0, 1, 50, far],
      [far, 1, 0, far, 1],
      [far, far, far, 0, 1],
      [far, far, far, 1, 0],
    ];
    // Đường A→B tắc (100 phút); đi giao A rồi mới lấy B chỉ 3 phút.
    const durationMin = [
      [0, 1, 1, far, far],
      [far, 0, 100, 1, far],
      [far, 100, 0, far, 1],
      [far, far, 1, 0, 1],
      [far, far, far, 1, 0],
    ];

    const planned = planRouteDetailed(10.77, 106.7, stops, {
      distanceKm,
      durationMin,
      metric: "duration",
      source: "google",
    });

    expect(planned.legs.map((leg) => `${leg.type}:${leg.orderId}`)).toEqual([
      "PICKUP:A",
      "DROPOFF:A",
      "PICKUP:B",
      "DROPOFF:B",
    ]);
    expect(planned.totalDurationMin).toBeCloseTo(4, 6);
    expect(planned.source).toBe("google");
  });

  it("ma trận sai kích thước → fallback Haversine", () => {
    const stops = [
      stop("A", [10.77, 106.7], [10.78, 106.71]),
      stop("B", [10.771, 106.701], [10.779, 106.709]),
    ];

    const planned = planRouteDetailed(10.77, 106.7, stops, {
      distanceKm: [[0, 1]],
      source: "osrm",
    });

    expect(planned.source).toBe("haversine");
    expect(planned.legs).toHaveLength(4);
    expect(planned.totalDurationMin).toBeGreaterThan(0);
  });

  it("buildRouteNodeCoordinates khớp thứ tự node pickup/dropoff", () => {
    const stops = [
      stop("A", [10.77, 106.7], [10.78, 106.71]),
      stop("B", [10.771, 106.701], [10.779, 106.709]),
    ];

    expect(buildRouteNodeCoordinates(stops)).toEqual([
      { latitude: 10.77, longitude: 106.7 },
      { latitude: 10.771, longitude: 106.701 },
      { latitude: 10.78, longitude: 106.71 },
      { latitude: 10.779, longitude: 106.709 },
    ]);
  });
});
