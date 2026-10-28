import { WalletService } from "../../modules/wallet/application/wallet.service";
import { OwnerType } from "../../modules/wallet/domain/owner-type.enum";

/**
 * Test hồi quy cho cơ chế THU HỒI NỢ TỰ ĐỘNG (auto clawback recovery):
 *  - Ví có nợ clawback: `available = balance - heldBalance` >= tổng nợ ⇒ trừ
 *    NGAY toàn bộ nợ (FIFO), không đợi quyết toán 23:00.
 *  - Chưa đủ ⇒ không trừ, nhưng phần tiền đang là nợ bị chặn rút/tiêu.
 *  - Không bao giờ đụng vào `heldBalance` (tiền COD khách đưa chưa nộp).
 *  - Không tạo tiền: DEBIT ở ví bên nợ = CREDIT ở PLATFORM_DEFAULT.
 */

type Wallet = {
  id: string;
  ownerId: string;
  ownerType: string;
  balance: number;
  heldBalance?: number;
};

type Tx = {
  id: string;
  ownerId: string;
  ownerType: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description?: string;
  referenceType?: string | null;
  referenceId?: string | null;
};

type Clawback = {
  id: string;
  ownerId: string;
  ownerType: string;
  sourceOrderId?: string | null;
  originalAmount: number;
  remainingAmount: number;
  status: string;
  settledAt?: Date | null;
  createdAt: Date;
};

const DRIVER = "driver-1";
const MERCHANT = "merchant-1";
const ORDER_OLD = "order-old";
const ORDER_NEW = "order-new";

