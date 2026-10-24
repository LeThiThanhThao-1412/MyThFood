import "reflect-metadata";
import { DispatchRepository } from "../../modules/dispatch/infrastructure/dispatch.repository";

/**
 * Matching realtime: dispatch phải gọi endpoint `available/nearby` của
 * driver-service (Redis GEOSEARCH) trước, và chỉ fallback về `/available/list`
 * khi endpoint mới không dùng được.
 */
describe("DispatchRepository.findAvailableDriversNearLocation", () => {
  let repository: DispatchRepository;
  let fetchMock: jest.SpyInstance;

  const nearbyDriver = {
    id: "d1",
    currentLatitude: 10.7769,
    currentLongitude: 106.7009,
    distanceKm: 0.3,
    currentOrderIds: [],
    maxConcurrentOrders: 1,
  };

  beforeEach(() => {
    repository = new DispatchRepository({} as any);
    fetchMock = jest.spyOn(globalThis, "fetch");
    process.env.DRIVER_SERVICE_URL = "http://driver-service:3007";
  });

  afterEach(() => {
    fetchMock.mockRestore();
    delete process.env.DRIVER_SERVICE_URL;
  });

  it("should call the nearby endpoint and keep only drivers inside the radius", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          nearbyDriver,
          {
            ...nearbyDriver,
            id: "d2",
            currentLatitude: 10.9,
            currentLongitude: 106.8,
            distanceKm: 14,
          },
        ],
      }),
    } as any);

    const results = await repository.findAvailableDriversNearLocation(
      10.7769,
      106.7009,
      5,
      false,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("/drivers/available/nearby");
    expect(url).toContain("radiusKm=5");
    expect(url).toContain("includeStackable=false");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ driverId: "d1", distanceKm: 0.3 });
  });

  it("should fall back to /available/list when the nearby endpoint fails", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "d3",
              currentLatitude: 10.7769,
              currentLongitude: 106.7009,
              currentOrderId: null,
              maxConcurrentOrders: 1,
            },
          ],
        }),
      } as any);

    const results = await repository.findAvailableDriversNearLocation(
      10.7769,
      106.7009,
      5,
      false,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]![0])).toContain(
      "/drivers/available/list",
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.driverId).toBe("d3");
  });

  it("should apply stacking rules to nearby results as well", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            ...nearbyDriver,
            id: "busy",
            currentOrderIds: ["order-1"],
            maxConcurrentOrders: 3,
          },
        ],
      }),
    } as any);

    const stackable = await repository.findAvailableDriversNearLocation(
      10.7769,
      106.7009,
      5,
      true,
    );
    expect(stackable.map((driver) => driver.driverId)).toEqual(["busy"]);

    // FAST/PRIORITY (includeStackable = false): tài xế đang giữ đơn bị loại.
    // nearby trả về rỗng sau khi lọc → dispatch fallback sang danh sách đầy đủ,
    // ở đó quy tắc "chỉ tài xế rảnh" cũng loại nốt.
    const busyFromList = {
      id: "busy",
      currentLatitude: 10.7769,
      currentLongitude: 106.7009,
      currentOrderIds: ["order-1"],
      currentOrderId: "order-1",
      maxConcurrentOrders: 3,
    };
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [busyFromList] }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [busyFromList] }),
      } as any);

    const fast = await repository.findAvailableDriversNearLocation(
      10.7769,
      106.7009,
      5,
      false,
    );
    expect(fast).toEqual([]);
  });
});
