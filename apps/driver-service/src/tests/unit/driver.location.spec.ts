import "reflect-metadata";
import { Logger } from "@nestjs/common";
import type { HttpService } from "@nestjs/axios";
import {
  DriverService,
  type LocationBroadcast,
} from "../../modules/driver/application/driver.service";
import type { DriverRepository } from "../../modules/driver/infrastructure/driver.repository";
import type { DriverLocationHistoryRepository } from "../../modules/driver/infrastructure/driver-location-history.repository";
import type {
  DriverGeoService,
  NearbyDriverGeo,
} from "../../modules/geo/driver-geo.service";
import { Driver } from "../../modules/driver/domain/driver.aggregate";

const createProps = {
  userId: "user-123",
  fullName: "Nguyen Van B",
  phoneNumber: "+84901112222",
  email: "driver@example.com",
  idCardNumber: "123456789",
  driverLicenseNumber: "DL-987654321",
  vehicleRegistrationNumber: "VR-12345",
  insuranceNumber: "INS-67890",
};

const BASE_LAT = 10.7769;
const BASE_LNG = 106.7009;

function makeOnlineDriver(lat?: number, lng?: number): Driver {
  const driver = Driver.create(createProps);
  driver.completeTraining();
  driver.activate();
  driver.goOnline();
  if (lat != null && lng != null) driver.updateLocation(lat, lng);
  return driver;
}

function makeService(driver: Driver) {
  const driverRepo = {
    findByIdOrFail: jest.fn(async () => driver),
    save: jest.fn(async () => undefined),
    findAvailableDrivers: jest.fn(async () => [] as Driver[]),
  };
  const historyRepo = {
    savePoint: jest.fn(async () => undefined),
    savePoints: jest.fn(async (_points?: any[]) => 0),
  };
  const geoService = {
    upsertPosition: jest.fn(async () => undefined),
    removeDriver: jest.fn(async () => undefined),
    nearby: jest.fn(async (..._args: any[]): Promise<NearbyDriverGeo[]> => []),
  };

  const service = new DriverService(
    driverRepo as unknown as DriverRepository,
    historyRepo as unknown as DriverLocationHistoryRepository,
    {} as HttpService,
    geoService as unknown as DriverGeoService,
  );

  return { service, driverRepo, historyRepo, geoService };
}

describe("DriverService GPS realtime pipeline", () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("updateLocationsBatch", () => {
    it("should persist the whole batch in one INSERT and keep device timestamps", async () => {
      const driver = makeOnlineDriver();
      const { service, driverRepo, historyRepo, geoService } =
        makeService(driver);
      const listener = jest.fn();
      service.registerLocationListener(listener);

      const result = await service.updateLocationsBatch(driver.id.toString(), [
        {
          latitude: 10.1,
          longitude: 106.1,
          recordedAt: "2026-01-01T10:00:00.000Z",
        },
        {
          latitude: 10.2,
          longitude: 106.2,
          recordedAt: "2026-01-01T10:00:10.000Z",
        },
      ]);

      expect(result.accepted).toBe(2);
      expect(driverRepo.save).toHaveBeenCalledTimes(1);
      expect(historyRepo.savePoints).toHaveBeenCalledTimes(1);

      const savedPoints = historyRepo.savePoints.mock.calls[0]?.[0] as any[];
      expect(savedPoints).toHaveLength(2);
      expect(savedPoints[1]!.latitude).toBe(10.2);
      expect(savedPoints[1]!.recordedAt.toISOString()).toBe(
        "2026-01-01T10:00:10.000Z",
      );

      // Vị trí hiện tại = điểm cuối cùng của lô.
      expect(driver.driverCurrentLatitude).toBe(10.2);
      expect(driver.driverCurrentLongitude).toBe(106.2);

      // Redis GEO + fan-out chỉ cần điểm cuối.
      expect(geoService.upsertPosition).toHaveBeenCalledWith(
        driver.id.toString(),
        10.2,
        106.2,
      );
      expect(listener).toHaveBeenCalledTimes(1);
      const broadcast = listener.mock.calls[0]![0] as LocationBroadcast;
      expect(broadcast.latitude).toBe(10.2);
      expect(broadcast.orderId).toBeNull();
    });

    it("should still return success when history insert fails", async () => {
      const driver = makeOnlineDriver();
      const { service, historyRepo } = makeService(driver);
      historyRepo.savePoints.mockRejectedValueOnce(new Error("db down"));

      await expect(
        service.updateLocationsBatch(driver.id.toString(), [
          { latitude: 10.5, longitude: 106.5 },
        ]),
      ).resolves.toMatchObject({ accepted: 1 });
    });
  });

  describe("updateLocation", () => {
    it("should publish realtime location with the transport source", async () => {
      const driver = makeOnlineDriver();
      const { service, geoService } = makeService(driver);
      const listener = jest.fn();
      service.registerLocationListener(listener);

      await service.updateLocation(
        driver.id.toString(),
        { latitude: BASE_LAT, longitude: BASE_LNG },
        "WS",
      );

      expect(geoService.upsertPosition).toHaveBeenCalledWith(
        driver.id.toString(),
        BASE_LAT,
        BASE_LNG,
      );
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ source: "WS", latitude: BASE_LAT }),
      );
    });
  });

  describe("getAvailableDriversNearby", () => {
    it("should prefer Redis GEO distances and sort near → far", async () => {
      const nearDriver = makeOnlineDriver(BASE_LAT, BASE_LNG);
      const farDriver = makeOnlineDriver(BASE_LAT + 0.02, BASE_LNG);
      const { service, driverRepo, geoService } = makeService(nearDriver);
      driverRepo.findAvailableDrivers.mockResolvedValue([
        farDriver,
        nearDriver,
      ]);
      geoService.nearby.mockResolvedValue([
        { driverId: nearDriver.id.toString(), distanceKm: 0.42 },
      ]);

      const results = await service.getAvailableDriversNearby({
        latitude: BASE_LAT,
        longitude: BASE_LNG,
        radiusKm: 5,
      });

      expect(results).toHaveLength(2);
      expect(results[0]!.driver.id.toString()).toBe(nearDriver.id.toString());
      expect(results[0]!.distanceKm).toBe(0.42);
      // farDriver không có trong Redis → fallback Haversine (~2.2km).
      expect(results[1]!.driver.id.toString()).toBe(farDriver.id.toString());
      expect(results[1]!.distanceKm).toBeGreaterThan(2);
    });

    it("should drop drivers outside the radius and those without coordinates", async () => {
      const nearDriver = makeOnlineDriver(BASE_LAT, BASE_LNG);
      const noGpsDriver = makeOnlineDriver();
      const { service, driverRepo } = makeService(nearDriver);
      driverRepo.findAvailableDrivers.mockResolvedValue([
        nearDriver,
        noGpsDriver,
      ]);

      const results = await service.getAvailableDriversNearby({
        latitude: BASE_LAT,
        longitude: BASE_LNG,
        radiusKm: 0.1,
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.driver.id.toString()).toBe(nearDriver.id.toString());
    });

    it("should work in DB-only mode when Redis returns nothing", async () => {
      const driver = makeOnlineDriver(BASE_LAT + 0.01, BASE_LNG);
      const { service, driverRepo, geoService } = makeService(driver);
      driverRepo.findAvailableDrivers.mockResolvedValue([driver]);
      geoService.nearby.mockResolvedValue([]);

      const results = await service.getAvailableDriversNearby({
        latitude: BASE_LAT,
        longitude: BASE_LNG,
        radiusKm: 5,
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.distanceKm).toBeGreaterThan(1);
    });
  });
});
