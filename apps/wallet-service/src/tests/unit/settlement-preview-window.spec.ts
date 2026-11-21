import { WalletService } from "../../modules/wallet/application/wallet.service";

/**
 * Preview (dry-run) quyết toán phải soi ĐÚNG tập dòng mà lô thật sẽ quyết toán.
 *
 * Hai lỗi gốc được khoá ở đây:
 *  1. `releaseSettlement` đóng dấu `settleOn` = 23:00 giờ VN của ngày phán
 *     quyết — đúng bằng biên `:end` của cửa sổ. Cron/chạy tay dùng
 *     `findAllPending` nên vẫn trả tiền, nhưng preview lọc theo cửa sổ nửa mở
 *     lại bỏ sót dòng đó ⇒ admin thấy thiếu tiền so với lô thật.
 *  2. Preview cũ trả `totalRecovered = 0` dù lô thật credit đủ doanh thu rồi
 *     thu hồi nợ clawback ngay (`PARTIAL_ALWAYS`) ⇒ ví nhận ít hơn số hiển thị.
 */

const MERCHANT = "m-1";
const DRIVER = "d-1";
const PLATFORM = "p-1";
const RESERVE = "RESERVE_FUND";

type Entry = {
  id: string;
  orderId: string;
  ownerId: string;
  ownerType: string;
  kind: string;
  amount: number;
  status: string;
  settleOn?: Date | null;
  createdAt: Date;
};

function entry(
  id: string,
  ownerType: string,
  ownerId: string,
  amount: number,
  extra: {
    orderId?: string;
    kind?: string;
    settleOn?: Date | null;
    createdAt?: Date;
  } = {},
): Entry {
  return {
    id,
    orderId: extra.orderId ?? `order-${id}`,
    ownerType,
    ownerId,
    kind: extra.kind ?? "",
    amount,
    status: "PENDING",
    settleOn: extra.settleOn ?? null,
    createdAt: extra.createdAt ?? new Date("2026-11-21T02:00:00.000Z"),
  };
}

function buildHarness(options?: {
  entries?: Entry[];
  debts?: Record<string, number>;
  wallets?: Record<string, { balance: number; heldBalance: number }>;
  batch?: any;
  batchEntries?: Entry[];
  deductions?: { ownerId: string; ownerType: string; amount: number }[];
}) {
  const entries = options?.entries ?? [];
  const debts = options?.debts ?? {};
  const wallets = options?.wallets ?? {};
  const batchEntries = options?.batchEntries ?? [];
  const deductions = options?.deductions ?? [];

  const settlementRepo = {
    findAllPending: jest.fn(async () => entries),
    findPendingByPeriod: jest.fn(async () => entries),
    findBatchByPeriod: jest.fn(async () => null),
    findBatchById: jest.fn(async () => options?.batch ?? null),
    findEntriesByBatchId: jest.fn(async () => batchEntries),
    sumSettlementDeductionsByOwner: jest.fn(async () => deductions),
    saveBatch: jest.fn(async (b: any) => b),
    sumOpenClawback: jest.fn(
      async (ownerId: string, ownerType: string) =>
        debts[`${ownerType}:${ownerId}`] ?? 0,
    ),
    hasSettlementCredit: jest.fn(async () => false),
    markEntriesSettled: jest.fn(async () => undefined),
    insertEntries: jest.fn(async (x: any[]) => x),
  };

  const walletRepo = {
    findByOwner: jest.fn(async (ownerId: string, ownerType: string) => {
      const w = wallets[`${ownerType}:${ownerId}`];
      return w ? { ownerId, ownerType, ...w } : null;
    }),
  };

  return {
    service: new WalletService(walletRepo as any, settlementRepo as any),
    settlementRepo,
    walletRepo,
  };
}


