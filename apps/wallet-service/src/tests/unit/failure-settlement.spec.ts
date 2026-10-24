import { WalletService } from "../../modules/wallet/application/wallet.service";

/**
 * Test hồi quy cho luồng route tiền khi đơn giao thất bại (VALID):
 *  - Merchant fault: khách được hoàn 100%, tài xế chỉ được bồi thường phần NET
 *    (không phải full phí ship), tiền món của nhà hàng VẪN được quyết toán như
 *    thu nhập bình thường (chỉ VOID dòng phí ship của tài xế).
 *  - Nợ của nhà hàng được KÊ THÀNH 2 DÒNG có nhãn: CUSTOMER_REFUND (hoàn tiền
 *    khách) + DRIVER_COMPENSATION (bồi thường tài xế), không còn "phạt" 20.000đ.
 *  - Idempotent: gọi settleFailure nhiều lần (4 call-site fire-and-forget)
 *    không sinh thêm bút toán.
 *  - Không tạo tiền: tổng debit = tổng credit ở quỹ nền tảng.
 */

type Entry = {
  id: string;
  orderId: string;
  ownerId: string;
  ownerType: string;
  amount: number;
  kind: string;
  status: string;
};

type Tx = {
  ownerId: string;
  ownerType: string;
  type: string;
  amount: number;
  referenceType?: string | null;
  referenceId?: string | null;
  description?: string | null;
};