function buildHarness() {
  const wallets = new Map<string, Wallet>();
  const txs: Tx[] = [];
  const clawbacks = new Map<string, Clawback>();
  const deductions: any[] = [];
  let entries: any[] = [];
  const batches = new Map<string, any>();
  let seq = 0;

  const keyOf = (ownerType: string, ownerId: string) =>
    `${ownerType}:${ownerId}`;

  const walletRepo = {
    findByOwnerOrCreate: jest.fn(async (ownerId: string, ownerType: string) => {
      const key = keyOf(ownerType, ownerId);
      let entity = wallets.get(key);
      if (!entity) {
        entity = {
          id: `w-${key}`,
          ownerId,
          ownerType,
          balance: 0,
          heldBalance: 0,
        };
        wallets.set(key, entity);
      }
      return { entity };
    }),
    save: jest.fn(async (entity: Wallet) => {
      wallets.set(keyOf(entity.ownerType, entity.ownerId), entity);
      return entity;
    }),
    findByOwner: jest.fn(
      async (ownerId: string, ownerType: string) =>
        wallets.get(keyOf(ownerType, ownerId)) ?? null,
    ),
    recordTransaction: jest.fn(async (tx: Tx) => {
      txs.push(tx);
      return tx;
    }),
    findTransactionByOwnerReference: jest.fn(
      async (
        ownerId: string,
        ownerType: string,
        referenceType: string,
        referenceId: string,
      ) =>
        txs.find(
          (t) =>
            t.ownerId === ownerId &&
            t.ownerType === ownerType &&
            t.referenceType === referenceType &&
            t.referenceId === referenceId,
        ) ?? null,
    ),
    countDailyWithdraws: jest.fn(async () => 0),
    findTransactionByReference: jest.fn(
      async (referenceType: string, referenceId: string) =>
        txs.find(
          (t) =>
            t.referenceType === referenceType && t.referenceId === referenceId,
        ) ?? null,
    ),
  };

  const openClawbacksOf = (ownerId: string, ownerType: string) =>
    [...clawbacks.values()]
      .filter(
        (c) =>
          c.ownerId === ownerId &&
          c.ownerType === ownerType &&
          (c.status === "OPEN" || c.status === "PARTIAL") &&
          Number(c.remainingAmount) > 0,
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const settlementRepo = {
    createClawback: jest.fn(async (data: any) => {
      const c: Clawback = {
        id: data.id,
        ownerId: data.ownerId,
        ownerType: data.ownerType,
        sourceOrderId: data.sourceOrderId ?? null,
        originalAmount: Number(data.originalAmount),
        remainingAmount: Number(data.remainingAmount),
        status: data.status ?? "OPEN",
        settledAt: null,
        createdAt: new Date(),
      };
      clawbacks.set(c.id, c);
      return c;
    }),
    sumOpenClawback: jest.fn(async (ownerId: string, ownerType: string) =>
      openClawbacksOf(ownerId, ownerType).reduce(
        (s, c) => s + Number(c.remainingAmount),
        0,
      ),
    ),
    findOpenClawbacks: jest.fn(async (ownerId: string, ownerType: string) =>
      openClawbacksOf(ownerId, ownerType),
    ),
    // Mô phỏng UPDATE ... WHERE "remainingAmount" >= take (chống double-spend).
    reduceClawback: jest.fn(async (id: string, amount: number) => {
      const c = clawbacks.get(id);
      if (!c || Number(c.remainingAmount) < amount) return null;
      c.remainingAmount = Number(c.remainingAmount) - amount;
      c.status = c.remainingAmount === 0 ? "SETTLED" : "PARTIAL";
      if (c.remainingAmount === 0) c.settledAt = new Date();
      return c.remainingAmount;
    }),
    recordDeduction: jest.fn(async (d: any) => {
      const dup = deductions.some(
        (x) =>
          x.clawbackId === d.clawbackId &&
          x.referenceType === d.referenceType &&
          x.referenceId === d.referenceId &&
          !!d.referenceId,
      );
      if (dup) {
        throw new Error(
          'duplicate key value violates unique constraint "UQ_clawback_deduction_ref"',
        );
      }
      deductions.push(d);
      return d;
    }),
    listOpenDebtOwners: jest.fn(async (limit: number) => {
      const grouped = new Map<
        string,
        { ownerId: string; ownerType: string; total: number }
      >();
      for (const c of [...clawbacks.values()].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      )) {
        if (!["OPEN", "PARTIAL"].includes(c.status)) continue;
        if (Number(c.remainingAmount) <= 0) continue;
        const k = keyOf(c.ownerType, c.ownerId);
        const g = grouped.get(k) ?? {
          ownerId: c.ownerId,
          ownerType: c.ownerType,
          total: 0,
        };
        g.total += Number(c.remainingAmount);
        grouped.set(k, g);
      }
      return [...grouped.values()].slice(0, limit);
    }),
    // settleDaily (regression: netting 23:00 vẫn chạy đúng)
    findBatchByPeriod: jest.fn(async (start: Date, end: Date) => {
      for (const b of batches.values()) {
        if (
          new Date(b.periodStart).getTime() === new Date(start).getTime() &&
          new Date(b.periodEnd).getTime() === new Date(end).getTime()
        ) {
          return b;
        }
      }
      return null;
    }),
    saveBatch: jest.fn(async (batch: any) => {
      const prev = batches.get(batch.id) ?? {};
      const merged = { ...prev, ...batch };
      batches.set(batch.id, merged);
      return merged;
    }),
    findAllPending: jest.fn(async () => entries),
    findPendingByPeriod: jest.fn(async () => entries),
    hasSettlementCredit: jest.fn(
      async (ownerId: string, ownerType: string, batchId: string) =>
        txs.some(
          (t) =>
            t.ownerId === ownerId &&
            t.ownerType === ownerType &&
            t.referenceType === "SETTLEMENT" &&
            t.referenceId === batchId,
        ),
    ),
    markEntriesSettled: jest.fn(async () => undefined),
  };

  const service = new WalletService(walletRepo as any, settlementRepo as any);

  return {
    service,
    txs,
    deductions,
    walletRepo,
    settlementRepo,
    balance: (ownerType: string, ownerId: string) =>
      Number(wallets.get(keyOf(ownerType, ownerId))?.balance ?? 0),
    held: (ownerType: string, ownerId: string) =>
      Number(wallets.get(keyOf(ownerType, ownerId))?.heldBalance ?? 0),
    setWallet: (
      ownerType: string,
      ownerId: string,
      balance: number,
      heldBalance = 0,
    ) => {
      const entity: Wallet = {
        id: `w-${keyOf(ownerType, ownerId)}`,
        ownerId,
        ownerType,
        balance,
        heldBalance,
      };
      wallets.set(keyOf(ownerType, ownerId), entity);
      return entity;
    },
    addClawback: (
      ownerType: string,
      ownerId: string,
      amount: number,
      opts?: { id?: string; sourceOrderId?: string; createdAt?: Date },
    ): Clawback => {
      seq += 1;
      const c: Clawback = {
        id: opts?.id ?? `cb-${seq}`,
        ownerId,
        ownerType,
        sourceOrderId: opts?.sourceOrderId ?? ORDER_OLD,
        originalAmount: amount,
        remainingAmount: amount,
        status: "OPEN",
        settledAt: null,
        createdAt: opts?.createdAt ?? new Date(Date.now() + seq),
      };
      clawbacks.set(c.id, c);
      return c;
    },
    allClawbacks: () => [...clawbacks.values()],
    txOfType: (type: string, referenceType?: string) =>
      txs.filter(
        (t) =>
          t.type === type &&
          (!referenceType || t.referenceType === referenceType),
      ),
    setSettlementEntries: (rows: any[]) => {
      entries = rows;
    },
  };
}

