import { AssistantService } from "../../modules/assistant/application/assistant.service";
import {
  buildUserPrompt,
  compactForPrompt,
} from "../../modules/assistant/domain/assistant.prompt";
import { CaseContextSnapshot } from "../../modules/assistant/domain/assistant.types";
import {
  CaseCategory,
  CaseStatus,
  CaseType,
  FaultParty,
  Severity,
  Verdict,
} from "../../modules/case/domain/case.enums";

const ADMIN_USER = { userId: "admin-1", roles: ["ADMIN"] };

function makeSnapshot(
  overrides: Partial<CaseContextSnapshot> = {},
): CaseContextSnapshot {
  return {
    generatedAt: "2026-10-16T00:00:00.000Z",
    case: {
      id: "case-1",
      caseNumber: "CASE-2026-000001",
      type: CaseType.COMPLAINT,
      category: CaseCategory.NOT_RECEIVED,
      severity: Severity.HIGH,
      status: CaseStatus.UNDER_REVIEW,
      orderId: "order-1",
      reporterId: "consumer-1",
      reporterType: "CONSUMER",
      respondentId: "driver-1",
      respondentType: "DRIVER",
      subject: "Chưa nhận được hàng",
      description: "Đơn báo đã giao nhưng khách chưa nhận",
      evidence: ["http://localhost:3010/api/v1/upload/complaints/a.jpg"],
      respondentResponse: null,
      respondentEvidence: [],
      respondentRespondedAt: null,
      createdAt: null,
      responseDeadline: null,
    },
    sources: [
      {
        id: "D1",
        name: "Chi tiết đơn hàng",
        available: true,
        payload: { id: "order-1", totalAmount: 150000 },
      },
      {
        id: "D4",
        name: "Vết GPS của tài xế",
        available: false,
        detail: "Không có bản ghi nào",
      },
    ],
    missingSourceIds: ["D4"],
    criticalMissingSourceIds: ["D4"],
    imagesAttached: 1,
    imagesSkipped: [],
    ...overrides,
  };
}

function makeService(
  raw: unknown,
  snapshot: CaseContextSnapshot = makeSnapshot(),
) {
  const gemini = {
    assertReady: jest.fn(),
    generateJson: jest.fn().mockResolvedValue({
      data: raw,
      rawText: JSON.stringify(raw),
      model: "gemini-test",
      endpoint: "https://example.invalid/generateContent",
      usage: { promptTokens: 10, outputTokens: 20, totalTokens: 30 },
    }),
    enabled: true,
    hasApiKey: true,
    apiBase: "https://example.invalid",
    model: "gemini-test",
    maxEvidenceImages: 4,
  } as any;

  const contextService = {
    build: jest.fn().mockResolvedValue({ snapshot, images: [] }),
  } as any;

  const analysisRepo = {
    saveAnalysis: jest.fn().mockImplementation(async (input: any) => input),
    findByCaseId: jest.fn().mockResolvedValue(null),
    saveReview: jest
      .fn()
      .mockImplementation(
        async (
          caseId: string,
          decision: string,
          by: string,
          note: string | null,
        ) => ({
          caseId,
          caseNumber: "CASE-2026-000001",
          source: "MANUAL",
          createdAt: new Date().toISOString(),
          suggestion: null,
          review: {
            decision,
            by,
            at: new Date().toISOString(),
            note,
          },
        }),
      ),
  } as any;

  return {
    service: new AssistantService(contextService, gemini, analysisRepo),
    gemini,
    contextService,
    analysisRepo,
  };
}

const VALID_RAW = {
  summary: "Đơn được đánh dấu đã giao nhưng không có bằng chứng bàn giao.",
  suggestedVerdict: "VALID",
  suggestedFaultParty: "DRIVER",
  suggestedSeverity: "HIGH",
  confidence: 0.8,
  keyFindings: [
    "Dispatch ghi delivered lúc 19:05",
    "GPS dừng cách điểm giao 1.2km",
  ],
  evidenceGaps: ["Thiếu ảnh bàn giao"],
  riskFlags: [],
  suggestedActions: [
    {
      type: "FINE",
      targetType: "DRIVER",
      amount: 150000.4,
      reason: "Giao thất bại nhưng đánh dấu thành công",
    },
    {
      type: "SUSPEND",
      targetType: "DRIVER",
      durationDays: 3,
      reason: "Tái phạm",
    },
  ],
  suggestedResolutionNote: "Chấp nhận khiếu nại, hoàn tiền cho khách.",
  followUpQuestions: ["Tài xế có ảnh bàn giao không?"],
};

