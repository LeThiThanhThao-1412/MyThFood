import { WalletService } from "../../modules/wallet/application/wallet.service";

/**
 * Test hồi quy cho luồng BỒI THƯỜNG PHÍ SHIP (đơn ĐÃ giao xong, case VALID).
 *
 * Bối cảnh: đơn #883f25a8 giao sớm hơn cam kết nhưng vẫn có case DELIVERY_LATE
 * được xử VALID/DRIVER. Trước đây resolution-service gọi `settle-failure-money`
 * (luồng đơn giao thất bại) nên:
 *   - khách được hoàn 100% giá trị đơn (93.262đ),
 *   - tài xế chỉ bị trừ phần NET (69.990đ),
 *   - chênh lệch (hoa hồng + phí dịch vụ) do nền tảng âm thầm chịu.
 *
 * Bất biến của luồng mới (`settleCaseCompensation`):
 *   1. Khách nhận đúng `amount` = 100% phí ship.
 *   2. Bên lỗi bị trừ đúng `amount` (thiếu tiền ⇒ phần còn lại thành clawback),
 *      nên `amount === charged + clawback`.
 *   3. KHÔNG đụng escrow của đơn (nhà hàng/tài xế vẫn được quyết toán lúc 23:00).
 *   4. Idempotent theo orderId (resolution-service gọi fire-and-forget có retry).
 */

type Tx = {
  ownerId: string;
  ownerType: string;
  type: string;
  amount: number;
  referenceType?: string | null;
  referenceId?: string | null;
  description?: string | null;
};