describe("WalletService — thu hồi nợ tự động (auto clawback recovery)", () => {
  beforeEach(() => {
    delete process.env.DEBT_RECOVERY_MODE;
    delete process.env.DEBT_RECOVERY_SWEEP_ENABLED;
  });

  it("chưa đủ tiền thì không trừ, đủ tiền thì trừ NGAY toàn bộ nợ trong một lần", async () => {
    const h = buildHarness();
    h.setWallet("DRIVER", DRIVER, 0);
    const debt = h.addClawback("DRIVER", DRIVER, 30000);

    // Lần 1: 20.000 < nợ 30.000 ⇒ giữ nguyên (chờ đủ).
    const first = await h.service.credit(
      DRIVER,
      OwnerType.DRIVER,
      20000,
      "Phí ship đơn #1",
      "SETTLEMENT",
      "tx-1",
    );
    expect(first.recovered).toBe(0);
    expect(first.debtRemaining).toBe(30000);
    expect(h.balance("DRIVER", DRIVER)).toBe(20000);
    expect(debt.status).toBe("OPEN");
    expect(h.deductions).toHaveLength(0);

    // Lần 2: khả dụng 40.000 >= 30.000 ⇒ trừ đủ 30.000 ngay.
    const second = await h.service.credit(
      DRIVER,
      OwnerType.DRIVER,
      20000,
      "Phí ship đơn #2",
      "SETTLEMENT",
      "tx-2",
    );
    expect(second.recovered).toBe(30000);
    expect(second.debtRemaining).toBe(0);
    expect(second.balance).toBe(10000);
    expect(h.balance("DRIVER", DRIVER)).toBe(10000);
    expect(debt.status).toBe("SETTLED");
    expect(debt.settledAt).toBeInstanceOf(Date);
    expect(h.deductions).toHaveLength(1);
    expect(h.deductions[0]).toMatchObject({
      clawbackId: debt.id,
      amount: 30000,
      source: "AUTO_CREDIT",
      referenceId: "tx-2",
    });

    // Nợ đã đóng ⇒ lần credit sau không trừ thêm.
    const third = await h.service.credit(
      DRIVER,
      OwnerType.DRIVER,
      5000,
      "Phí ship đơn #3",
      "SETTLEMENT",
      "tx-3",
    );
    expect(third.recovered).toBe(0);
    expect(h.balance("DRIVER", DRIVER)).toBe(15000);
  });

  it("FIFO: trừ khoản nợ cũ trước, ghi đủ 2 dòng clawback_deductions", async () => {
    const h = buildHarness();
    h.setWallet("MERCHANT", MERCHANT, 0);
    const oldDebt = h.addClawback("MERCHANT", MERCHANT, 10000, {
      sourceOrderId: ORDER_OLD,
    });
    const newDebt = h.addClawback("MERCHANT", MERCHANT, 25000, {
      sourceOrderId: ORDER_NEW,
    });

    const result = await h.service.credit(
      MERCHANT,
      OwnerType.MERCHANT,
      40000,
      "Doanh thu ngày",
      "SETTLEMENT",
      "batch-1",
    );

    expect(result.recovered).toBe(35000);
    expect(result.balance).toBe(5000);
    expect(oldDebt.status).toBe("SETTLED");
    expect(newDebt.status).toBe("SETTLED");
    expect(h.deductions.map((d) => d.clawbackId)).toEqual([
      oldDebt.id,
      newDebt.id,
    ]);
    expect(h.deductions.map((d) => d.amount)).toEqual([10000, 25000]);
  });

  it("không đụng tới heldBalance: chưa đủ khả dụng thì để nguyên", async () => {
    const h = buildHarness();
    // Ví đang giữ 10.000 tiền COD khách đưa.
    h.setWallet("DRIVER", DRIVER, 10000, 10000);
    const debt = h.addClawback("DRIVER", DRIVER, 30000);

    const result = await h.service.credit(
      DRIVER,
      OwnerType.DRIVER,
      25000,
      "Phí ship",
    );

    // balance 35.000 - held 10.000 = 25.000 < 30.000 ⇒ không trừ.
    expect(result.recovered).toBe(0);
    expect(result.debtRemaining).toBe(30000);
    expect(h.balance("DRIVER", DRIVER)).toBe(35000);
    expect(h.held("DRIVER", DRIVER)).toBe(10000);
    expect(debt.status).toBe("OPEN");
  });

  it("thu hồi chỉ lấy phần khả dụng, số dư không tụt dưới heldBalance", async () => {
    const h = buildHarness();
    h.setWallet("DRIVER", DRIVER, 10000, 10000);
    h.addClawback("DRIVER", DRIVER, 30000);

    const result = await h.service.credit(
      DRIVER,
      OwnerType.DRIVER,
      30000,
      "Phí ship",
    );

    // available = 40.000 - 10.000 = 30.000 = nợ ⇒ trừ đúng 30.000.
    expect(result.recovered).toBe(30000);
    expect(h.balance("DRIVER", DRIVER)).toBe(10000);
    expect(h.held("DRIVER", DRIVER)).toBe(10000);
    expect(h.balance("DRIVER", DRIVER) - h.held("DRIVER", DRIVER)).toBe(0);
  });

  it("DEBT_RECOVERY_MODE=PARTIAL_ALWAYS: trừ tối đa phần có thể, nợ còn lại PARTIAL", async () => {
    process.env.DEBT_RECOVERY_MODE = "PARTIAL_ALWAYS";
    const h = buildHarness();
    h.setWallet("MERCHANT", MERCHANT, 0);
    const debt = h.addClawback("MERCHANT", MERCHANT, 30000);

    const result = await h.service.credit(
      MERCHANT,
      OwnerType.MERCHANT,
      12000,
      "Doanh thu",
    );

    expect(result.recovered).toBe(12000);
    expect(result.debtRemaining).toBe(18000);
    expect(debt.status).toBe("PARTIAL");
    expect(h.balance("MERCHANT", MERCHANT)).toBe(0);
  });

  it("DEBT_RECOVERY_MODE=OFF: tắt thu hồi tự động, nợ chờ netting 23:00", async () => {
    process.env.DEBT_RECOVERY_MODE = "OFF";
    const h = buildHarness();
    h.setWallet("MERCHANT", MERCHANT, 0);
    const debt = h.addClawback("MERCHANT", MERCHANT, 30000);

    const result = await h.service.credit(
      MERCHANT,
      OwnerType.MERCHANT,
      50000,
      "Doanh thu",
    );

    expect(result.recovered).toBe(0);
    expect(h.balance("MERCHANT", MERCHANT)).toBe(50000);
    expect(debt.status).toBe("OPEN");
  });

  it("ví nền tảng không bao giờ bị thu hồi (tránh đệ quy/vòng lặp tiền)", async () => {
    const h = buildHarness();
    h.setWallet("PLATFORM", "PLATFORM_DEFAULT", 0);
    h.addClawback("PLATFORM", "PLATFORM_DEFAULT", 100000);

    const result = await h.service.credit(
      "PLATFORM_DEFAULT",
      OwnerType.PLATFORM,
      1000000,
      "Hoa hồng nền tảng",
    );

    expect(result.recovered).toBe(0);
    expect(h.balance("PLATFORM", "PLATFORM_DEFAULT")).toBe(1000000);
    expect(h.deductions).toHaveLength(0);
  });

  it("không tạo tiền: DEBIT CLAWBACK_RECOVERY = CREDIT DEBT_RECOVERY ở quỹ nền tảng", async () => {
    const h = buildHarness();
    h.setWallet("MERCHANT", MERCHANT, 0);
    h.addClawback("MERCHANT", MERCHANT, 35000);

    await h.service.credit(MERCHANT, OwnerType.MERCHANT, 50000, "Doanh thu");

    const debit = h
      .txOfType("DEBIT", "CLAWBACK_RECOVERY")
      .reduce((s, t) => s + Number(t.amount), 0);
    const platformCredit = h
      .txOfType("CREDIT", "DEBT_RECOVERY")
      .reduce((s, t) => s + Number(t.amount), 0);

    expect(debit).toBe(35000);
    expect(platformCredit).toBe(35000);
    expect(h.balance("PLATFORM", "PLATFORM_DEFAULT")).toBe(35000);

    // Invariant: balance = Σ CREDIT − Σ DEBIT cho ví bên nợ.
    const credits = h.txs
      .filter((t) => t.ownerId === MERCHANT && t.type === "CREDIT")
      .reduce((s, t) => s + Number(t.amount), 0);
    const debits = h.txs
      .filter((t) => t.ownerId === MERCHANT && t.type === "DEBIT")
      .reduce((s, t) => s + Number(t.amount), 0);
    expect(h.balance("MERCHANT", MERCHANT)).toBe(credits - debits);
  });

  it("cron sweep: thu hồi ví đã đủ tiền, báo lại ví chưa đủ", async () => {
    const h = buildHarness();
    h.setWallet("MERCHANT", MERCHANT, 50000);
    h.setWallet("DRIVER", DRIVER, 5000);
    const covered = h.addClawback("MERCHANT", MERCHANT, 30000);
    const uncovered = h.addClawback("DRIVER", DRIVER, 20000);

    const result = await h.service.recoverAllCoveredDebts();

    expect(result.scanned).toBe(2);
    expect(result.recovered).toBe(30000);
    expect(result.wallets).toHaveLength(1);
    expect(result.wallets[0].ownerId).toBe(MERCHANT);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        ownerId: DRIVER,
        total: 20000,
        reason: "NOT_COVERED",
      }),
    ]);
    expect(covered.status).toBe("SETTLED");
    expect(uncovered.status).toBe("OPEN");
    expect(h.deductions[0].source).toBe("AUTO_SWEEP");
    expect(h.balance("MERCHANT", MERCHANT)).toBe(20000);
    expect(h.balance("DRIVER", DRIVER)).toBe(5000);
  });

  it("chặn rút/tiêu phần tiền đang là nợ (debit, pay, orderAdjustment)", async () => {
    const h = buildHarness();
    h.setWallet("MERCHANT", MERCHANT, 200000);
    h.addClawback("MERCHANT", MERCHANT, 50000);

    // Rút 160.000 ⇒ còn 40.000 < nợ 50.000 ⇒ chặn.
    await expect(
      h.service.debit(MERCHANT, OwnerType.MERCHANT, 160000, "Rút tiền"),
    ).rejects.toThrow(/còn nợ/i);

    // Rút 150.000 ⇒ còn đúng 50.000 = nợ ⇒ cho phép.
    await h.service.debit(MERCHANT, OwnerType.MERCHANT, 150000, "Rút tiền");
    expect(h.balance("MERCHANT", MERCHANT)).toBe(50000);

    // pay(): tiêu vào phần nợ ⇒ chặn.
    await expect(
      h.service.pay(MERCHANT, OwnerType.MERCHANT, 30000, ORDER_NEW),
    ).rejects.toThrow(/còn nợ/i);

    h.setWallet("MERCHANT", MERCHANT, 100000);
    await expect(
      h.service.adjustOrderAmount({
        adjustmentId: "adj-1",
        ownerId: MERCHANT,
        ownerType: OwnerType.MERCHANT,
        direction: "CHARGE",
        amount: 60000,
        orderId: ORDER_NEW,
      }),
    ).rejects.toThrow(/còn nợ/i);
  });

  it("penaltyDebit không ăn vào heldBalance: phần thiếu chuyển thành nợ clawback", async () => {
    const h = buildHarness();
    h.setWallet("DRIVER", DRIVER, 150000, 150000);

    const res = await h.service.penaltyDebit(
      DRIVER,
      OwnerType.DRIVER,
      50000,
      "Phạt vi phạm",
      { referenceType: "FAILURE_FINE", referenceId: ORDER_NEW },
    );

    expect(res.platformCredit).toBe(0);
    expect(res.clawback).toBe(50000);
    expect(h.balance("DRIVER", DRIVER)).toBe(150000);
    expect(h.balance("PLATFORM", "PLATFORM_DEFAULT")).toBe(0);
    expect(h.allClawbacks()).toHaveLength(1);
  });

  it("regression 23:00: quyết toán trả đủ doanh thu, nợ thu hồi ở bút toán riêng", async () => {
    const h = buildHarness();
    h.setWallet("MERCHANT", MERCHANT, 0);
    const debt = h.addClawback("MERCHANT", MERCHANT, 30000);
    h.setSettlementEntries([
      {
        id: "e1",
        orderId: ORDER_OLD,
        ownerId: MERCHANT,
        ownerType: "MERCHANT",
        amount: 100000,
        kind: "MERCHANT_FOOD_REVENUE",
        status: "PENDING",
      },
    ]);

    const result = await h.service.settleDaily({ triggeredBy: "TEST" });

    // Quyết toán trả ĐỦ doanh thu: không khấu trừ nợ trong lô.
    expect(result.summary.totalClawback).toBe(0);
    expect(result.summary.totalCredit).toBe(100000);
    expect(result.groups[0].clawback).toBe(0);
    expect(result.groups[0].netCredit).toBe(100000);

    // Nợ được thu hồi ngay sau credit() bằng BÚT TOÁN RIÊNG (CLAWBACK_RECOVERY).
    expect(result.summary.totalRecovered).toBe(30000);
    expect(h.balance("MERCHANT", MERCHANT)).toBe(70000);
    expect(debt.status).toBe("SETTLED");
    const recovery = h.txOfType("DEBIT", "CLAWBACK_RECOVERY");
    expect(recovery).toHaveLength(1);
    expect(recovery[0].amount).toBe(30000);
    expect(h.deductions).toHaveLength(1);
    expect(h.deductions[0]).toMatchObject({
      source: "AUTO_CREDIT",
      referenceType: "SETTLEMENT",
      amount: 30000,
    });
  });

  it("regression 23:00 (nợ LỚN HƠN doanh thu): vẫn khấu trừ tối đa phần vừa trả, không cho bên nợ vay tiền", async () => {
    const h = buildHarness();
    // Đúng ca thật: nhà hàng nợ 194.006 (hoàn khách 184.848 + bồi thường tài xế
    // 9.158) nhưng lô 23:00 chỉ trả 127.500 tiền món. Chế độ mặc định
    // FULL_WHEN_COVERED sẽ bỏ qua ⇒ nhà hàng giữ tiền và nền tảng thành chủ nợ
    // treo. Lô quyết toán phải khấu trừ phần vừa trả.
    h.setWallet("MERCHANT", MERCHANT, 0);
    const debt = h.addClawback("MERCHANT", MERCHANT, 194006);
    h.setSettlementEntries([
      {
        id: "e1",
        orderId: ORDER_OLD,
        ownerId: MERCHANT,
        ownerType: "MERCHANT",
        amount: 127500,
        kind: "MERCHANT_FOOD_REVENUE",
        status: "PENDING",
      },
    ]);

    const result = await h.service.settleDaily({ triggeredBy: "TEST" });

    // Vẫn ghi nhận doanh thu đầy đủ (sổ doanh thu minh bạch)...
    expect(result.summary.totalCredit).toBe(127500);
    // ...nhưng tiền vừa vào ví bị trừ ngay vào nợ.
    expect(result.summary.totalRecovered).toBe(127500);
    expect(h.balance("MERCHANT", MERCHANT)).toBe(0);
    expect(debt.remainingAmount).toBe(194006 - 127500);
    expect(debt.status).toBe("PARTIAL");
    expect(h.deductions).toHaveLength(1);
    expect(h.deductions[0]).toMatchObject({
      source: "AUTO_CREDIT",
      amount: 127500,
    });
  });

  it("getOpenClawback cho biết ví đã đủ tiền thu hồi hay chưa", async () => {
    const h = buildHarness();
    h.setWallet("MERCHANT", MERCHANT, 40000);
    h.addClawback("MERCHANT", MERCHANT, 30000);

    const covered = await h.service.getOpenClawback(MERCHANT, "MERCHANT");
    expect(covered.canRecoverNow).toBe(true);
    expect(covered.availableBalance).toBe(40000);
    expect(covered.totalOpenClawback).toBe(30000);

    h.setWallet("MERCHANT", MERCHANT, 20000);
    const notCovered = await h.service.getOpenClawback(MERCHANT, "MERCHANT");
    expect(notCovered.canRecoverNow).toBe(false);
    expect(notCovered.totalOpenClawback).toBe(30000);
  });
});
