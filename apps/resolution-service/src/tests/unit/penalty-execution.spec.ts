import { BadRequestException } from "@nestjs/common";
import {
  AuthUser,
  PenaltyService,
} from "../../modules/penalty/application/penalty.service";
import { Penalty } from "../../modules/penalty/domain/penalty.aggregate";
import { PenaltyId } from "../../modules/penalty/domain/penalty-id";
import {
  PenaltyStatus,
  PenaltyType,
} from "../../modules/penalty/domain/penalty.enums";
import { CaseStatus, Verdict } from "../../modules/case/domain/case.enums";

/**
 * Regression test cho luồng admin “⚖️ Xử lý vụ việc” (chọn kết luận → bồi
 * thường → chế tài, trước đây là hai nút “Phán quyết” và “Duyệt & thi hành”).
 *
 * Lỗi gốc: `IntegrationService.debit/suspend*` là fire-and-forget ⇒ ví có thể
 * 503 mà hình phạt vẫn được ghi EXECUTED, admin bấm “Thi hành ngay” nhưng không
 * có tác dụng gì và cũng không có phản hồi nào trên UI.
 *
 * Hành vi đúng:
 *   - Call ghi thất bại ⇒ hình phạt EXECUTION_FAILED + trả `executionError`.
 *   - Retry dùng lại đúng `referenceId = penalty.id` (ví dedupe, không trừ 2 lần).
 *   - Dữ liệu vô nghĩa (phạt 0đ, thiếu lý do) bị chặn trước khi ghi.
 */

const ADMIN: AuthUser = { userId: "admin-1", roles: ["ADMIN"] };

const SUCCESS = { ok: true, error: null };

function validCase(overrides: any = {}) {
  return {
    caseStatus: CaseStatus.RESOLVED,
    caseVerdict: Verdict.VALID,
    caseReporterId: "consumer-1",
    caseReporterType: "CONSUMER",
    caseRespondentId: "driver-1",
    caseRespondentType: "DRIVER",
    caseSubject: "Giao trễ",
    addPenaltyId: jest.fn(),
    ...overrides,
  };
}

function makeHarness(integrationOverrides: any = {}) {
  const penaltyRepo = {
    save: jest.fn(async (p: Penalty) => p),
    findByIdOrFail: jest.fn(),
    findEntityById: jest.fn(async (id: string) => ({
      id,
      status: "EXECUTED",
    })),
    findAppealByPenaltyId: jest.fn(async () => null),
    saveAppeal: jest.fn(async (a: any) => a),
  };
  const caseRepo = {
    findByIdOrFail: jest.fn(),
    save: jest.fn(async (c: any) => c),
  };
  const integration = {
    debit: jest.fn(async () => SUCCESS),
    credit: jest.fn(async () => SUCCESS),
    suspendDriver: jest.fn(async () => SUCCESS),
    banDriver: jest.fn(async () => SUCCESS),
    deductReputation: jest.fn(async () => SUCCESS),
    suspendMerchant: jest.fn(async () => SUCCESS),
    suspendConsumer: jest.fn(async () => SUCCESS),
    notify: jest.fn(async () => undefined),
    ...integrationOverrides,
  };

  const service = new PenaltyService(
    penaltyRepo as any,
    caseRepo as any,
    integration as any,
  );

  /** Các entity đã được ghi, theo thứ tự. */
  const savedPenalties = (): Penalty[] =>
    penaltyRepo.save.mock.calls.map((call: any[]) => call[0]);
  const penaltyWithStatus = (status: PenaltyStatus): Penalty | undefined =>
    savedPenalties().find((p) => p.penaltyStatus === status);

  return {
    service,
    penaltyRepo,
    caseRepo,
    integration,
    savedPenalties,
    penaltyWithStatus,
  };
}

const fineDto = {
  caseId: "case-1",
  type: PenaltyType.FINE,
  targetId: "driver-1",
  targetType: "DRIVER",
  amount: 50000,
  reason: "Giao trễ 45 phút",
};

