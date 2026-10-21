import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { DispatchService } from "../../modules/dispatch/application/dispatch.service";
import type { DispatchRepository } from "../../modules/dispatch/infrastructure/dispatch.repository";
import type { MatchingEngineService } from "../../modules/dispatch/application/matching-engine.service";
import type { DriverComplianceService } from "../../modules/dispatch/application/driver-compliance.service";
import type { RoadDistanceService } from "../../modules/dispatch/application/road-distance.service";
import {
  Dispatch,
  DispatchStatus,
} from "../../modules/dispatch/domain/dispatch.aggregate";
import { AssignDriverDto } from "../../modules/dispatch/application/dtos/dispatch.dto";

const DRIVER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_DRIVER_ID = "22222222-2222-4222-8222-222222222222";

type Coords = {
  merchant: [number, number];
  delivery: [number, number];
};

/**
 * Mock repository tối giản: mỗi test tự set danh sách dispatch đang giữ của
 * tài xế và danh sách dispatch đang MATCHING.
 */
function makeRepoMock() {
  let active: Dispatch[] = [];
  let matching: Dispatch[] = [];
  const save = jest.fn(async (_dispatch: Dispatch) => undefined);
  const acceptAtomic = jest.fn(async (_id: string) => true);

  return {
    repo: {
      save,
      acceptAtomic,
      findByIdOrFail: jest.fn(),
      findActiveByDriverId: jest.fn(async (_driverId: string) => active),
      findMatchingDispatches: jest.fn(async () => matching),
    } as unknown as DispatchRepository,
    save,
    setActive: (dispatches: Dispatch[]): void => {
      active = dispatches;
    },
    setMatching: (dispatches: Dispatch[]): void => {
      matching = dispatches;
    },
  };
}

function makeDispatch(
  orderId: string,
  coords: Coords,
  option: "SAVER" | "FAST" | "PRIORITY" = "SAVER",
): Dispatch {
  return Dispatch.create({
    orderId,
    merchantId: "merchant-1",
    deliveryAddress: `Địa chỉ ${orderId}`,
    deliveryLatitude: coords.delivery[0],
    deliveryLongitude: coords.delivery[1],
    merchantLatitude: coords.merchant[0],
    merchantLongitude: coords.merchant[1],
    deliveryOption: option,
  });
}