function buildHarness() {
  const wallets = new Map<
    string,
    { id: string; ownerId: string; ownerType: string; balance: number }
  >();
  const txs: Tx[] = [];
  const clawbacks: any[] = [];
  const settlements = new Map<string, any>();
  let entries: Entry[] = [];

  const walletRepo = {
    findByOwnerOrCreate: jest.fn(async (ownerId: string, ownerType: string) => {
      const key = `${ownerType}:${ownerId}`;
      let entity = wallets.get(key);
      if (!entity) {
        entity = { id: `w-${key}`, ownerId, ownerType, balance: 0 };
        wallets.set(key, entity);
      }
      return { entity };
    }),
    save: jest.fn(async (entity: any) => {
      wallets.set(`${entity.ownerType}:${entity.ownerId}`, entity);
      return entity;
    }),
    recordTransaction: jest.fn(async (tx: any) => {
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
  };

  const settlementRepo = {
    findEntriesByOrderId: jest.fn(async () => entries),
    releaseEntriesByOrderId: jest.fn(
      async (_orderId: string, kinds: string[]) => {
        let n = 0;
        for (const e of entries) {
          if (kinds.includes(e.kind) && e.status === "HELD_BY_DISPUTE") {
            e.status = "PENDING";
            n++;
          }
        }
        return n;
      },
    ),
    voidEntriesByOrderId: jest.fn(async (_orderId: string, kinds: string[]) => {
      let n = 0;
      for (const e of entries) {
        if (
          kinds.includes(e.kind) &&
          (e.status === "PENDING" || e.status === "HELD_BY_DISPUTE")
        ) {
          e.status = "VOID";
          n++;
        }
      }
      return n;
    }),
    createClawback: jest.fn(async (data: any) => {
      clawbacks.push(data);
      return data;
    }),
    claimFailureSettlement: jest.fn(async (data: any) => {
      if (settlements.has(data.orderId)) return false;
      settlements.set(data.orderId, { ...data });
      return true;
    }),
    findFailureSettlement: jest.fn(
      async (orderId: string) => settlements.get(orderId) ?? null,
    ),
    completeFailureSettlement: jest.fn(async (orderId: string, patch: any) => {
      settlements.set(orderId, { ...settlements.get(orderId), ...patch });
    }),
    releaseFailureSettlementClaim: jest.fn(async (orderId: string) => {
      settlements.delete(orderId);
    }),
    // FIX DEBT-RECOVERY: credit() giờ gọi bước thu hồi nợ ⇒ harness cần các
    // hàm này. Mặc định "không có nợ" để giữ nguyên kỳ vọng cũ.
    sumOpenClawback: jest.fn(async () => 0),
    findOpenClawbacks: jest.fn(async () => []),
    reduceClawback: jest.fn(async () => null),
    recordDeduction: jest.fn(async (d: any) => d),
    listOpenDebtOwners: jest.fn(async () => []),
  };

  const service = new WalletService(walletRepo as any, settlementRepo as any);

  const balance = (ownerType: string, ownerId: string) =>
    Number(wallets.get(`${ownerType}:${ownerId}`)?.balance ?? 0);

  return {
    service,
    txs,
    clawbacks,
    balance,
    setEntries: (rows: Entry[]) => {
      entries = rows;
    },
    getEntries: () => entries,
  };
}

const ORDER_ID = "ac5a4c5e-3b88-41f5-b83d-89362255e981";
const CONSUMER = "consumer-1";
const MERCHANT = "merchant-1";
const DRIVER = "driver-1";

// Escrow thật của đơn ac5a4c5e (101.864đ): nhà hàng 48.750, tài xế 24.131,
// hoa hồng nền tảng 28.473, trích quỹ dự phòng 510.
const escrow = (): Entry[] => [
  {
    id: "e1",
    orderId: ORDER_ID,
    ownerId: MERCHANT,
    ownerType: "MERCHANT",
    amount: 48750,
    kind: "MERCHANT_FOOD_REVENUE",
    status: "HELD_BY_DISPUTE",
  },
  {
    id: "e2",
    orderId: ORDER_ID,
    ownerId: DRIVER,
    ownerType: "DRIVER",
    amount: 24131,
    kind: "DRIVER_SHIPPING_FEE",
    status: "HELD_BY_DISPUTE",
  },
  {
    id: "e3",
    orderId: ORDER_ID,
    ownerId: "PLATFORM_DEFAULT",
    ownerType: "PLATFORM",
    amount: 28473,
    kind: "PLATFORM_COMMISSION",
    status: "HELD_BY_DISPUTE",
  },
  {
    id: "e4",
    orderId: ORDER_ID,
    ownerId: "RESERVE_FUND",
    ownerType: "PLATFORM",
    amount: 510,
    kind: "RESERVE_FUND_CONTRIBUTION",
    status: "HELD_BY_DISPUTE",
  },
];

const baseInput = {
  orderId: ORDER_ID,
  severity: "LOW",
  isOnline: true,
  consumerId: CONSUMER,
  merchantId: MERCHANT,
  driverId: DRIVER,
  total: 101864,
  foodTotal: 70000,
  shippingFee: 30164,
  fine: 0,
};

describe("WalletService.settleFailure (đơn giao thất bại - VALID)", () => {
  beforeEach(() => {
    process.env.DRIVER_COMMISSION_PERCENT = "20";
    process.env.MERCHANT_COMMISSION_PERCENT = "30";
  });

  it("MERCHANT fault: hoàn khách 100%, bồi thường tài xế phần NET, giữ tiền món cho nhà hàng", async () => {
    const h = buildHarness();
    h.setEntries(escrow());

    const result = await h.service.settleFailure({
      ...baseInput,
      faultParty: "MERCHANT",
    });

    // Khách được hoàn đủ 100% đơn.
    expect(result.refundAmount).toBe(101864);
    expect(h.balance("CONSUMER", CONSUMER)).toBe(101864);

    // Tài xế chỉ nhận phần net (24.131), KHÔNG phải full phí ship (30.164).
    expect(result.driverCompensation).toBe(24131);
    expect(h.balance("DRIVER", DRIVER)).toBe(24131);

    // Nợ được KÊ THÀNH 2 DÒNG có nhãn: hoàn tiền khách + bồi thường tài xế.
    expect(h.clawbacks).toHaveLength(2);
    const byCat = new Map(
      h.clawbacks.map((c) => [c.category, Number(c.remainingAmount)]),
    );
    expect(byCat.get("CUSTOMER_REFUND")).toBe(101864);
    expect(byCat.get("DRIVER_COMPENSATION")).toBe(24131);
    expect(h.clawbacks.every((c) => !!c.description)).toBe(true);

    // Ví rỗng ⇒ chưa thu được đồng nào; toàn bộ 125.995 là nợ (không double-count).
    expect(result.merchantDebit).toBe(0);
    expect(result.merchantClawback).toBe(101864 + 24131);

    // Escrow: chỉ huỷ phí ship của tài xế; tiền món + hoa hồng + trích quỹ được
    // giải toả (→ PENDING) để quyết toán 23:00 trả doanh thu như bình thường.
    expect(result.escrowVoided).toBe(1);
    expect(result.escrowReleased).toBe(3);
    const entryStatus = (id: string) =>
      h.getEntries().find((e) => e.id === id)?.status;
    expect(entryStatus("e1")).toBe("PENDING"); // MERCHANT_FOOD_REVENUE
    expect(entryStatus("e2")).toBe("VOID"); // DRIVER_SHIPPING_FEE
    expect(entryStatus("e3")).toBe("PENDING"); // PLATFORM_COMMISSION
    expect(entryStatus("e4")).toBe("PENDING"); // RESERVE_FUND_CONTRIBUTION

    // Không khoản nào "bốc hơi": không có credit mồ côi cho nhà hàng.
    expect(h.balance("MERCHANT", MERCHANT)).toBe(0);
    expect(result.platformFunding).toBe(0);
  });

  it("MERCHANT fault: KHÔNG còn phạt tiền — fine luôn 0, nợ chỉ gồm 2 dòng đã kê", async () => {
    const h = buildHarness();
    h.setEntries(escrow());

    const result = await h.service.settleFailure({
      ...baseInput,
      faultParty: "MERCHANT",
      severity: "HIGH",
      // Client cũ vẫn có thể gửi `fine` — wallet-service phải bỏ qua.
      fine: 25000,
    });

    expect(result.fine).toBe(0);
    expect(h.txs.some((t) => t.referenceType === "FAILURE_FINE")).toBe(false);
    const totalDebt = h.clawbacks.reduce(
      (s, c) => s + Number(c.remainingAmount),
      0,
    );
    // 101.864 hoàn khách + 24.131 bồi thường tài xế = 125.995 (không có phạt).
    expect(totalDebt).toBe(101864 + 24131);
  });

  it("idempotent: gọi lại không sinh thêm bút toán hay clawback", async () => {
    const h = buildHarness();
    h.setEntries(escrow());

    const first = await h.service.settleFailure({
      ...baseInput,
      faultParty: "MERCHANT",
    });
    const txCountAfterFirst = h.txs.length;
    const clawbackCountAfterFirst = h.clawbacks.length;

    const second = await h.service.settleFailure({
      ...baseInput,
      faultParty: "MERCHANT",
    });

    expect(first.duplicated).toBe(false);
    expect(second.duplicated).toBe(true);
    expect(h.txs.length).toBe(txCountAfterFirst);
    expect(h.clawbacks.length).toBe(clawbackCountAfterFirst);
    expect(h.balance("CONSUMER", CONSUMER)).toBe(101864);
  });

  it("DRIVER fault: khách được hoàn, nhà hàng vẫn nhận tiền món, escrow bị vô hiệu", async () => {
    const h = buildHarness();
    h.setEntries(escrow());

    const result = await h.service.settleFailure({
      ...baseInput,
      faultParty: "DRIVER",
    });

    expect(result.refundAmount).toBe(101864);
    expect(h.balance("CONSUMER", CONSUMER)).toBe(101864);
    // Nhà hàng vô can → nhận đúng phần net của mình.
    expect(h.balance("MERCHANT", MERCHANT)).toBe(48750);
    expect(result.escrowVoided).toBe(4);
    expect(h.getEntries().every((e) => e.status === "VOID")).toBe(true);
  });

  it("CUSTOMER fault (online): không hoàn tiền, escrow được giải tỏa để trả đủ các bên", async () => {
    const h = buildHarness();
    h.setEntries(escrow());

    const result = await h.service.settleFailure({
      ...baseInput,
      faultParty: "CUSTOMER",
    });

    expect(result.refundAmount).toBe(0);
    expect(result.escrowReleased).toBe(4);
    expect(h.getEntries().every((e) => e.status === "PENDING")).toBe(true);
    expect(h.txs).toHaveLength(0);
  });

  it("không tạo tiền: mọi khoản debit đều có credit tương ứng ở quỹ nền tảng", async () => {
    const h = buildHarness();
    h.setEntries(escrow());

    await h.service.settleFailure({
      ...baseInput,
      faultParty: "MERCHANT",
      fine: 10000,
    });

    const debits = h.txs
      .filter((t) => t.type === "DEBIT")
      .reduce((s, t) => s + Number(t.amount), 0);
    const platformCredits = h.txs
      .filter((t) => t.type === "CREDIT" && t.ownerId === "PLATFORM_DEFAULT")
      .reduce((s, t) => s + Number(t.amount), 0);

    expect(debits).toBe(platformCredits);
  });
});