describe("settleDaily({ dryRun }) — preview dùng cùng tập dòng với lô thật", () => {
  it("không period: dùng findAllPending (như cron 23:00), không lọc cửa sổ", async () => {
    // Dòng vừa được giải toả mang settleOn = 23:00 hôm nay = đúng biên `:end`.
    const settleOn = new Date("2026-11-21T16:00:00.000Z");
    const h = buildHarness({
      entries: [entry("e1", "MERCHANT", MERCHANT, 150000, { settleOn })],
    });

    const res = await h.service.settleDaily({
      dryRun: true,
      triggeredBy: "TEST",
    });

    expect(h.settlementRepo.findAllPending).toHaveBeenCalledTimes(1);
    expect(h.settlementRepo.findPendingByPeriod).not.toHaveBeenCalled();
    expect(res.status).toBe("DRY_RUN");
    expect(res.groups).toHaveLength(1);
    expect(res.groups[0].gross).toBe(150000);
  });

  it("có period tùy chỉnh: lọc đúng cửa sổ (recover ngày X)", async () => {
    const h = buildHarness({ entries: [] });

    await h.service.settleDaily({
      dryRun: true,
      periodStart: "2026-11-20T16:00:00.000Z",
      periodEnd: "2026-11-21T16:00:00.000Z",
    });

    expect(h.settlementRepo.findPendingByPeriod).toHaveBeenCalledWith(
      new Date("2026-11-20T16:00:00.000Z"),
      new Date("2026-11-21T16:00:00.000Z"),
    );
    expect(h.settlementRepo.findAllPending).not.toHaveBeenCalled();
  });

  it("chạy thật không period: cũng dùng findAllPending", async () => {
    const h = buildHarness({
      entries: [entry("e1", "MERCHANT", MERCHANT, 150000)],
    });
    jest
      .spyOn(h.service, "credit")
      .mockResolvedValue({ id: "tx-1", balance: 150000 } as any);

    const res = await h.service.settleDaily({ triggeredBy: "TEST" });

    expect(h.settlementRepo.findAllPending).toHaveBeenCalledTimes(1);
    expect(h.settlementRepo.findPendingByPeriod).not.toHaveBeenCalled();
    expect(h.settlementRepo.markEntriesSettled).toHaveBeenCalledWith(
      ["e1"],
      expect.any(String),
    );
    expect(res.status).toBe("SUCCESS");
  });
});

describe("preview — dự kiến thu hồi nợ clawback", () => {
  it("nhà hàng nợ 126.034, doanh thu 150.000, ví trống ⇒ thu đủ nợ, ròng 23.966", async () => {
    const h = buildHarness({
      entries: [
        entry("e1", "MERCHANT", MERCHANT, 100000),
        entry("e2", "MERCHANT", MERCHANT, 50000),
        entry("e3", "DRIVER", DRIVER, 34034),
      ],
      debts: { [`MERCHANT:${MERCHANT}`]: 126034 },
      wallets: {
        [`MERCHANT:${MERCHANT}`]: { balance: 0, heldBalance: 0 },
        [`DRIVER:${DRIVER}`]: { balance: 0, heldBalance: 0 },
      },
    });

    const res = await h.service.settleDaily({ dryRun: true });

    const merchant = res.groups.find((g: any) => g.ownerType === "MERCHANT");
    expect(merchant.gross).toBe(150000);
    expect(merchant.netCredit).toBe(150000);
    expect(merchant.openDebt).toBe(126034);
    expect(merchant.recovered).toBe(126034);
    expect(merchant.openDebtAfter).toBe(0);
    expect(merchant.netAfterRecovery).toBe(23966);

    const driver = res.groups.find((g: any) => g.ownerType === "DRIVER");
    expect(driver.recovered).toBe(0);
    expect(driver.netAfterRecovery).toBe(34034);

    expect(res.summary.totalGross).toBe(184034);
    expect(res.summary.totalRecovered).toBe(126034);
    expect(res.summary.netAfterRecovery).toBe(58000);
    // Lô 23:00 luôn thu hồi ngay với PARTIAL_ALWAYS, bất kể DEBT_RECOVERY_MODE.
    expect(res.summary.recoveryMode).toBe("PARTIAL_ALWAYS");
  });

  it("khả dụng sau credit nhỏ hơn nợ ⇒ chỉ thu phần khả dụng (tiền đang giữ bị bỏ qua)", async () => {
    const h = buildHarness({
      entries: [entry("e1", "MERCHANT", MERCHANT, 100000)],
      debts: { [`MERCHANT:${MERCHANT}`]: 126034 },
      // 10.000 đang giữ cho đơn COD chưa nộp ⇒ không được đụng vào.
      wallets: { [`MERCHANT:${MERCHANT}`]: { balance: 0, heldBalance: 10000 } },
    });

    const res = await h.service.settleDaily({ dryRun: true });

    expect(res.groups[0].recovered).toBe(90000);
    expect(res.groups[0].openDebtAfter).toBe(36034);
    expect(res.summary.totalRecovered).toBe(90000);
  });

  it("ví PLATFORM không bao giờ bị thu nợ", async () => {
    const h = buildHarness({
      entries: [entry("e1", "PLATFORM", PLATFORM, 61309)],
      debts: { [`PLATFORM:${PLATFORM}`]: 50000 },
    });

    const res = await h.service.settleDaily({ dryRun: true });

    expect(res.groups[0].recovered).toBe(0);
    expect(res.groups[0].openDebtAfter).toBe(50000);
    expect(h.walletRepo.findByOwner).not.toHaveBeenCalled();
    // Nền tảng không gánh nợ ⇒ dòng theo đơn không có "nợ còn lại".
    expect(res.orders[0].recovered).toBe(0);
    expect(res.orders[0].openDebtAfter).toBeNull();
    expect(res.summary.openDebtAfterTotal).toBe(0);
  });
});

