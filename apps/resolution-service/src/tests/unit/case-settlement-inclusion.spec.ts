import { CaseService } from "../../modules/case/application/case.service";
import { Case } from "../../modules/case/domain/case.aggregate";
import {
  CaseCategory,
  CaseType,
  FaultParty,
  Severity,
  Verdict,
} from "../../modules/case/domain/case.enums";

/**
 * Quyết toán của case phải **thực sự** vào lô 23:00 — kể cả khi lời gọi sang
 * wallet-service chết đúng lúc phán quyết.
 *
 * Hai lỗi được khoá lại ở đây:
 *
 *  1. **Không có dấu vết ngày quyết toán.** Dòng escrow bị HELD_BY_DISPUTE mang
 *     `deliveredAt` rất cũ; khi case kết thúc, lô chạy tay/dry-run lọc theo
 *     `deliveredAt` bỏ sót ⇒ doanh thu của nhà hàng/tài xế không bao giờ được
 *     trả. Nay `releaseSettlement` nhận `caseId` + `resolvedAt` để ví đóng dấu
 *     `settleOn` = 23:00 **ngày phán quyết**.
 *
 *  2. **Release là best-effort rồi bị nuốt lỗi.** Trước đây chỉ một dòng `warn`
 *     ⇒ đơn `a13aae84` treo 75.769đ vĩnh viễn. Nay retry 1 lần + cron
 *     `repairHeldEscrows()` mỗi 30 phút mở khoá lại cho case đã kết thúc.
 */

const ORDER_ID = "a13aae84-3f68-47f3-89d7-6439503a2215";
const CONSUMER_ID = "1f7bac64-e4b2-488e-b65f-720410b4e4a9";
const MERCHANT_ID = "5d0d339d-bf95-4cf5-b1b2-fc65e4f62e65";
const DRIVER_ID = "5deb6f0b-1403-48dd-a129-aa24afe519b6";
const TOTAL = 93247;
const SHIP_FEE = 21862;

type Party = "CONSUMER" | "MERCHANT" | "DRIVER";

function makeCase(opts: {
  category: CaseCategory;
  verdict: Verdict;
  faultParty?: FaultParty;
  reporterType?: Party;
  respondentType?: Party;
  orderId?: string | null;
  /** `false` ⇒ giữ case ở trạng thái đang mở (để test chính `resolve()`). */
  resolved?: boolean;
}): Case {
  const reporterType = opts.reporterType ?? "CONSUMER";
  const respondentType = opts.respondentType ?? "DRIVER";
  const idOf = (type: Party) =>
    type === "CONSUMER"
      ? CONSUMER_ID
      : type === "MERCHANT"
        ? MERCHANT_ID
        : DRIVER_ID;

  const c = Case.create({
    caseNumber: "CASE-2026-000100",
    type: CaseType.COMPLAINT,
    category: opts.category,
    severity: Severity.MEDIUM,
    orderId: opts.orderId === undefined ? ORDER_ID : opts.orderId,
    reporterId: idOf(reporterType),
    reporterType,
    respondentId: idOf(respondentType),
    respondentType,
    subject: "Khiếu nại đơn hàng",
    description: "Mô tả sự cố",
  });
  if (opts.resolved !== false) {
    c.resolve(opts.verdict, "Admin duyệt", "admin-1", opts.faultParty ?? null);
  }
  return c;
}

function buildHarness(
  opts: {
    cases?: Case[];
    order?: any;
    compensation?: any;
    releaseFailureOnce?: boolean;
  } = {},
) {
  const repo = {
    findByIdOrFail: jest.fn(async () => (opts.cases ?? [])[0]),
    save: jest.fn(async () => undefined),
    addTimeline: jest.fn(async () => undefined),
    findEntityById: jest.fn(async () => ({
      id: "case-id",
      status: "RESOLVED",
    })),
    findResolvedWithOrderSince: jest.fn(async () => opts.cases ?? []),
  };

  let failOnce = opts.releaseFailureOnce ?? false;
  const integration = {
    getOrder: jest.fn(async () =>
      opts.order === undefined
        ? { status: "DELIVERED", totalAmount: TOTAL, deliveryFee: SHIP_FEE }
        : opts.order,
    ),
    settleFailureMoney: jest.fn(async () => ({
      settled: true,
      duplicated: false,
      refundAmount: TOTAL,
    })),
    settleCaseCompensation: jest.fn(async () =>
      opts.compensation === undefined
        ? {
            settled: true,
            amount: SHIP_FEE,
            charged: 17478,
            clawback: 4384,
            duplicated: false,
            skipped: null,
          }
        : opts.compensation,
    ),
    releaseSettlement: jest.fn(async () => {
      if (failOnce) {
        failOnce = false;
        throw new Error("ECONNRESET");
      }
      return undefined;
    }),
    notify: jest.fn(async () => undefined),
  };

  const penalty = { recordPenalty: jest.fn(async (_arg: any) => undefined) };
  const service = new CaseService(
    repo as any,
    integration as any,
    penalty as any,
  );
  return { service, repo, integration, penalty };
}

const admin = { userId: "admin-1", roles: ["ADMIN"] };

