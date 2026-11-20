import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { MatchingEngineService } from "../../modules/dispatch/application/matching-engine.service";
import type { DispatchRepository } from "../../modules/dispatch/infrastructure/dispatch.repository";
import type { DriverComplianceService } from "../../modules/dispatch/application/driver-compliance.service";
import {
  Dispatch,
  DispatchStatus,
} from "../../modules/dispatch/domain/dispatch.aggregate";

const DRIVER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_DRIVER_ID = "22222222-2222-4222-8222-222222222222";
const ORDER_ID = "33333333-3333-4333-8333-333333333333";

function makeDriver(driverId: string, distanceKm: number) {
  return {
    driverId,
    distanceKm,
    latitude: 10.77,
    longitude: 106.7,
    activeOrderIds: [] as string[],
    maxConcurrentOrders: 1,
  };
}

function makeDispatch(
  option: "SAVER" | "FAST" | "PRIORITY" = "FAST",
): Dispatch {
  const dispatch = Dispatch.create({
    orderId: ORDER_ID,
    merchantId: "merchant-1",
    deliveryAddress: "Địa chỉ đơn",
    deliveryLatitude: 10.772,
    deliveryLongitude: 106.702,
    merchantLatitude: 10.77,
    merchantLongitude: 106.7,
    deliveryOption: option,
  });
  return dispatch;
}

describe("MatchingEngineService", () => {
  beforeAll(() => {
    // Tắt log ring để output test gọn.
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  function makeService(declinedDriverIds: string[] = []) {
    const repo = {
      findAvailableDriversNearLocation: jest.fn(async () => [
        makeDriver(DRIVER_ID, 0.01),
        makeDriver(OTHER_DRIVER_ID, 0.5),
      ]),
      findActiveByDriverId: jest.fn(async () => []),
    } as unknown as DispatchRepository;

    const compliance = {
      getDeclinedDriverIds: jest.fn(async () => declinedDriverIds),
    } as unknown as DriverComplianceService;

    return { service: new MatchingEngineService(repo, compliance), repo };
  }

  it("chọn tài xế gần nhất khi chưa ai từ chối", async () => {
    const { service } = makeService([]);
    const dispatch = makeDispatch("FAST");

    const result = await service.findBestDriver(dispatch, 0);

    expect(result.matched).toBe(true);
    expect(result.driver?.driverId).toBe(DRIVER_ID);
  });

  it("không ghép lại đơn cho tài xế đã từ chối (dispatch tạo lại, matchedDriverIds rỗng)", async () => {
    // Dispatch mới toanh → matchedDriverIds rỗng, nhưng lịch sử từ chối theo
    // order vẫn còn trong driver_dispatch_offers.
    const { service } = makeService([DRIVER_ID]);
    const dispatch = makeDispatch("FAST");
    expect(dispatch.dispatchMatchedDriverIds).toEqual([]);
    expect(dispatch.dispatchStatus).toBe(DispatchStatus.MATCHING);

    const result = await service.findBestDriver(dispatch, 0);

    expect(result.matched).toBe(true);
    // Tài xế gần nhất (0.01km) đã từ chối → chọn tài xế còn lại (0.5km).
    expect(result.driver?.driverId).toBe(OTHER_DRIVER_ID);
  });

  it("báo không tìm được tài xế khi tất cả đều đã từ chối", async () => {
    const { service } = makeService([DRIVER_ID, OTHER_DRIVER_ID]);
    const dispatch = makeDispatch("FAST");

    const result = await service.findBestDriver(dispatch, 0);

    expect(result.matched).toBe(false);
    expect(result.searchRadius).toBe(1.5);
  });

  it("lỗi đọc lịch sử từ chối → fail-open (vẫn ghép tài xế gần nhất)", async () => {
    const repo = {
      findAvailableDriversNearLocation: jest.fn(async () => [
        makeDriver(DRIVER_ID, 0.01),
      ]),
      findActiveByDriverId: jest.fn(async () => []),
    } as unknown as DispatchRepository;
    const compliance = {
      getDeclinedDriverIds: jest.fn(async () => {
        throw new Error("db down");
      }),
    } as unknown as DriverComplianceService;
    const service = new MatchingEngineService(repo, compliance);

    const result = await service.findBestDriver(makeDispatch("FAST"), 0);

    expect(result.matched).toBe(true);
    expect(result.driver?.driverId).toBe(DRIVER_ID);
  });
});
