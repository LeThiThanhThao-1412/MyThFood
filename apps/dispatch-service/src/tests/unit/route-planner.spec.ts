import {
  haversineKm,
  isRouteCompatible,
  planRoute,
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

  it("haversineKm trả 0 cho cùng toạ độ", () => {
    expect(haversineKm(10.77, 106.7, 10.77, 106.7)).toBe(0);
  });
});