describe("DispatchService - đơn hiển thị cho tài xế", () => {
  let repo: ReturnType<typeof makeRepoMock>;
  let service: DispatchService;
  let driverProfile: any;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

    repo = makeRepoMock();
    service = new DispatchService(
      repo.repo,
      {} as MatchingEngineService,
      {
        recordOffer: jest.fn(async () => undefined),
        markAccepted: jest.fn(async () => undefined),
      } as unknown as DriverComplianceService,
      {
        getMatrix: jest.fn(async () => null),
      } as unknown as RoadDistanceService,
    );

    driverProfile = {
      id: DRIVER_ID,
      status: "ACTIVE",
      onlineStatus: "ONLINE",
      fatigueLevel: "NORMAL",
      acceptBlockedUntil: null,
      currentLatitude: 10.77,
      currentLongitude: 106.7,
      currentOrderId: null,
      currentOrderIds: [],
    };

    jest.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.includes(`/drivers/${DRIVER_ID}`)) {
        return {
          ok: true,
          json: async () => ({ data: driverProfile }),
        } as any;
      }
      return { ok: false, json: async () => ({}) } as any;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("tài xế đang rảnh thấy toàn bộ đơn đang tìm tài xế (trừ đơn đã từ chối)", async () => {
    const fast = makeDispatch(
      "order-fast",
      { merchant: [10.771, 106.701], delivery: [10.772, 106.702] },
      "FAST",
    );
    const saver = makeDispatch(
      "order-saver",
      { merchant: [10.771, 106.701], delivery: [10.773, 106.703] },
      "SAVER",
    );
    const declinedByMe = makeDispatch(
      "order-declined",
      { merchant: [10.771, 106.701], delivery: [10.772, 106.702] },
      "FAST",
    );
    declinedByMe.recordDriverDecline(DRIVER_ID);
    const takenByOther = makeDispatch(
      "order-taken",
      { merchant: [10.771, 106.701], delivery: [10.772, 106.702] },
      "SAVER",
    );
    takenByOther.assignDriver(OTHER_DRIVER_ID);

    repo.setMatching([fast, saver, declinedByMe, takenByOther]);

    const result = await service.getAvailableDispatchesForDriver(DRIVER_ID);

    expect(result.map((d) => d.dispatchOrderId).sort()).toEqual([
      "order-fast",
      "order-saver",
    ]);
  });

  it("tài xế đang giữ đơn SAVER chỉ thấy đơn SAVER cùng tuyến", async () => {
    const activeSaver = makeDispatch("order-a", {
      merchant: [10.771, 106.701],
      delivery: [10.772, 106.702],
    });
    activeSaver.assignDriver(DRIVER_ID);
    activeSaver.driverAccept();
    expect(activeSaver.dispatchStatus).toBe(DispatchStatus.DRIVER_ACCEPTED);

    const compatible = makeDispatch("order-b", {
      merchant: [10.7715, 106.7015],
      delivery: [10.7725, 106.7025],
    });
    const farAway = makeDispatch("order-c", {
      merchant: [10.95, 106.95],
      delivery: [10.96, 106.96],
    });
    const fastOrder = makeDispatch(
      "order-d",
      { merchant: [10.7715, 106.7015], delivery: [10.7725, 106.7025] },
      "FAST",
    );

    driverProfile.currentOrderId = "order-a";
    driverProfile.currentOrderIds = ["order-a"];
    repo.setActive([activeSaver]);
    repo.setMatching([compatible, farAway, fastOrder]);

    const result = await service.getAvailableDispatchesForDriver(DRIVER_ID);

    expect(result.map((d) => d.dispatchOrderId)).toEqual(["order-b"]);
  });

  it("tài xế đang giữ đơn FAST/PRIORITY không thấy thêm đơn nào", async () => {
    const activeFast = makeDispatch(
      "order-a",
      { merchant: [10.771, 106.701], delivery: [10.772, 106.702] },
      "FAST",
    );
    activeFast.assignDriver(DRIVER_ID);
    activeFast.driverAccept();

    const saver = makeDispatch("order-b", {
      merchant: [10.7715, 106.7015],
      delivery: [10.7725, 106.7025],
    });

    driverProfile.currentOrderIds = ["order-a"];
    repo.setActive([activeFast]);
    repo.setMatching([saver]);

    const result = await service.getAvailableDispatchesForDriver(DRIVER_ID);

    expect(result).toEqual([]);
  });

  it("tài xế hết slot gộp không thấy thêm đơn SAVER", async () => {
    const actives = ["order-a", "order-b", "order-c"].map((orderId) => {
      const dispatch = makeDispatch(orderId, {
        merchant: [10.771, 106.701],
        delivery: [10.772, 106.702],
      });
      dispatch.assignDriver(DRIVER_ID);
      dispatch.driverAccept();
      return dispatch;
    });
    const candidate = makeDispatch("order-d", {
      merchant: [10.7715, 106.7015],
      delivery: [10.7725, 106.7025],
    });

    driverProfile.currentOrderIds = actives.map((d) => d.dispatchOrderId);
    repo.setActive(actives);
    repo.setMatching([candidate]);

    const result = await service.getAvailableDispatchesForDriver(DRIVER_ID);

    expect(result).toEqual([]);
  });

  it("assignDriver từ chối tài xế không đủ điều kiện TRƯỚC khi gán", async () => {
    const activeFast = makeDispatch(
      "order-a",
      { merchant: [10.771, 106.701], delivery: [10.772, 106.702] },
      "FAST",
    );
    activeFast.assignDriver(DRIVER_ID);
    activeFast.driverAccept();

    const candidate = makeDispatch("order-b", {
      merchant: [10.7715, 106.7015],
      delivery: [10.7725, 106.7025],
    });

    driverProfile.currentOrderIds = ["order-a"];
    repo.setActive([activeFast]);
    (repo.repo.findByIdOrFail as jest.Mock).mockResolvedValue(candidate);

    await expect(
      service.assignDriver(candidate.id.value, {
        driverId: DRIVER_ID,
      } as AssignDriverDto),
    ).rejects.toThrow(/chưa đủ điều kiện nhận đơn/);

    expect(repo.save).not.toHaveBeenCalled();
    expect(candidate.dispatchStatus).toBe(DispatchStatus.MATCHING);
    expect(candidate.dispatchDriverId).toBeNull();
  });
});