describe("PenaltyService — thi hành & retry", () => {
  it("FINE: trừ ví kèm referenceId = id hình phạt rồi mới đánh dấu EXECUTED", async () => {
    const h = makeHarness();
    h.caseRepo.findByIdOrFail.mockResolvedValue(validCase());

    const res: any = await h.service.issue(fineDto as any, ADMIN);

    expect(h.integration.debit).toHaveBeenCalledTimes(1);
    const [ownerId, ownerType, amount, description, opts] = h.integration.debit
      .mock.calls[0] as any[];

    const executed = h.penaltyWithStatus(PenaltyStatus.EXECUTED);
    expect(executed).toBeDefined();
    expect(ownerId).toBe("driver-1");
    expect(ownerType).toBe("DRIVER");
    expect(amount).toBe(50000);
    expect(description).toContain("PENALTY");
    expect(opts.referenceType).toBe("PENALTY");
    expect(opts.referenceId).toBe(executed!.id.toString());
    expect(h.integration.notify).toHaveBeenCalled();
    expect(res.executionError).toBeNull();
  });

  it("ví lỗi ⇒ EXECUTION_FAILED + trả executionError (không throw, không báo thành công giả)", async () => {
    const h = makeHarness({
      debit: jest.fn(async () => ({
        ok: false,
        error:
          "http://localhost:3009/api/v1/wallets/penalty/debit → 503 unavailable",
      })),
    });
    h.caseRepo.findByIdOrFail.mockResolvedValue(validCase());

    const res: any = await h.service.issue(fineDto as any, ADMIN);

    expect(h.penaltyWithStatus(PenaltyStatus.EXECUTED)).toBeUndefined();
    expect(h.penaltyWithStatus(PenaltyStatus.EXECUTION_FAILED)).toBeDefined();
    expect(res.executionError).toContain("503");
  });

  it("retry: dùng lại đúng referenceId (không trừ tiền hai lần)", async () => {
    const h = makeHarness({
      debit: jest.fn(async () => ({ ok: false, error: "wallet down" })),
    });
    h.caseRepo.findByIdOrFail.mockResolvedValue(validCase());

    await h.service.issue(fineDto as any, ADMIN);
    const failed = h.penaltyWithStatus(PenaltyStatus.EXECUTION_FAILED)!;
    const firstReferenceId = (h.integration.debit.mock.calls[0] as any[])[4]
      .referenceId;

    // Ví sống lại
    (h.integration.debit as jest.Mock).mockResolvedValue(SUCCESS);
    h.penaltyRepo.findByIdOrFail.mockResolvedValue(failed);

    const res: any = await h.service.retry(failed.id.toString(), ADMIN);

    expect(h.integration.debit).toHaveBeenCalledTimes(2);
    const secondReferenceId = (h.integration.debit.mock.calls[1] as any[])[4]
      .referenceId;
    expect(secondReferenceId).toBe(firstReferenceId);
    expect(res.executionError).toBeNull();
    expect(h.penaltyWithStatus(PenaltyStatus.EXECUTED)).toBeDefined();
  });

  it("retry: chỉ hình phạt EXECUTION_FAILED mới được thi hành lại", async () => {
    const h = makeHarness();
    const issued = Penalty.create({
      caseId: "case-1",
      type: PenaltyType.FINE,
      targetId: "driver-1",
      targetType: "DRIVER",
      amount: 50000,
      durationDays: null,
      reason: "Giao trễ",
    });
    h.penaltyRepo.findByIdOrFail.mockResolvedValue(issued);
    h.caseRepo.findByIdOrFail.mockResolvedValue(validCase());

    await expect(
      h.service.retry(issued.id.toString(), ADMIN),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.integration.debit).not.toHaveBeenCalled();
  });

  it("chặn phạt tiền 0đ trước khi ghi hình phạt", async () => {
    const h = makeHarness();
    h.caseRepo.findByIdOrFail.mockResolvedValue(validCase());

    await expect(
      h.service.issue({ ...fineDto, amount: 0 } as any, ADMIN),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.penaltyRepo.save).not.toHaveBeenCalled();
    expect(h.integration.debit).not.toHaveBeenCalled();
  });

  it("chặn ban hành khi vụ việc chưa phán quyết VALID", async () => {
    const h = makeHarness();
    h.caseRepo.findByIdOrFail.mockResolvedValue(
      validCase({ caseStatus: CaseStatus.UNDER_REVIEW, caseVerdict: null }),
    );

    await expect(h.service.issue(fineDto as any, ADMIN)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(h.integration.debit).not.toHaveBeenCalled();
  });

  it("COMPENSATION: trừ bên lỗi (không cộng quỹ nền tảng) + cộng người khiếu nại", async () => {
    const h = makeHarness();
    h.caseRepo.findByIdOrFail.mockResolvedValue(validCase());

    await h.service.issue(
      { ...fineDto, type: PenaltyType.COMPENSATION } as any,
      ADMIN,
    );

    const [, , , , debitOpts] = h.integration.debit.mock.calls[0] as any[];
    const [creditOwnerId, creditOwnerType, creditAmount, , creditOpts] =
      h.integration.credit.mock.calls[0] as any[];

    expect(debitOpts.transferToPlatform).toBe(false);
    expect(creditOwnerId).toBe("consumer-1");
    expect(creditOwnerType).toBe("CONSUMER");
    expect(creditAmount).toBe(50000);
    // Hai chân bồi thường dùng chung một referenceId (mỗi ví dedupe riêng).
    expect(creditOpts.referenceId).toBe(debitOpts.referenceId);
  });

  it("SUSPEND tài xế ⇒ gọi driver-service với số ngày", async () => {
    const h = makeHarness();
    h.caseRepo.findByIdOrFail.mockResolvedValue(validCase());

    await h.service.issue(
      {
        ...fineDto,
        type: PenaltyType.SUSPEND,
        amount: undefined,
        durationDays: 7,
      } as any,
      ADMIN,
    );

    expect(h.integration.suspendDriver).toHaveBeenCalledWith(
      "driver-1",
      7,
      fineDto.reason,
    );
    expect(h.penaltyWithStatus(PenaltyStatus.EXECUTED)).toBeDefined();
  });

  describe("decideAppeal (hủy phạt bồi thường)", () => {
    function appealedCompensation(): Penalty {
      return Penalty.rehydrate(
        PenaltyId.from("550e8400-e29b-41d4-a716-446655440077"),
        {
          caseId: "case-1",
          type: PenaltyType.COMPENSATION,
          targetId: "driver-1",
          targetType: "DRIVER",
          amount: 50000,
          durationDays: null,
          status: PenaltyStatus.APPEALED,
          reason: "Bồi thường do DRIVER gây lỗi",
          deadline: new Date(Date.now() + 3600000),
          appliedBy: "admin-1",
          appliedAt: new Date(),
        },
      );
    }

    it("hủy phạt ⇒ đảo bút toán với referenceType riêng, rồi mới lưu OVERTURNED", async () => {
      const h = makeHarness();
      const p = appealedCompensation();
      h.penaltyRepo.findByIdOrFail.mockResolvedValue(p);
      h.caseRepo.findByIdOrFail.mockResolvedValue(validCase());

      await h.service.decideAppeal(
        p.id.toString(),
        { upheld: false } as any,
        ADMIN,
      );

      const [creditOwner, , , , creditOpts] = h.integration.credit.mock
        .calls[0] as any[];
      const [debitOwner, , , , debitOpts] = h.integration.debit.mock
        .calls[0] as any[];

      expect(creditOwner).toBe("driver-1");
      expect(debitOwner).toBe("consumer-1");
      // Khác referenceType của lần thi hành để ví không dedupe nhầm.
      expect(creditOpts.referenceType).toBe("PENALTY_REVERSAL");
      expect(debitOpts.referenceType).toBe("PENALTY_REVERSAL");
      expect(creditOpts.referenceId).toBe(p.id.toString());
      expect(creditOpts.transferToPlatform).toBe(false);
      expect(h.penaltyWithStatus(PenaltyStatus.OVERTURNED)).toBeDefined();
    });

    it("ví lỗi ⇒ throw và KHÔNG lưu OVERTURNED (còn APPEALED để thử lại)", async () => {
      const h = makeHarness({
        credit: jest.fn(async () => ({ ok: false, error: "wallet down" })),
      });
      const p = appealedCompensation();
      h.penaltyRepo.findByIdOrFail.mockResolvedValue(p);
      h.caseRepo.findByIdOrFail.mockResolvedValue(validCase());

      await expect(
        h.service.decideAppeal(p.id.toString(), { upheld: false } as any, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(h.penaltyWithStatus(PenaltyStatus.OVERTURNED)).toBeUndefined();
      expect(h.penaltyRepo.saveAppeal).not.toHaveBeenCalled();
    });
  });
});