describe("quyết toán — xem THEO ĐƠN (nhà hàng / tài xế / nền tảng / quỹ dự phòng)", () => {
  const t1 = new Date("2026-11-20T03:00:00.000Z");
  const t2 = new Date("2026-11-20T04:00:00.000Z");

  it("gom đủ 4 khoản của một đơn và phân bổ nợ về đơn cũ trước", async () => {
    const h = buildHarness({
      entries: [
        entry("e1", "MERCHANT", MERCHANT, 100000, {
          orderId: "order-1",
          kind: "MERCHANT_FOOD_REVENUE",
          createdAt: t1,
        }),
        entry("e2", "PLATFORM", PLATFORM, 6000, {
          orderId: "order-1",
          kind: "PLATFORM_COMMISSION",
          createdAt: t1,
        }),
        entry("e3", "PLATFORM", RESERVE, 2000, {
          orderId: "order-1",
          kind: "RESERVE_FUND_CONTRIBUTION",
          createdAt: t1,
        }),
        entry("e4", "DRIVER", DRIVER, 15000, {
          orderId: "order-1",
          kind: "DRIVER_SHIPPING_FEE",
          createdAt: t1,
        }),
        entry("e5", "MERCHANT", MERCHANT, 50000, {
          orderId: "order-2",
          kind: "MERCHANT_FOOD_REVENUE",
          createdAt: t2,
        }),
        entry("e6", "PLATFORM", PLATFORM, 3000, {
          orderId: "order-2",
          kind: "PLATFORM_COMMISSION",
          createdAt: t2,
        }),
        entry("e7", "DRIVER", DRIVER, 10000, {
          orderId: "order-2",
          kind: "DRIVER_SHIPPING_FEE",
          createdAt: t2,
        }),
      ],
      debts: { [`MERCHANT:${MERCHANT}`]: 126034 },
      wallets: { [`MERCHANT:${MERCHANT}`]: { balance: 0, heldBalance: 0 } },
    });

    const res = await h.service.settleDaily({ dryRun: true });

    // 1 dòng / đơn, xếp đơn cũ trước.
    expect(res.orders).toHaveLength(2);
    const [first, second] = res.orders;
    expect(first.orderId).toBe("order-1");
    expect(first.merchantId).toBe(MERCHANT);
    expect(first.driverId).toBe(DRIVER);
    expect(first.merchantAmount).toBe(100000);
    expect(first.driverAmount).toBe(15000);
    expect(first.platformAmount).toBe(6000);
    expect(first.reserveAmount).toBe(2000);
    expect(first.gross).toBe(123000);

    // Đơn cũ gánh nợ trước: 100.000, còn 26.034 dồn sang đơn sau.
    expect(first.merchantRecovered).toBe(100000);
    expect(first.recovered).toBe(100000);
    expect(first.openDebtAfter).toBe(26034);
    expect(second.merchantAmount).toBe(50000);
    expect(second.merchantRecovered).toBe(26034);
    expect(second.driverRecovered).toBe(0);
    expect(second.recovered).toBe(26034);
    expect(second.openDebtAfter).toBe(0);
    expect(second.hasOpenDebtAfter).toBe(false);

    // Bất biến: Σ "nợ đã thu" theo đơn = nợ thu hồi thật của lô.
    expect(res.orders.reduce((s: number, o: any) => s + o.recovered, 0)).toBe(
      res.summary.totalRecovered,
    );
    expect(res.summary.orderCount).toBe(2);
    expect(res.summary.openDebtAfterTotal).toBe(0);
  });

  it("lô chạy thật trả về cùng bảng theo đơn (số thật, không phải dự kiến)", async () => {
    const h = buildHarness({
      entries: [
        entry("e1", "MERCHANT", MERCHANT, 150000, {
          orderId: "order-1",
          kind: "MERCHANT_FOOD_REVENUE",
          createdAt: t1,
        }),
        entry("e2", "DRIVER", DRIVER, 34034, {
          orderId: "order-1",
          kind: "DRIVER_SHIPPING_FEE",
          createdAt: t1,
        }),
      ],
      debts: { [`MERCHANT:${MERCHANT}`]: 126034 },
    });
    jest.spyOn(h.service, "credit").mockImplementation(
      async (ownerId: string) =>
        ({
          id: `tx-${ownerId}`,
          balance: 23966,
          // Chỉ nhà hàng có nợ; tài xế không bị trừ.
          recovered: ownerId === MERCHANT ? 126034 : 0,
        }) as any,
    );

    const res = await h.service.settleDaily({ triggeredBy: "TEST" });

    expect(res.status).toBe("SUCCESS");
    expect(res.orders).toHaveLength(1);
    expect(res.orders[0].merchantAmount).toBe(150000);
    expect(res.orders[0].driverAmount).toBe(34034);
    expect(res.orders[0].merchantRecovered).toBe(126034);
    expect(res.orders[0].openDebtAfter).toBe(0);
    expect(res.summary.totalRecovered).toBe(126034);
    expect(res.summary.openDebtAfterTotal).toBe(0);
  });

  it("chi tiết lô lịch sử: dựng lại đơn đã settle + nợ đã thu thật", async () => {
    const h = buildHarness({
      batch: {
        id: "b-1",
        status: "SUCCESS",
        periodStart: t1,
        periodEnd: t2,
        totalDriverPayout: 34034,
        totalMerchantPayout: 150000,
        totalPlatformPayout: 18000,
        triggeredBy: "CRON",
        failureReason: null,
        createdAt: t2,
      },
      batchEntries: [
        entry("e1", "MERCHANT", MERCHANT, 150000, {
          orderId: "order-1",
          kind: "MERCHANT_FOOD_REVENUE",
          createdAt: t1,
        }),
        entry("e2", "DRIVER", DRIVER, 34034, {
          orderId: "order-1",
          kind: "DRIVER_SHIPPING_FEE",
          createdAt: t1,
        }),
      ],
      deductions: [
        { ownerId: MERCHANT, ownerType: "MERCHANT", amount: 100000 },
      ],
    });

    const res = await h.service.getSettlementBatchDetail("b-1");

    expect(res.orders).toHaveLength(1);
    expect(res.orders[0].merchantRecovered).toBe(100000);
    expect(res.orders[0].recovered).toBe(100000);
    // Xem lại lô cũ: không còn số nợ tại thời điểm đó.
    expect(res.orders[0].openDebtAfter).toBeNull();
    expect(res.summary.totalRecovered).toBe(100000);
    expect(res.summary.openDebtAfterTotal).toBeNull();
  });
});

