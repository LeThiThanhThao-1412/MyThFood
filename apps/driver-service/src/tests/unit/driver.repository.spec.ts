import "reflect-metadata";
import type { Repository as TypeOrmRepo } from "typeorm";
import type { DriverEntity } from "../../modules/driver/infrastructure/driver.entity";
import { DriverMapper } from "../../modules/driver/infrastructure/driver.mapper";
import { DriverRepository } from "../../modules/driver/infrastructure/driver.repository";
import {
  DriverOnlineStatus,
  DriverStatus,
  FatigueLevel,
} from "../../modules/driver/domain/driver.aggregate";

const DRIVER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_DRIVER_ID = "33333333-3333-4333-8333-333333333333";

/**
 * Bản ghi bảng `drivers` đầy đủ field — override từng phần tuỳ test case.
 */
function makeEntity(overrides: Partial<DriverEntity> = {}): DriverEntity {
  return {
    id: DRIVER_ID,
    userId: "22222222-2222-4222-8222-222222222222",
    fullName: "Nguyen Van B",
    phoneNumber: "+84901112222",
    email: "driver@example.com",
    avatar: null,
    idCardNumber: "123456789",
    driverLicenseNumber: "DL-987654321",
    vehicleRegistrationNumber: "VR-12345",
    vehicleType: "MOTORBIKE",
    insuranceNumber: "INS-67890",
    criminalRecordUrl: null,
    status: DriverStatus.ACTIVE,
    onlineStatus: DriverOnlineStatus.ONLINE,
    currentLatitude: 10.775,
    currentLongitude: 106.7,
    lastLocationUpdateAt: null,
    totalDrivingMinutesToday: 0,
    currentSessionStartAt: null,
    consecutiveDrivingMinutes: 0,
    fatigueLevel: FatigueLevel.NORMAL,
    goHomeCountToday: 0,
    lastGoHomeAt: null,
    totalOrders: 0,
    rating: 0,
    totalRatings: 0,
    reputationScore: 100,
    acceptBlockedUntil: null,
    currentOrderId: null,
    isTrainingCompleted: true,
    depositAmount: 0,
    creditWalletBalance: 0,
    incomeWalletBalance: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Regression test cho bug "tài xế vừa bật ONLINE đã bị auto chuyển OFFLINE":
 * trước đây điều kiện "mất kết nối" chỉ dựa vào `lastLocationUpdateAt` — NULL ngay
 * sau khi vừa online nên bị quét và chuyển OFFLINE trong 5-10 giây.
 */
describe("DriverRepository.findOnlineWithStaleLocation", () => {
  const TIMEOUT_MS = 20_000;

  const makeCutoff = (offsetMs: number = TIMEOUT_MS): Date =>
    new Date(Date.now() - offsetMs);

  function setup(entities: DriverEntity[]) {
    const find = jest.fn(async (_options: unknown) => entities);
    const repository = new DriverRepository(
      { find } as unknown as TypeOrmRepo<DriverEntity>,
      new DriverMapper(),
    );
    return { find, repository };
  }

  it("should only query drivers with ONLINE status", async () => {
    const { find, repository } = setup([]);

    await repository.findOnlineWithStaleLocation(makeCutoff());

    expect(find).toHaveBeenCalledWith({
      where: { onlineStatus: DriverOnlineStatus.ONLINE },
    });
  });

  it("should NOT return a driver who just went online (no GPS sent yet)", async () => {
    const { repository } = setup([
      makeEntity({
        lastLocationUpdateAt: null,
        currentSessionStartAt: new Date(),
      }),
    ]);

    const stale = await repository.findOnlineWithStaleLocation(makeCutoff());

    expect(stale).toHaveLength(0);
  });

  it("should NOT return a driver whose GPS heartbeat is still fresh", async () => {
    const { repository } = setup([
      makeEntity({
        lastLocationUpdateAt: new Date(Date.now() - 5_000),
        currentSessionStartAt: new Date(Date.now() - 600_000),
      }),
    ]);

    const stale = await repository.findOnlineWithStaleLocation(makeCutoff());

    expect(stale).toHaveLength(0);
  });

  it("should return a driver whose last GPS is older than the timeout", async () => {
    const { repository } = setup([
      makeEntity({
        lastLocationUpdateAt: new Date(Date.now() - 60_000),
        currentSessionStartAt: new Date(Date.now() - 120_000),
      }),
    ]);

    const stale = await repository.findOnlineWithStaleLocation(makeCutoff());

    expect(stale).toHaveLength(1);
    expect(stale[0]?.id.toString()).toBe(DRIVER_ID);
  });

  it("should return a driver who never sent GPS since being online too long", async () => {
    const { repository } = setup([
      makeEntity({
        lastLocationUpdateAt: null,
        currentSessionStartAt: new Date(Date.now() - 60_000),
      }),
    ]);

    const stale = await repository.findOnlineWithStaleLocation(makeCutoff());

    expect(stale).toHaveLength(1);
    expect(stale[0]?.id.toString()).toBe(DRIVER_ID);
  });

  it("should NOT return a driver without any timing information (fail-safe)", async () => {
    const { repository } = setup([
      makeEntity({ lastLocationUpdateAt: null, currentSessionStartAt: null }),
    ]);

    const stale = await repository.findOnlineWithStaleLocation(makeCutoff());

    expect(stale).toHaveLength(0);
  });

  it("should return only the stale drivers among several online drivers", async () => {
    const { repository } = setup([
      // Vừa bật ONLINE → phải được giữ nguyên.
      makeEntity({
        lastLocationUpdateAt: null,
        currentSessionStartAt: new Date(),
      }),
      // Online đã lâu mà không gửi GPS → bị coi là mất kết nối.
      makeEntity({
        id: OTHER_DRIVER_ID,
        lastLocationUpdateAt: null,
        currentSessionStartAt: new Date(Date.now() - 60_000),
      }),
    ]);

    const stale = await repository.findOnlineWithStaleLocation(makeCutoff());

    expect(stale).toHaveLength(1);
    expect(stale[0]?.id.toString()).toBe(OTHER_DRIVER_ID);
  });
});
