import {
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
});
