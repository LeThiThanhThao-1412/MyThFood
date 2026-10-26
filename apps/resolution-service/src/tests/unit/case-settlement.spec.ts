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
 * Quyết toán tiền của một vụ việc `VALID` — hai bất biến được khoá lại ở đây:
 *
 *  1. **Số tiền trên tab hình phạt = số tiền ví đã chuyển.** Trước đây
 *     `recordReporterCompensation()` ghi theo `policy.amount` nên khi ví trả
 *     `FAILURE_ALREADY_SETTLED` (đơn đã quyết toán ở case khác) vẫn sinh bút
 *     toán ảo: CASE-2026-000002 ghi 93.247đ trong khi không có đồng nào vào ví
 *     khách.
 *  2. **Escrow luôn được mở khoá khi phán quyết không tiêu thụ escrow.** Trước
 *     đây chỉ INVALID/WITHDRAWN mới release nên đơn `a13aae84` treo 75.769đ
 *     `HELD_BY_DISPUTE` vĩnh viễn: nhà hàng/tài xế không bao giờ được quyết
 *     toán 23:00.
 */
describe("CaseService.resolve — quyết toán tiền & escrow theo chính sách", () => {
  const ORDER_ID = "a13aae84-3f68-47f3-89d7-6439503a2215";
  const CONSUMER_ID = "1f7bac64-e4b2-488e-b65f-720410b4e4a9";
  const MERCHANT_ID = "5d0d339d-bf95-4cf5-b1b2-fc65e4f62e65";
  const DRIVER_ID = "5deb6f0b-1403-48dd-a129-aa24afe519b6";
  const TOTAL = 93247;
  const SHIP_FEE = 21862;

  interface SetupOptions {
    category: CaseCategory;
    faultParty: FaultParty;
    reporterType?: "CONSUMER" | "MERCHANT" | "DRIVER";
    respondentType?: "CONSUMER" | "MERCHANT" | "DRIVER";
    order?: any;
    /** Kết quả `settle-compensation` (order-service trả về). */
    compensation?: any;
    /** Kết quả `settle-failure-money` (order-service trả về). */
    failure?: any;
  }

  function setup(opts: SetupOptions) {
    const reporterType = opts.reporterType ?? "CONSUMER";
    const reporterId = reporterType === "CONSUMER" ? CONSUMER_ID : MERCHANT_ID;
    const respondentType = opts.respondentType ?? "MERCHANT";
    const respondentId =
      respondentType === "MERCHANT"
        ? MERCHANT_ID
        : respondentType === "DRIVER"
          ? DRIVER_ID
          : CONSUMER_ID;

    const c = Case.create({
      caseNumber: "CASE-2026-000002",
      type: CaseType.COMPLAINT,
      category: opts.category,
      severity: Severity.MEDIUM,
      orderId: ORDER_ID,
      reporterId,
      reporterType,
      respondentId,
      respondentType,
      subject: "Khiếu nại đơn hàng",
      description: "Mô tả sự cố",
    });

    const repo = {
      findByIdOrFail: jest.fn(async () => c),
      save: jest.fn(async () => undefined),
      addTimeline: jest.fn(async () => undefined),
      findEntityById: jest.fn(async () => ({
        id: c.id.toString(),
        status: "RESOLVED",
      })),
    };
    const integration = {
      getOrder: jest.fn(async () =>
        opts.order === undefined
          ? { status: "DELIVERED", totalAmount: TOTAL, deliveryFee: SHIP_FEE }
          : opts.order,
      ),
      settleFailureMoney: jest.fn(async () =>
        opts.failure === undefined
          ? { settled: true, duplicated: false, refundAmount: TOTAL }
          : opts.failure,
      ),
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
      releaseSettlement: jest.fn(async () => undefined),
      notify: jest.fn(async () => undefined),
    };
    const penalty = { recordPenalty: jest.fn(async () => undefined) };
    const service = new CaseService(
      repo as any,
      integration as any,
      penalty as any,
    );

    return { c, service, repo, integration, penalty };
  }

  /** Gọi `resolve()` với phán quyết VALID rồi trả về các mock để assert. */
  async function resolveValid(opts: SetupOptions) {
    const ctx = setup(opts);
    await ctx.service.resolve(
      ctx.c.id.toString(),
      {
        verdict: Verdict.VALID,
        faultParty: opts.faultParty,
        note: "Admin duyệt",
      },
      { userId: "admin-1", roles: ["ADMIN"] },
    );
    return ctx;
  }

  /** Bản ghi COMPENSATION đã ghi (rỗng nếu không ghi). */
  function compensationRows(penalty: { recordPenalty: jest.Mock }) {
    return penalty.recordPenalty.mock.calls
      .map(([arg]) => arg)
      .filter((arg) => arg.type === "COMPENSATION");
  }

  describe("bảng quyết định: mode tiền + escrow theo (category, fault, trạng thái đơn)", () => {
    const rows: Array<{
      name: string;
      category: CaseCategory;
      faultParty: FaultParty;
      reporterType?: "CONSUMER" | "MERCHANT" | "DRIVER";
      respondentType?: "CONSUMER" | "MERCHANT" | "DRIVER";
      orderStatus: string;
      route: "FULL_REFUND" | "SHIP_COMPENSATION" | "NONE";
      releaseEscrow: boolean;
    }> = [
      {
        name: "giao trễ (đơn đã giao, lỗi tài xế) → hoàn phí ship + release escrow",
        category: CaseCategory.DELIVERY_LATE,
        faultParty: FaultParty.DRIVER,
        respondentType: "DRIVER",
        orderStatus: "DELIVERED",
        route: "SHIP_COMPENSATION",
        releaseEscrow: true,
      },
      {
        name: "thái độ tài xế (đơn đã giao) → hoàn phí ship + release escrow",
        category: CaseCategory.DRIVER_BEHAVIOR,
        faultParty: FaultParty.DRIVER,
        respondentType: "DRIVER",
        orderStatus: "DELIVERED",
        route: "SHIP_COMPENSATION",
        releaseEscrow: true,
      },
      {
        name: "thiếu món (đơn đã giao, lỗi nhà hàng) → hoàn 100%, escrow do settleFailure xử lý",
        category: CaseCategory.MISSING_ITEM,
        faultParty: FaultParty.MERCHANT,
        orderStatus: "DELIVERED",
        route: "FULL_REFUND",
        releaseEscrow: false,
      },
      {
        name: "chất lượng món (đơn đã giao, lỗi nhà hàng) → hoàn 100%",
        category: CaseCategory.ORDER_QUALITY,
        faultParty: FaultParty.MERCHANT,
        orderStatus: "DELIVERED",
        route: "FULL_REFUND",
        releaseEscrow: false,
      },
      {
        name: "đơn giao thất bại (lỗi nhà hàng) → hoàn 100%, escrow do settleFailure xử lý",
        category: CaseCategory.MISSING_ITEM,
        faultParty: FaultParty.MERCHANT,
        orderStatus: "DELIVERY_FAILED",
        route: "FULL_REFUND",
        releaseEscrow: false,
      },
      {
        name: "lạm dụng khuyến mãi (lỗi khách) → không dòng tiền + release escrow",
        category: CaseCategory.PROMO_ABUSE,
        faultParty: FaultParty.CUSTOMER,
        orderStatus: "DELIVERED",
        route: "NONE",
        releaseEscrow: true,
      },
      {
        name: "đơn ảo (lỗi khách) → không dòng tiền + release escrow",
        category: CaseCategory.ORDER_FARMING,
        faultParty: FaultParty.CUSTOMER,
        orderStatus: "DELIVERED",
        route: "NONE",
        releaseEscrow: true,
      },
      {
        name: "nhà hàng khiếu nại đơn đã giao → không hoàn tiền nhưng vẫn release escrow",
        category: CaseCategory.DELIVERY_LATE,
        faultParty: FaultParty.DRIVER,
        reporterType: "MERCHANT",
        respondentType: "DRIVER",
        orderStatus: "DELIVERED",
        route: "NONE",
        releaseEscrow: true,
      },
      {
        name: "đơn chưa giao xong → luôn quyết toán qua luồng giao thất bại (ví tự route theo bên lỗi)",
        category: CaseCategory.PROMO_ABUSE,
        faultParty: FaultParty.CUSTOMER,
        orderStatus: "DELIVERY_FAILED",
        route: "FULL_REFUND",
        releaseEscrow: false,
      },
    ];

    it.each(rows)("$name", async (row) => {
      const { integration } = await resolveValid({
        category: row.category,
        faultParty: row.faultParty,
        reporterType: row.reporterType,
        respondentType: row.respondentType,
        order: {
          status: row.orderStatus,
          totalAmount: TOTAL,
          deliveryFee: SHIP_FEE,
        },
      });

      expect(integration.settleFailureMoney).toHaveBeenCalledTimes(
        row.route === "FULL_REFUND" ? 1 : 0,
      );
      expect(integration.settleCaseCompensation).toHaveBeenCalledTimes(
        row.route === "SHIP_COMPENSATION" ? 1 : 0,
      );
      expect(integration.releaseSettlement).toHaveBeenCalledTimes(
        row.releaseEscrow ? 1 : 0,
      );
      if (row.releaseEscrow) {
        expect(integration.releaseSettlement).toHaveBeenCalledWith(ORDER_ID);
      }
      if (row.route === "SHIP_COMPENSATION") {
        expect(integration.settleCaseCompensation).toHaveBeenCalledWith(
          expect.objectContaining({
            orderId: ORDER_ID,
            category: row.category,
            faultParty: row.faultParty,
            amount: SHIP_FEE,
          }),
        );
      }
    });
  });

  it("ghi COMPENSATION đúng bằng số tiền ví chuyển (không dùng số policy)", async () => {
    const { c, penalty } = await resolveValid({
      category: CaseCategory.DELIVERY_LATE,
      faultParty: FaultParty.DRIVER,
      respondentType: "DRIVER",
    });

    const rows = compensationRows(penalty);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        caseId: c.id.toString(),
        type: "COMPENSATION",
        targetId: CONSUMER_ID,
        targetType: "CONSUMER",
        amount: SHIP_FEE,
      }),
    );
  });

  it("ví bỏ qua (FAILURE_ALREADY_SETTLED) → KHÔNG ghi bút toán bồi thường ảo", async () => {
    const { penalty, integration } = await resolveValid({
      category: CaseCategory.DELIVERY_LATE,
      faultParty: FaultParty.DRIVER,
      respondentType: "DRIVER",
      compensation: {
        settled: false,
        amount: 0,
        charged: 0,
        clawback: 0,
        duplicated: true,
        skipped: "FAILURE_ALREADY_SETTLED",
        reason: "FAILURE_ALREADY_SETTLED",
      },
    });

    // Đây là lỗi của CASE-2026-000002: trước đây vẫn ghi 93.247đ.
    expect(compensationRows(penalty)).toHaveLength(0);
    // Cảnh báo cho bên lỗi (không số tiền) vẫn phải có.
    expect(penalty.recordPenalty.mock.calls.map(([arg]) => arg.type)).toContain(
      "WARNING",
    );
    // Escrow vẫn phải được mở khoá — nếu không sẽ treo HELD_BY_DISPUTE.
    expect(integration.releaseSettlement).toHaveBeenCalledWith(ORDER_ID);
  });

  it("ví báo duplicated (retry) → KHÔNG ghi thêm COMPENSATION dù amount > 0", async () => {
    const { penalty } = await resolveValid({
      category: CaseCategory.DELIVERY_LATE,
      faultParty: FaultParty.DRIVER,
      respondentType: "DRIVER",
      compensation: {
        settled: true,
        amount: SHIP_FEE,
        charged: 0,
        clawback: 0,
        duplicated: true,
        skipped: null,
      },
    });

    // `amount` ở đây là số đã chuyển ở lần trước, không phải dòng tiền mới ⇒
    // ghi COMPENSATION nữa là bút toán ảo (đúng lỗi cũ của nhánh `skipped`).
    expect(compensationRows(penalty)).toHaveLength(0);
  });

  it("đơn đã quyết toán giao thất bại (duplicated) → không ghi thêm bồi thường", async () => {
    const { penalty, integration } = await resolveValid({
      category: CaseCategory.MISSING_ITEM,
      faultParty: FaultParty.MERCHANT,
      failure: { settled: true, duplicated: true, refundAmount: TOTAL },
    });

    expect(compensationRows(penalty)).toHaveLength(0);
    // FULL_REFUND đã xử lý escrow ⇒ không release lần nữa (tránh trả hai lần).
    expect(integration.releaseSettlement).not.toHaveBeenCalled();
  });

  it("hoàn 100% lần đầu → COMPENSATION bằng đúng số ví hoàn (refundAmount)", async () => {
    const { penalty } = await resolveValid({
      category: CaseCategory.MISSING_ITEM,
      faultParty: FaultParty.MERCHANT,
    });

    const rows = compensationRows(penalty);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(TOTAL);
  });

  it("route tiền trả null (service chết) → giữ phán quyết, không ghi bồi thường", async () => {
    const { penalty, integration } = await resolveValid({
      category: CaseCategory.DELIVERY_LATE,
      faultParty: FaultParty.DRIVER,
      respondentType: "DRIVER",
      compensation: null,
    });

    expect(compensationRows(penalty)).toHaveLength(0);
    expect(integration.releaseSettlement).toHaveBeenCalledWith(ORDER_ID);
  });

  it("route tiền ném lỗi mạng → resolve không hỏng, không ghi bồi thường", async () => {
    const { service, integration, penalty, c } = setup({
      category: CaseCategory.DELIVERY_LATE,
      faultParty: FaultParty.DRIVER,
      respondentType: "DRIVER",
    });
    integration.settleCaseCompensation.mockRejectedValueOnce(
      new Error("ECONNREFUSED"),
    );

    await expect(
      service.resolve(
        c.id.toString(),
        { verdict: Verdict.VALID, faultParty: FaultParty.DRIVER },
        { userId: "admin-1", roles: ["ADMIN"] },
      ),
    ).resolves.toBeDefined();

    expect(compensationRows(penalty)).toHaveLength(0);
    expect(c.caseVerdict).toBe(Verdict.VALID);
  });
});
