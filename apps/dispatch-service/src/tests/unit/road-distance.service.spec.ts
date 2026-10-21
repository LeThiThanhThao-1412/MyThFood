import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { RoadDistanceService } from "../../modules/dispatch/application/road-distance.service";

const POINTS = [
  { latitude: 10.77, longitude: 106.7 },
  { latitude: 10.78, longitude: 106.71 },
  { latitude: 10.79, longitude: 106.72 },
];

const OSRM_RESPONSE = {
  code: "Ok",
  distances: [
    [0, 1000, 2000],
    [1000, 0, 1500],
    [2000, 1500, 0],
  ],
  durations: [
    [0, 120, 240],
    [120, 0, 180],
    [240, 180, 0],
  ],
};

function jsonResponse(body: any, ok = true, status = 200): any {
  return {
    ok,
    status,
    json: async () => body,
  };
}

describe("RoadDistanceService", () => {
  let service: RoadDistanceService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    service = new RoadDistanceService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.ROAD_MATRIX_PROVIDER;
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.OSRM_BASE_URL;
    delete process.env.ROAD_MATRIX_CACHE_SECONDS;
    delete process.env.ROUTE_OPTIMIZE_METRIC;
  });

  it("lấy ma trận OSRM: km/phút đúng và metric mặc định duration", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(OSRM_RESPONSE));

    const matrix = await service.getMatrix(POINTS);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0]![0]);
    expect(url).toContain(
      "/table/v1/driving/106.7,10.77;106.71,10.78;106.72,10.79",
    );
    expect(url).toContain("annotations=distance,duration");
    expect(matrix?.source).toBe("osrm");
    expect(matrix?.metric).toBe("duration");
    expect(matrix?.distanceKm[0]![1]).toBeCloseTo(1, 6);
    expect(matrix?.durationMin?.[0]?.[1]).toBeCloseTo(2, 6);
  });

  it("cache theo toạ độ: gọi lại không hit mạng", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(OSRM_RESPONSE));

    await service.getMatrix(POINTS);
    await service.getMatrix(POINTS);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("OSRM lỗi → trả null để planner fallback Haversine", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({}, false, 503));

    await expect(service.getMatrix(POINTS)).resolves.toBeNull();
  });

  it("Google Distance Matrix dùng duration_in_traffic", async () => {
    process.env.ROAD_MATRIX_PROVIDER = "google";
    process.env.GOOGLE_MAPS_API_KEY = "test-key";

    const googleResponse = {
      status: "OK",
      rows: POINTS.map((_, i) => ({
        elements: POINTS.map((__, j) => {
          if (i === j) {
            return {
              status: "OK",
              distance: { value: 0 },
              duration: { value: 0 },
            };
          }
          return {
            status: "OK",
            distance: { value: 1000 },
            duration: { value: 300 },
            duration_in_traffic: { value: 600 },
          };
        }),
      })),
    };
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(googleResponse));

    const matrix = await service.getMatrix(POINTS);

    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      "maps.googleapis.com/maps/api/distancematrix/json",
    );
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("departure_time=now");
    expect(matrix?.source).toBe("google");
    expect(matrix?.distanceKm[0]![1]).toBeCloseTo(1, 6);
    // 600 giây (có traffic) = 10 phút, không phải 300 giây.
    expect(matrix?.durationMin?.[0]?.[1]).toBeCloseTo(10, 6);
  });

  it("Google lỗi → tự fallback OSRM", async () => {
    process.env.ROAD_MATRIX_PROVIDER = "google";
    process.env.GOOGLE_MAPS_API_KEY = "test-key";

    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ status: "REQUEST_DENIED", rows: [] }),
      )
      .mockResolvedValueOnce(jsonResponse(OSRM_RESPONSE));

    const matrix = await service.getMatrix(POINTS);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(matrix?.source).toBe("osrm");
  });
});
