import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { CaseService } from "../../modules/case/application/case.service";
import { Case } from "../../modules/case/domain/case.aggregate";
import {
  CaseCategory,
  CaseType,
  Severity,
} from "../../modules/case/domain/case.enums";

/**
 * Bổ sung bằng chứng cho **bên bị khiếu nại**.
 *
 * Trước đây `POST /cases/:id/evidence` chỉ cho người khiếu nại (role
 * CONSUMER/ADMIN + `assertReporterOrAdmin`), nên nhà hàng không có chỗ gửi ảnh
 * minh chứng → AI luôn báo "Bên bị khiếu nại: không có ảnh". Các test dưới đây
 * khoá lại hành vi: ảnh của ai vào đúng trường của người đó.
 */
describe("CaseService.addEvidence — định tuyến ảnh theo bên", () => {
  const REPORTER_ID = "0b6e1c62-2b0f-4b7c-9a1e-2d6b1f0f0a01";
  const MERCHANT_ID = "f3f4a0f8-3cbb-4f0e-9d61-0f0a0b0c0d02";
  const CASE_ID = "5a0d5f30-9c3c-4d31-9d2f-7d2b0c0d0e03";

  function newCase(evidence: string[] = []): Case {
    return Case.create({
      caseNumber: "CASE-2026-000123",
      type: CaseType.COMPLAINT,
      category: CaseCategory.WRONG_ITEM,
      severity: Severity.MEDIUM,
      orderId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      reporterId: REPORTER_ID,
      reporterType: "CONSUMER",
      respondentId: MERCHANT_ID,
      respondentType: "MERCHANT",
      subject: "Khách nhận sai món",
      description: "Đặt phở bò nhưng nhận bún bò",
      evidence,
    });
  }

  function setup(c: Case) {
    const repo = {
      findByIdOrFail: jest.fn().mockResolvedValue(c),
      save: jest.fn().mockResolvedValue(undefined),
      addTimeline: jest.fn().mockResolvedValue(undefined),
      findEntityById: jest
        .fn()
        .mockResolvedValue({ id: CASE_ID, status: "OPEN" }),
    };
    const integration = {
      notify: jest.fn().mockResolvedValue(undefined),
      settleFailureMoney: jest.fn().mockResolvedValue(undefined),
    };
    const penalty = { recordPenalty: jest.fn().mockResolvedValue(undefined) };
    const service = new CaseService(
      repo as any,
      integration as any,
      penalty as any,
    );
    return { service, repo, integration };
  }

  it("nhà hàng (bên bị khiếu nại) gửi ảnh → vào respondentEvidence", async () => {
    const c = newCase(["https://cdn/khach-1.jpg"]);
    const { service, repo, integration } = setup(c);

    await service.addEvidence(
      CASE_ID,
      { urls: ["https://cdn/nha-hang-1.jpg"], actorId: MERCHANT_ID },
      { userId: "auth-user-merchant", roles: ["MERCHANT_OWNER"] },
    );

    expect(c.caseRespondentEvidence).toEqual(["https://cdn/nha-hang-1.jpg"]);
    // Ảnh của bên khiếu nại phải nguyên vẹn.
    expect(c.caseEvidence).toEqual(["https://cdn/khach-1.jpg"]);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.addTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "MERCHANT",
        note: "Bên bị khiếu nại bổ sung 1 ảnh minh chứng",
      }),
    );
    // Người khiếu nại được báo để kịp phản hồi.
    expect(integration.notify).toHaveBeenCalledWith(
      REPORTER_ID,
      "Bên bị khiếu nại đã bổ sung ảnh minh chứng",
      expect.any(String),
    );
  });

  it("nhận diện bên bị khiếu nại qua user đăng nhập (không cần actorId)", async () => {
    const c = newCase();
    const { service } = setup(c);

    await service.addEvidence(
      CASE_ID,
      { urls: ["https://cdn/nha-hang-2.jpg"] },
      { userId: MERCHANT_ID, roles: ["MERCHANT_OWNER"] },
    );

    expect(c.caseRespondentEvidence).toEqual(["https://cdn/nha-hang-2.jpg"]);
    expect(c.caseEvidence).toHaveLength(0);
  });

  it("người khiếu nại gửi ảnh → vẫn vào evidence và báo cho nhà hàng", async () => {
    const c = newCase();
    const { service, integration } = setup(c);

    await service.addEvidence(
      CASE_ID,
      { urls: ["https://cdn/khach-2.jpg"] },
      { userId: REPORTER_ID, roles: ["CONSUMER"] },
    );

    expect(c.caseEvidence).toEqual(["https://cdn/khach-2.jpg"]);
    expect(c.caseRespondentEvidence).toHaveLength(0);
    expect(integration.notify).toHaveBeenCalledWith(
      MERCHANT_ID,
      "Bên khiếu nại đã bổ sung bằng chứng",
      expect.any(String),
    );
  });

  it("admin gửi ảnh → ghi vào evidence (bằng chứng do hệ thống thu thập)", async () => {
    const c = newCase();
    const { service } = setup(c);

    await service.addEvidence(
      CASE_ID,
      { urls: ["https://cdn/admin-1.jpg"] },
      { userId: "auth-user-admin", roles: ["ADMIN"] },
    );

    expect(c.caseEvidence).toEqual(["https://cdn/admin-1.jpg"]);
    expect(c.caseRespondentEvidence).toHaveLength(0);
  });

  it("danh sách ảnh rỗng bị từ chối (không tạo timeline rác)", async () => {
    const c = newCase();
    const { service, repo } = setup(c);

    await expect(
      service.addEvidence(
        CASE_ID,
        { urls: [], actorId: MERCHANT_ID },
        { userId: MERCHANT_ID, roles: ["MERCHANT_OWNER"] },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.addTimeline).not.toHaveBeenCalled();
  });

  it("người ngoài cuộc vẫn bị chặn", async () => {
    const c = newCase();
    const { service, repo } = setup(c);

    await expect(
      service.addEvidence(
        CASE_ID,
        { urls: ["https://cdn/la-1.jpg"] },
        { userId: "0f0a0b0c-1111-4222-8333-444455556666", roles: ["CONSUMER"] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repo.save).not.toHaveBeenCalled();
    expect(c.caseEvidence).toHaveLength(0);
    expect(c.caseRespondentEvidence).toHaveLength(0);
  });
});