describe("CaseService.releaseEscrow — dấu ngày quyết toán + không nuốt lỗi", () => {
  it("mở khoá escrow với caseId + resolvedAt để ví đóng dấu settleOn", async () => {
    const c = makeCase({
      category: CaseCategory.DELIVERY_LATE,
      verdict: Verdict.VALID,
      faultParty: FaultParty.DRIVER,
      resolved: false,
    });
    const { service, integration } = buildHarness({ cases: [c] });

    await service.resolve(
      c.id.toString(),
      { verdict: Verdict.VALID, faultParty: FaultParty.DRIVER },
      admin,
    );

    expect(integration.releaseSettlement).toHaveBeenCalledWith(
      ORDER_ID,
      expect.objectContaining({
        caseId: c.id.toString(),
        resolvedAt: c.caseResolvedAt,
      }),
    );
  });

  it("lỗi mạng lần đầu: retry ngay và vẫn mở khoá được escrow", async () => {
    const c = makeCase({
      category: CaseCategory.DELIVERY_LATE,
      verdict: Verdict.VALID,
      faultParty: FaultParty.DRIVER,
      resolved: false,
    });
    const { service, integration } = buildHarness({
      cases: [c],
      releaseFailureOnce: true,
    });

    await service.resolve(
      c.id.toString(),
      { verdict: Verdict.VALID, faultParty: FaultParty.DRIVER },
      admin,
    );

    expect(integration.releaseSettlement).toHaveBeenCalledTimes(2);
  });

  it("bồi thường gửi sang order-service đúng phí ship THỰC TRẢ (đã trừ khuyến mãi)", async () => {
    const c = makeCase({
      category: CaseCategory.DELIVERY_LATE,
      verdict: Verdict.VALID,
      faultParty: FaultParty.DRIVER,
      resolved: false,
    });
    const { service, integration } = buildHarness({
      cases: [c],
      order: {
        status: "DELIVERED",
        subtotal: 60000,
        deliveryFee: 20000,
        serviceFee: 0,
        discount: 30000,
        totalAmount: 50000,
      },
    });

    await service.resolve(
      c.id.toString(),
      { verdict: Verdict.VALID, faultParty: FaultParty.DRIVER },
      admin,
    );

    expect(integration.settleCaseCompensation).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: ORDER_ID, amount: 12500 }),
    );
  });
});

describe("CaseService.repairHeldEscrows — cron mở khoá escrow còn treo", () => {
  it("case NONE (phán quyết không tiêu thụ escrow): mở khoá lại", async () => {
    const c = makeCase({
      category: CaseCategory.PROMO_ABUSE,
      verdict: Verdict.INVALID,
      faultParty: FaultParty.CUSTOMER,
    });
    const { service, integration } = buildHarness({ cases: [c] });

    const repaired = await service.repairHeldEscrows(72, 200);

    expect(repaired).toBe(1);
    expect(integration.releaseSettlement).toHaveBeenCalledWith(
      ORDER_ID,
      expect.objectContaining({ caseId: c.id.toString() }),
    );
  });

  it("case FULL_REFUND: chạy lại luồng chuyển tiền của ví (hoàn khách + trừ bên lỗi), KHÔNG release mù", async () => {
    const c = makeCase({
      category: CaseCategory.MISSING_ITEM,
      verdict: Verdict.VALID,
      faultParty: FaultParty.MERCHANT,
      respondentType: "MERCHANT",
    });
    const { service, integration } = buildHarness({ cases: [c] });

    const repaired = await service.repairHeldEscrows(72, 200);

    // Release mù sẽ đẩy escrow vào lô 23:00 dù khách chưa được hoàn đồng nào.
    // Đúng ra phải gọi lại luồng ví (idempotent theo orderId): ví hoàn khách,
    // trừ bên lỗi và tự giải toả escrow trong cùng một lời gọi.
    expect(integration.settleFailureMoney).toHaveBeenCalledWith(
      ORDER_ID,
      FaultParty.MERCHANT,
      expect.anything(),
      c.id.toString(),
      expect.anything(),
    );
    expect(integration.releaseSettlement).not.toHaveBeenCalled();
    expect(repaired).toBe(1);
  });

  it("đơn chưa giao xong: bỏ qua, escrow chờ luồng giao thất bại", async () => {
    const c = makeCase({
      category: CaseCategory.DELIVERY_LATE,
      verdict: Verdict.VALID,
      faultParty: FaultParty.DRIVER,
    });
    const { service, integration } = buildHarness({
      cases: [c],
      order: {
        status: "OUT_FOR_DELIVERY",
        totalAmount: TOTAL,
        deliveryFee: SHIP_FEE,
      },
    });

    expect(await service.repairHeldEscrows(72, 200)).toBe(0);
    expect(integration.releaseSettlement).not.toHaveBeenCalled();
  });

  it("lần gọi đầu lỗi mạng: vẫn mở khoá được trong cùng lượt cron", async () => {
    const c = makeCase({
      category: CaseCategory.DELIVERY_LATE,
      verdict: Verdict.VALID,
      faultParty: FaultParty.DRIVER,
    });
    const { service, integration } = buildHarness({
      cases: [c],
      releaseFailureOnce: true,
    });

    expect(await service.repairHeldEscrows(72, 200)).toBe(1);
    expect(integration.releaseSettlement).toHaveBeenCalledTimes(2);
  });

  it("lỗi khi đọc đơn không làm hỏng lượt cron", async () => {
    const c = makeCase({
      category: CaseCategory.DELIVERY_LATE,
      verdict: Verdict.VALID,
      faultParty: FaultParty.DRIVER,
    });
    const { service, integration } = buildHarness({ cases: [c] });
    integration.getOrder.mockRejectedValueOnce(new Error("ORDER_SERVICE_DOWN"));

    expect(await service.repairHeldEscrows(72, 200)).toBe(0);
    expect(integration.releaseSettlement).not.toHaveBeenCalled();
  });
});
