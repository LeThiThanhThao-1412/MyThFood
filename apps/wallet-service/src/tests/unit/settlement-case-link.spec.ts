import { WalletService } from "../../modules/wallet/application/wallet.service";
import { SettlementRepository } from "../../modules/wallet/infrastructure/settlement.repository";

/**
 * Dòng doanh thu bị giữ vì khiếu nại phải **vào được lô quyết toán 23:00**.
 *
 * Lỗi gốc: `settlement_entries` không có dấu vết case (`caseId`) và không có
 * ngày quyết toán riêng (`settleOn`). Dòng bị HELD_BY_DISPUTE lâu ngày mang
 * `deliveredAt` rất cũ nên lô chạy tay/dry-run lọc theo `deliveredAt` bỏ sót —
 * nhà hàng/tài xế không bao giờ nhận được tiền dù case đã kết thúc.
 *
 * Bất biến được khoá ở đây:
 *  1. `releaseSettlement` đóng dấu `settleOn` = **23:00 giờ VN của ngày phán
 *     quyết**, và không bao giờ để trống.
 *  2. Cửa sổ quyết toán dùng `COALESCE(settleOn, deliveredAt, createdAt)`.
 *  3. `holdSettlement` đóng `caseId` để biết tiền bị giữ vì vụ việc nào.
 */

function makeEntryRepo() {
  const calls: {
    set: any[];
    where: any[];
    andWhere: any[];
  } = { set: [], where: [], andWhere: [] };

  const builder: any = {
    update: () => builder,
    set: (value: any) => {
      calls.set.push(value);
      return builder;
    },
    where: (sql: string, params?: any) => {
      calls.where.push([sql, params]);
      return builder;
    },
    andWhere: (sql: string, params?: any) => {
      calls.andWhere.push([sql, params]);
      return builder;
    },
    orderBy: () => builder,
    whereInIds: () => builder,
    execute: async () => ({ affected: 2 }),
    getMany: async () => [],
  };

  return {
    calls,
    repo: new SettlementRepository(
      { createQueryBuilder: () => builder } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    ),
  };
}

function makeWalletService() {
  const settlementRepo = {
    holdByOrderId: jest.fn(async () => 3),
    releaseByOrderId: jest.fn(async () => 3),
  };
  return {
    settlementRepo,
    service: new WalletService({} as any, settlementRepo as any),
  };
}

describe("SettlementRepository — dấu vết case trên dòng escrow", () => {
  it("releaseByOrderId đóng status PENDING + caseId + settleOn", async () => {
    const { repo, calls } = makeEntryRepo();
    const settleOn = new Date("2026-10-27T16:00:00.000Z");

    const affected = await repo.releaseByOrderId("order-1", {
      caseId: "case-1",
      settleOn,
    });

    expect(affected).toBe(2);
    expect(calls.set[0]).toEqual({
      status: "PENDING",
      caseId: "case-1",
      settleOn,
    });
    // Chỉ mở khoá dòng đang bị giữ ⇒ gọi lặp không thể trả tiền hai lần.
    expect(calls.where[0][1]).toEqual({
      orderId: "order-1",
      status: "HELD_BY_DISPUTE",
    });
  });

  it("releaseByOrderId không truyền settleOn: vẫn đóng dấu thời điểm hiện tại", async () => {
    const { repo, calls } = makeEntryRepo();

    await repo.releaseByOrderId("order-1");

    expect(calls.set[0].status).toBe("PENDING");
    expect(calls.set[0].settleOn).toBeInstanceOf(Date);
    expect(calls.set[0].caseId).toBeUndefined();
  });

  it("holdByOrderId đóng caseId để biết tiền bị giữ vì vụ việc nào", async () => {
    const { repo, calls } = makeEntryRepo();

    await repo.holdByOrderId("order-1", { caseId: "case-9" });

    expect(calls.set[0]).toEqual({
      status: "HELD_BY_DISPUTE",
      caseId: "case-9",
    });
  });

  it("findPendingByPeriod lọc theo COALESCE(settleOn, deliveredAt, createdAt)", async () => {
    const { repo, calls } = makeEntryRepo();

    await repo.findPendingByPeriod(
      new Date("2026-10-26T16:00:00.000Z"),
      new Date("2026-10-27T16:00:00.000Z"),
    );

    const sql = calls.andWhere.map((c) => c[0]).join(" | ");
    expect(sql).toContain(
      'COALESCE(e."settleOn", e."deliveredAt", e."createdAt")',
    );
    // Dòng bị giữ rồi mở khoá vẫn phải nằm trong cửa sổ của ngày phán quyết.
    expect(sql.match(/COALESCE/g)?.length).toBe(2);
  });
});

describe("WalletService.releaseSettlement — 23:00 ngày phán quyết", () => {
  it("case chốt lúc 01:00 sáng 27/10 (giờ VN) ⇒ settleOn = 23:00 ngày 27/10", async () => {
    const { service, settlementRepo } = makeWalletService();
    // 27/10/2026 01:00 giờ VN = 26/10/2026 18:00 UTC
    const resolvedAt = new Date("2026-10-26T18:00:00.000Z");

    const res = await service.releaseSettlement("order-1", {
      caseId: "case-1",
      resolvedAt,
    });

    expect(res.settleOn.toISOString()).toBe("2026-10-27T16:00:00.000Z");
    expect(settlementRepo.releaseByOrderId).toHaveBeenCalledWith("order-1", {
      caseId: "case-1",
      settleOn: new Date("2026-10-27T16:00:00.000Z"),
    });
  });

  it("case chốt lúc 20:00 ngày 26/10 (giờ VN) ⇒ settleOn = 23:00 ngày 26/10", async () => {
    const { service } = makeWalletService();
    // 26/10/2026 20:00 giờ VN = 26/10/2026 13:00 UTC
    const res = await service.releaseSettlement("order-1", {
      resolvedAt: new Date("2026-10-26T13:00:00.000Z"),
    });

    expect(res.settleOn.toISOString()).toBe("2026-10-26T16:00:00.000Z");
  });

  it("không truyền resolvedAt: vẫn đóng dấu ngày hôm nay (không bỏ trống)", async () => {
    const { service } = makeWalletService();

    const res = await service.releaseSettlement("order-1");

    expect(res.settleOn).toBeInstanceOf(Date);
    // Mốc 23:00 giờ VN = 16:00 UTC.
    expect(res.settleOn.getUTCHours()).toBe(16);
    expect(res.settleOn.getUTCMinutes()).toBe(0);
  });

  it("holdSettlement truyền caseId xuống repository", async () => {
    const { service, settlementRepo } = makeWalletService();

    const res = await service.holdSettlement("order-1", { caseId: "case-1" });

    expect(res.held).toBe(3);
    expect(settlementRepo.holdByOrderId).toHaveBeenCalledWith("order-1", {
      caseId: "case-1",
    });
  });
});
