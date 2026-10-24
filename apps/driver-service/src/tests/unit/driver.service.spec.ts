import "reflect-metadata";
import { Logger } from "@nestjs/common";
import type { HttpService } from "@nestjs/axios";
import { DriverService } from "../../modules/driver/application/driver.service";
import type { DriverRepository } from "../../modules/driver/infrastructure/driver.repository";
import type { DriverLocationHistoryRepository } from "../../modules/driver/infrastructure/driver-location-history.repository";
import type { DriverGeoService } from "../../modules/geo/driver-geo.service";
import {
  Driver,
  DriverOnlineStatus,
} from "../../modules/driver/domain/driver.aggregate";

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

/** Repository giả: cho phép điều khiển danh sách "mất kết nối" trả về. */
function makeDriverRepoMock() {
  let staleResult: Driver[] = [];
  let lastCutoff: Date | null = null;

  const save = jest.fn(async (_driver: Driver) => undefined);
  const findOnlineWithStaleLocation = jest.fn(async (cutoff: Date) => {
    lastCutoff = cutoff;
    return staleResult;
  });

  return {
    repository: {
      save,
      findOnlineWithStaleLocation,
    } as unknown as DriverRepository,
    save,
    findOnlineWithStaleLocation,
    setStaleResult: (drivers: Driver[]): void => {
      staleResult = drivers;
    },
    getLastCutoff: (): Date | null => lastCutoff,
  };
}

/**
 * Regression test cho bug "tài xế vừa bật ONLINE bị tự động chuyển OFFLINE sau
 * 5-10 giây": sweep phải bỏ qua tài xế còn trong khoảng ân hạn kể từ nhịp tim
 * cuối cùng (thời điểm vừa online), dù repository có trả về nhầm.
 */
describe("DriverService.sweepStaleOnlineDrivers", () => {
  const NOW = new Date("2026-01-01T12:00:00.000Z");
  const DEFAULT_TIMEOUT_MS = 20_000;

  let repo: ReturnType<typeof makeDriverRepoMock>;
  let service: DriverService;

  /** Tạo 1 tài xế đang ONLINE kể từ thời điểm `onlineSince`. */
  const makeOnlineDriver = (onlineSince: Date): Driver => {
    jest.setSystemTime(onlineSince);
    const driver = Driver.create(createProps);
    driver.completeTraining();
    driver.activate();
    driver.goOnline();
    // Trả đồng hồ về thời điểm hiện tại cho phần còn lại của test.
    jest.setSystemTime(NOW);
    return driver;
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

    repo = makeDriverRepoMock();
    service = new DriverService(
      repo.repository,
      {} as DriverLocationHistoryRepository,
      {} as HttpService,
      {} as DriverGeoService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete process.env.DRIVER_OFFLINE_TIMEOUT_SECONDS;
  });

  it("should use the default timeout to compute the cutoff", async () => {
    repo.setStaleResult([]);

    await service.sweepStaleOnlineDrivers();

    expect(repo.getLastCutoff()?.toISOString()).toBe(
      new Date(NOW.getTime() - DEFAULT_TIMEOUT_MS).toISOString(),
    );
  });

  it("should honor DRIVER_OFFLINE_TIMEOUT_SECONDS from env", async () => {
    process.env.DRIVER_OFFLINE_TIMEOUT_SECONDS = "45";
    repo.setStaleResult([]);

    await service.sweepStaleOnlineDrivers();

    expect(repo.getLastCutoff()?.toISOString()).toBe(
      new Date(NOW.getTime() - 45_000).toISOString(),
    );
  });

  it("should auto-offline a driver who has been silent longer than the timeout", async () => {
    // Online từ 60 giây trước và chưa từng gửi vị trí GPS.
    const driver = makeOnlineDriver(new Date(NOW.getTime() - 60_000));
    repo.setStaleResult([driver]);

    const count = await service.sweepStaleOnlineDrivers();

    expect(count).toBe(1);
    expect(driver.driverOnlineStatus).toBe(DriverOnlineStatus.OFFLINE);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(driver);
  });

  it("should NOT auto-offline a driver who just went online", async () => {
    // Vừa bật ONLINE ở thời điểm hiện tại, chưa kịp gửi vị trí GPS.
    const driver = makeOnlineDriver(NOW);
    // Giả lập repository trả về nhầm (hành vi gây ra bug trước đây).
    repo.setStaleResult([driver]);

    const count = await service.sweepStaleOnlineDrivers();

    expect(count).toBe(0);
    expect(driver.driverOnlineStatus).toBe(DriverOnlineStatus.ONLINE);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("should NOT auto-offline a driver whose last GPS heartbeat is fresh", async () => {
    // Online 10 phút, nhưng vừa gửi GPS 5 giây trước.
    const driver = makeOnlineDriver(new Date(NOW.getTime() - 600_000));
    jest.setSystemTime(new Date(NOW.getTime() - 5_000));
    driver.updateLocation(10.775, 106.7);
    jest.setSystemTime(NOW);
    repo.setStaleResult([driver]);

    const count = await service.sweepStaleOnlineDrivers();

    expect(count).toBe(0);
    expect(driver.driverOnlineStatus).toBe(DriverOnlineStatus.ONLINE);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("should ignore drivers that are no longer ONLINE", async () => {
    const driver = makeOnlineDriver(new Date(NOW.getTime() - 60_000));
    driver.goOffline();

    repo.setStaleResult([driver]);

    const count = await service.sweepStaleOnlineDrivers();

    expect(count).toBe(0);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("should do nothing when there is no stale driver", async () => {
    repo.setStaleResult([]);

    const count = await service.sweepStaleOnlineDrivers();

    expect(count).toBe(0);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