describe("AssistantService", () => {
  describe("getHealth", () => {
    it("phản ánh cấu hình Gemini từ client", () => {
      const { service } = makeService({});
      const health = service.getHealth();
      expect(health.enabled).toBe(true);
      expect(health.hasApiKey).toBe(true);
      expect(health.model).toBe("gemini-test");
      expect(health.maxEvidenceImages).toBe(4);
      expect(health.sourceCount).toBeGreaterThan(0);
    });
  });

  describe("analyzeCase", () => {
    it("map đúng output hợp lệ và gắn nguồn dữ liệu", async () => {
      const { service, gemini } = makeService(VALID_RAW);
      const result = await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      expect(gemini.assertReady).toHaveBeenCalledTimes(1);
      expect(result.caseId).toBe("case-1");
      expect(result.caseNumber).toBe("CASE-2026-000001");
      expect(result.model).toBe("gemini-test");
      expect(result.suggestedVerdict).toBe(Verdict.VALID);
      expect(result.suggestedFaultParty).toBe(FaultParty.DRIVER);
      expect(result.suggestedSeverity).toBe(Severity.HIGH);
      expect(result.confidence).toBe(0.8);
      expect(result.suggestedActions).toHaveLength(2);
      expect(result.suggestedActions[0]).toMatchObject({
        type: "FINE",
        targetType: "DRIVER",
        amount: 150000,
        durationDays: null,
      });
      expect(result.suggestedActions[1]).toMatchObject({
        type: "SUSPEND",
        amount: null,
        durationDays: 3,
      });
      expect(result.usage.totalTokens).toBe(30);
    });

    it("coi thiếu nguồn bắt buộc là cảnh báo", async () => {
      const { service } = makeService(VALID_RAW);
      const result = await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      expect(result.sourcesMissing.join(" ")).toContain("D4");
      expect(result.sourcesUsed.join(" ")).toContain("D1");
      expect(result.warnings.join(" ")).toContain(
        "Thiếu nguồn dữ liệu bắt buộc",
      );
    });

    it("thay enum sai bằng giá trị an toàn và ghi cảnh báo", async () => {
      const { service } = makeService({
        ...VALID_RAW,
        suggestedVerdict: "MAYBE",
        suggestedFaultParty: "ALIEN",
        suggestedSeverity: "SUPER_HIGH",
        confidence: 7,
      });
      const result = await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      expect(result.suggestedVerdict).toBe(Verdict.INCONCLUSIVE);
      expect(result.suggestedFaultParty).toBe(FaultParty.INCONCLUSIVE);
      // severity không hợp lệ → giữ mức hiện tại của vụ việc
      expect(result.suggestedSeverity).toBe(Severity.HIGH);
      expect(result.confidence).toBe(1);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining("suggestedVerdict"),
          expect.stringContaining("suggestedFaultParty"),
          expect.stringContaining("suggestedSeverity"),
        ]),
      );
    });

    it("loại bỏ hình phạt nhắm vào bên không tham gia vụ việc", async () => {
      const { service } = makeService({
        ...VALID_RAW,
        suggestedActions: [
          { type: "BAN", targetType: "MERCHANT", reason: "Không liên quan" },
          { type: "NO_ACTION", targetType: "DRIVER", reason: "Không phạt" },
          {
            type: "COMPENSATION",
            targetType: "CONSUMER",
            amount: -5,
            reason: "Hoàn tiền",
          },
        ],
      });
      const result = await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      expect(result.suggestedActions).toHaveLength(1);
      expect(result.suggestedActions[0]).toMatchObject({
        type: "COMPENSATION",
        targetType: "CONSUMER",
        amount: null,
      });
      expect(result.warnings.join(" ")).toContain(
        "MERCHANT không phải bên tham gia",
      );
    });

    it("bỏ qua ảnh khi skipImages = true", async () => {
      const { service, contextService } = makeService(VALID_RAW);
      await service.analyzeCase(
        "case-1",
        { skipImages: true },
        ADMIN_USER as any,
      );
      expect(contextService.build).toHaveBeenCalledWith("case-1", 0);
    });

    it("cắt ngắn output dài để admin đọc trong ~30 giây", async () => {
      const { service } = makeService({
        ...VALID_RAW,
        summary: "Câu một. Câu hai. Câu ba. Câu bốn.",
        keyFindings: ["a", "b", "c", "d", "e"],
        evidenceGaps: ["x", "y", "z", "w"],
        riskFlags: ["r1", "r2", "r3"],
        followUpQuestions: ["q1", "q2", "q3", "q4"],
        respondentQuestions: ["t1", "t2", "t3", "t4"],
      });

      const result = await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      expect(result.summary).toBe("Câu một. Câu hai.");
      expect(result.keyFindings).toHaveLength(3);
      expect(result.evidenceGaps).toHaveLength(3);
      expect(result.riskFlags).toHaveLength(2);
      expect(result.followUpQuestions).toHaveLength(3);
      expect(result.respondentQuestions).toHaveLength(3);
      expect(result.warnings.join(" ")).toContain("chỉ giữ");
    });
  });

  describe("tự phân tích nền & duyệt gợi ý", () => {
    it("AI tự chạy khi có khiếu nại mới và lưu bản phân tích (source=AUTO)", async () => {
      const { service, analysisRepo } = makeService(VALID_RAW);

      await service.triggerAutoAnalysis("case-1");

      expect(analysisRepo.saveAnalysis).toHaveBeenCalledTimes(1);
      expect(analysisRepo.saveAnalysis.mock.calls[0][0]).toMatchObject({
        caseId: "case-1",
        caseNumber: "CASE-2026-000001",
        source: "AUTO",
      });
    });

    it("đặt source=MANUAL khi admin bấm phân tích", async () => {
      const { service, analysisRepo } = makeService(VALID_RAW);

      await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      expect(analysisRepo.saveAnalysis.mock.calls[0][0]).toMatchObject({
        source: "MANUAL",
      });
    });

    it("bỏ qua tự phân tích khi trợ lý AI chưa sẵn sàng — không ném lỗi", async () => {
      const { service, gemini, analysisRepo } = makeService(VALID_RAW);
      gemini.hasApiKey = false;

      await expect(
        service.triggerAutoAnalysis("case-1"),
      ).resolves.toBeUndefined();
      expect(analysisRepo.saveAnalysis).not.toHaveBeenCalled();
    });

    it("lỗi lưu bản phân tích không làm hỏng kết quả trả cho admin", async () => {
      const { service, analysisRepo } = makeService(VALID_RAW);
      analysisRepo.saveAnalysis.mockRejectedValueOnce(new Error("db down"));

      const result = await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      expect(result.suggestedVerdict).toBe(Verdict.VALID);
    });

    it("lưu vết admin duyệt gợi ý (ai duyệt, ghi chú gì)", async () => {
      const { service, analysisRepo } = makeService(VALID_RAW);

      await service.reviewAnalysis(
        "case-1",
        "ACCEPTED",
        ADMIN_USER as any,
        " ok ",
      );

      expect(analysisRepo.saveReview).toHaveBeenCalledWith(
        "case-1",
        "ACCEPTED",
        "admin-1",
        "ok",
      );
    });

    it("health cho biết có tự phân tích hay không", () => {
      const { service } = makeService(VALID_RAW);
      expect(service.getHealth().autoAnalyze).toBe(true);
    });
  });
});

describe("assistant prompt helpers", () => {
  it("đánh dấu nguồn không có và cảnh báo nguồn bắt buộc còn thiếu", () => {
    const prompt = buildUserPrompt(makeSnapshot());
    expect(prompt).toContain("D1 · Chi tiết đơn hàng: CÓ");
    expect(prompt).toContain("D4 · Vết GPS của tài xế: KHÔNG CÓ");
    expect(prompt).toContain("CẢNH BÁO DỮ LIỆU");
    expect(prompt).toContain("Đã đính kèm 1 ảnh bằng chứng");
  });

  it("lược gọn chuỗi và mảng quá dài", () => {
    const long = {
      text: "x".repeat(500),
      items: Array.from({ length: 30 }, (_, i) => i),
    };
    const compacted = compactForPrompt(long) as {
      text: string;
      items: unknown[];
    };
    expect(compacted.text.length).toBeLessThan(500);
    expect(compacted.text.endsWith("…")).toBe(true);
    expect(compacted.items).toHaveLength(26);
    expect(String(compacted.items[25])).toContain("và 5 phần tử nữa");
  });
});