function buildHarness(
  opts: {
    /** Số dư ban đầu theo khoá `OWNER_TYPE:ownerId`. */
    balances?: Record<string, number>;
    /** Đơn đã quyết toán theo luồng giao thất bại? */
    settledFailure?: any;
  } = {},
) {
  const wallets = new Map<
    string,
    {
      id: string;
      ownerId: string;
      ownerType: string;
      balance: number;
      heldBalance: number;
    }
  >();
  for (const [key, balance] of Object.entries(opts.balances ?? {})) {
    const [ownerType, ownerId] = key.split(":");
    wallets.set(key, {
      id: `w-${key}`,
      ownerId,
      ownerType,
      balance,
      heldBalance: 0,
    });
  }

  const txs: Tx[] = [];
  const clawbacks: any[] = [];

  const walletRepo = {
    findByOwnerOrCreate: jest.fn(async (ownerId: string, ownerType: string) => {
      const key = `${ownerType}:${ownerId}`;
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
    findByOwner: jest.fn(
      async (ownerId: string, ownerType: string) =>
        wallets.get(`${ownerType}:${ownerId}`) ?? null,
    ),
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
    // Đơn #883f25a8 đã giao xong ⇒ chưa có failure settlement.
    findFailureSettlement: jest.fn(
      async (_orderId: string) => opts.settledFailure ?? null,
    ),
    findEntriesByOrderId: jest.fn(async () => []),
    releaseEntriesByOrderId: jest.fn(async () => 0),
    voidEntriesByOrderId: jest.fn(async () => 0),
    createClawback: jest.fn(async (data: any) => {
      clawbacks.push(data);
      return data;
    }),
    sumOpenClawback: jest.fn(async () => 0),
    findOpenClawbacks: jest.fn(async () => []),
    reduceClawback: jest.fn(async () => null),
    recordDeduction: jest.fn(async (d: any) => d),
    listOpenDebtOwners: jest.fn(async () => []),
  };

  const service = new WalletService(walletRepo as any, settlementRepo as any);

  return {
    service,
    txs,
    clawbacks,
    settlementRepo,
    balance: (ownerType: string, ownerId: string) =>
      Number(wallets.get(`${ownerType}:${ownerId}`)?.balance ?? 0),
  };
}

const ORDER_ID = "883f25a8-4c1e-4a0e-9d5f-2b6f0b3c9a11";
const CONSUMER = "consumer-1";
const MERCHANT = "merchant-1";
const DRIVER = "driver-1";

// Đơn #883f25a8: khách trả 93.262đ, phí ship 21.862đ.
const TOTAL = 93262;
const SHIP_FEE = 21862;

const baseInput = {
  orderId: ORDER_ID,
  caseId: "case-883f25a8",
  category: "DELIVERY_LATE",
  creditorId: CONSUMER,
  creditorType: "CONSUMER",
  debtorId: DRIVER,
  debtorType: "DRIVER",
  amount: SHIP_FEE,
};

describe("WalletService.settleCaseCompensation — bồi thường phí ship", () => {
  it("giao trễ (đơn đã giao): hoàn đúng phí ship, trừ tài xế đúng số đó, không đụng escrow", async () => {
    const h = buildHarness({ balances: { [`DRIVER:${DRIVER}`]: 69990 } });

    const result = await h.service.settleCaseCompensation({ ...baseInput });

    expect(result.skipped).toBeNull();
    expect(result.duplicated).toBe(false);

    // Khách nhận đúng phí ship — KHÔNG phải 100% giá trị đơn.
    expect(result.amount).toBe(SHIP_FEE);
    expect(result.amount).toBeLessThan(TOTAL);
    expect(h.balance("CONSUMER", CONSUMER)).toBe(SHIP_FEE);

    // Tài xế chịu đúng số khách nhận.
    expect(result.charged).toBe(SHIP_FEE);
    expect(result.clawback).toBe(0);
    expect(h.balance("DRIVER", DRIVER)).toBe(69990 - SHIP_FEE);

    // Không tạo/không xoá dòng escrow nào của đơn.
    expect(h.settlementRepo.releaseEntriesByOrderId).not.toHaveBeenCalled();
    expect(h.settlementRepo.voidEntriesByOrderId).not.toHaveBeenCalled();

    // Nhà hàng không bị ảnh hưởng.
    expect(h.balance("MERCHANT", MERCHANT)).toBe(0);

    // Bất biến: khách nhận = bên lỗi chịu (kể cả phần ghi nợ).
    expect(result.amount).toBe(result.charged + result.clawback);
  });

  it("ví tài xế không đủ: vẫn trả đủ khách, phần thiếu thành clawback CUSTOMER_COMPENSATION", async () => {
    const h = buildHarness({ balances: { [`DRIVER:${DRIVER}`]: 5000 } });

    const result = await h.service.settleCaseCompensation({ ...baseInput });

    expect(result.amount).toBe(SHIP_FEE);
    expect(result.charged).toBe(5000);
    expect(result.clawback).toBe(SHIP_FEE - 5000);
    expect(h.balance("CONSUMER", CONSUMER)).toBe(SHIP_FEE);
    expect(h.balance("DRIVER", DRIVER)).toBe(0);

    expect(h.clawbacks).toHaveLength(1);
    expect(h.clawbacks[0].category).toBe("CUSTOMER_COMPENSATION");
    expect(h.clawbacks[0].sourceOrderId).toBe(ORDER_ID);
    expect(h.clawbacks[0].originalAmount).toBe(SHIP_FEE - 5000);

    expect(result.amount).toBe(result.charged + result.clawback);
  });

  it("lỗi nhà hàng: trừ ví nhà hàng, khách vẫn nhận đúng phí ship", async () => {
    const h = buildHarness({ balances: { [`MERCHANT:${MERCHANT}`]: 48750 } });

    const result = await h.service.settleCaseCompensation({
      ...baseInput,
      category: "MERCHANT_BEHAVIOR",
      debtorId: MERCHANT,
      debtorType: "MERCHANT",
    });

    expect(result.amount).toBe(SHIP_FEE);
    expect(h.balance("CONSUMER", CONSUMER)).toBe(SHIP_FEE);
    expect(h.balance("MERCHANT", MERCHANT)).toBe(48750 - SHIP_FEE);
    expect(h.balance("DRIVER", DRIVER)).toBe(0);
  });

  it("idempotent theo orderId: retry không cộng/trừ thêm lần nào", async () => {
    const h = buildHarness({ balances: { [`DRIVER:${DRIVER}`]: 69990 } });

    const first = await h.service.settleCaseCompensation({ ...baseInput });
    const txCount = h.txs.length;

    const second = await h.service.settleCaseCompensation({ ...baseInput });

    expect(first.duplicated).toBe(false);
    expect(second.duplicated).toBe(true);
    expect(h.txs.length).toBe(txCount);
    expect(h.balance("CONSUMER", CONSUMER)).toBe(SHIP_FEE);
    expect(h.balance("DRIVER", DRIVER)).toBe(69990 - SHIP_FEE);
  });

  it("bỏ qua khi đơn đã quyết toán theo luồng giao thất bại (tránh hoàn hai lần)", async () => {
    const h = buildHarness({
      balances: { [`DRIVER:${DRIVER}`]: 69990 },
      settledFailure: {
        orderId: ORDER_ID,
        status: "COMPLETED",
        refundAmount: TOTAL,
      },
    });

    const result = await h.service.settleCaseCompensation({ ...baseInput });

    expect(result.skipped).toBe("FAILURE_ALREADY_SETTLED");
    expect(result.amount).toBe(0);
    expect(h.txs).toHaveLength(0);
    expect(h.balance("CONSUMER", CONSUMER)).toBe(0);
    expect(h.balance("DRIVER", DRIVER)).toBe(69990);
  });

  it("bỏ qua khi số tiền = 0 hoặc hai bên trùng nhau", async () => {
    const h = buildHarness();

    const zero = await h.service.settleCaseCompensation({
      ...baseInput,
      amount: 0,
    });
    expect(zero.skipped).toBe("AMOUNT_ZERO");

    const sameParty = await h.service.settleCaseCompensation({
      ...baseInput,
      debtorId: CONSUMER,
      debtorType: "CONSUMER",
    });
    expect(sameParty.skipped).toBe("INVALID_PARTIES");

    expect(h.txs).toHaveLength(0);
  });

  it("không tạo tiền: khoản trừ bên lỗi được chuyển vào quỹ nền tảng", async () => {
    const h = buildHarness({ balances: { [`DRIVER:${DRIVER}`]: 69990 } });

    await h.service.settleCaseCompensation({ ...baseInput });

    const driverDebit = h.txs
      .filter((t) => t.type === "DEBIT" && t.ownerId === DRIVER)
      .reduce((s, t) => s + Number(t.amount), 0);
    const platformCredit = h.txs
      .filter((t) => t.type === "CREDIT" && t.ownerId === "PLATFORM_DEFAULT")
      .reduce((s, t) => s + Number(t.amount), 0);

    expect(driverDebit).toBe(SHIP_FEE);
    expect(platformCredit).toBe(SHIP_FEE);
  });
});
