import { AssistantService } from "../../modules/assistant/application/assistant.service";
import {
  AI_IMAGE_SYSTEM_INSTRUCTION,
  AI_SYSTEM_INSTRUCTION,
  buildImagePrompt as imageBuildPrompt,
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
    reporterImagesAttached: 1,
    respondentImagesAttached: 0,
    deliveryProofPhotoUrl: null,
    deliveryProofImageAttached: false,
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

  const caseRepo = {
    findByIdOrFail: jest
      .fn()
      .mockResolvedValue({ caseRespondentRespondedAt: null }),
  } as any;

  const caseService = {
    applyAiDecision: jest.fn().mockResolvedValue({
      applied: true,
      verdict: "VALID",
      caseStatus: "RESOLVED",
      penalties: 1,
      notified: ["REPORTER", "RESPONDENT"],
      evidenceRequestedFrom: [],
      summary:
        "Đã áp dụng phán quyết VALID và ghi 1 hình phạt; đã thông báo cho cả hai bên.",
    }),
  } as any;

  return {
    service: new AssistantService(
      contextService,
      gemini,
      analysisRepo,
      caseRepo,
      caseService,
    ),
    gemini,
    contextService,
    analysisRepo,
    caseRepo,
    caseService,
  };
}

const VALID_RAW = {
  summary: "Đơn được đánh dấu đã giao nhưng không có bằng chứng bàn giao.",
  reporterImages: {
    support: "SUPPORTS",
    analysis:
      "Ảnh chụp hộp hàng bị móp méo và nước lèo tràn ra ngoài. Khớp với mô tả khiếu nại của khách.",
  },
  respondentImages: {
    support: "NO_IMAGE",
    analysis: "Không có ảnh bằng chứng",
  },
  sideComparison:
    "Khách nói hàng bị đổ và ảnh của khách cho thấy hộp móp; tài xế chưa có ảnh đối chiếu.",
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
        suggestedVerdict: "INCONCLUSIVE",
        summary: "Câu một. Câu hai. Câu ba. Câu bốn.",
        keyFindings: ["a", "b", "c", "d", "e"],
        evidenceGaps: ["x", "y", "z", "w"],
        riskFlags: ["r1", "r2", "r3"],
        followUpQuestions: ["q1", "q2", "q3", "q4"],
        respondentQuestions: ["t1", "t2", "t3", "t4"],
      });

      const result = await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      expect(result.summary).toBe("Câu một. Câu hai.");
      expect(result.keyFindings).toHaveLength(5);
      expect(result.evidenceGaps).toHaveLength(4);
      expect(result.riskFlags).toHaveLength(3);
      expect(result.followUpQuestions).toHaveLength(2);
      expect(result.respondentQuestions).toHaveLength(2);
      expect(result.warnings.join(" ")).toContain("chỉ giữ");
    });

    it("đã kết luận được ⇒ KHÔNG hỏi thêm bên nào", async () => {
      const { service } = makeService({
        ...VALID_RAW,
        suggestedVerdict: "VALID",
        suggestedFaultParty: "MERCHANT",
        followUpQuestions: ["Bạn có muốn đặt lại món không?"],
        respondentQuestions: ["Lý do từ chối đơn là gì?"],
      });

      const result = await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      expect(result.followUpQuestions).toEqual([]);
      expect(result.respondentQuestions).toEqual([]);
      expect(result.warnings.join(" ")).toContain("đã đủ căn cứ kết luận");
    });

    it("bỏ câu hỏi không phải bằng chứng (ý muốn / cảm nhận)", async () => {
      const { service } = makeService({
        ...VALID_RAW,
        suggestedVerdict: "INCONCLUSIVE",
        followUpQuestions: [
          "Bạn có muốn đặt lại món từ nhà hàng này không?",
          "Bạn có ảnh mở gói lúc nhận hàng không?",
        ],
        respondentQuestions: [
          "Bạn sẽ giải quyết tình huống này như thế nào?",
          "Bạn có phiếu chuẩn bị món không?",
        ],
      });

      const result = await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      expect(result.followUpQuestions).toEqual([
        "Bạn có ảnh mở gói lúc nhận hàng không?",
      ]);
      expect(result.respondentQuestions).toEqual([
        "Bạn có phiếu chuẩn bị món không?",
      ]);
      expect(result.warnings.join(" ")).toContain("không phù hợp");
    });

    it("không coi nhà hàng ít đơn là dấu hiệu rủi ro", async () => {
      const { service } = makeService({
        ...VALID_RAW,
        riskFlags: [
          "Nhà hàng chưa có kinh nghiệm xử lý đơn",
          "Thiếu minh chứng thông báo từ chối",
        ],
      });

      const result = await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      expect(result.riskFlags).toEqual(["Thiếu minh chứng thông báo từ chối"]);
    });

    it("phân tích ảnh TÁCH theo từng bên (không gộp chung)", async () => {
      const { service } = makeService(
        {
          ...VALID_RAW,
          reporterImages: {
            support: "CONTRADICTS",
            analysis:
              "Ảnh là tô bún ăn tại quán, không có bao bì giao hàng. Không khớp mô tả khiếu nại.",
          },
          respondentImages: {
            support: "SUPPORTS",
            analysis:
              "Ảnh tài xế gửi cho thấy hộp hàng nguyên vẹn lúc bàn giao, có tem niêm phong.",
          },
          sideComparison:
            "Ảnh khách không phải hàng mang đi; ảnh tài xế cho thấy hộp nguyên vẹn.",
        },
        makeSnapshot({
          imagesAttached: 3,
          reporterImagesAttached: 2,
          respondentImagesAttached: 1,
        }),
      );

      const result = await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      expect(result.imagesAnalyzed).toBe(3);
      expect(result.reporterImages).toMatchObject({
        attached: 2,
        analyzed: 2,
        support: "CONTRADICTS",
      });
      expect(result.reporterImages.analysis).toMatch(/không khớp/i);
      expect(result.respondentImages).toMatchObject({
        attached: 1,
        analyzed: 1,
        support: "SUPPORTS",
      });
      expect(result.sideComparison).toMatch(/nguyên vẹn/i);
    });

    it("dùng ảnh giao hàng (tài xế chụp) làm bằng chứng hệ thống", async () => {
      const proofUrl = "http://localhost:3010/api/v1/upload/delivery/proof.jpg";
      const { service } = makeService(
        VALID_RAW,
        makeSnapshot({
          imagesAttached: 3,
          reporterImagesAttached: 2,
          respondentImagesAttached: 0,
          deliveryProofPhotoUrl: proofUrl,
          deliveryProofImageAttached: true,
        }),
      );

      const result = await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      expect(result.deliveryProof).toMatchObject({
        photoUrl: proofUrl,
        analyzed: true,
      });
      // Ảnh hệ thống chiếm 1 suất: 2 ảnh còn lại thuộc bên khiếu nại
      expect(result.reporterImages.analyzed).toBe(2);
    });

    it("không có ảnh giao hàng ⇒ deliveryProof rỗng, không bịa", async () => {
      const { service } = makeService(VALID_RAW);

      const result = await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      expect(result.deliveryProof).toMatchObject({
        photoUrl: null,
        analyzed: false,
        matchesOrder: null,
      });
    });

    it("ảnh của khách mâu thuẫn với thiệt hại (hư hỏng) ⇒ INVALID, không hỏi thêm", async () => {
      const base = makeSnapshot();
      const { service } = makeService(
        {
          ...VALID_RAW,
          suggestedVerdict: "INCONCLUSIVE",
          suggestedFaultParty: "INCONCLUSIVE",
          confidence: 0.4,
          reporterImages: {
            support: "CONTRADICTS",
            analysis: "Đồ ăn còn nguyên vẹn, không có dấu hiệu đổ vỡ.",
          },
          respondentImages: {
            support: "NEUTRAL",
            analysis: "Túi đóng gói nguyên vẹn lúc bàn giao.",
          },
          followUpQuestions: ["Bạn nhận đồ ăn lúc mấy giờ?"],
          respondentQuestions: ["Bạn đã giao đơn thế nào?"],
        },
        makeSnapshot({
          case: {
            ...base.case,
            category: CaseCategory.DAMAGED_ITEM,
            subject: "Hàng bị đổ vỡ",
            description: "Khách nói hộp hàng bị móp và nước lèo tràn ra ngoài",
          },
          imagesAttached: 2,
          reporterImagesAttached: 1,
          respondentImagesAttached: 1,
        }),
      );

      const result = await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      expect(result.suggestedVerdict).toBe("INVALID");
      expect(result.suggestedFaultParty).toBe("CUSTOMER");
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.followUpQuestions).toEqual([]);
      expect(result.respondentQuestions).toEqual([]);
      expect(result.suggestedActions).toEqual([]);
      expect(result.suggestedResolutionNote).toContain("không có căn cứ");
      expect(result.warnings.join(" ")).toContain("Trọng số bằng chứng");
    });

    it("giao nhầm món: ảnh khách bị đánh CONTRADICTS KHÔNG được lật INVALID", async () => {
      const base = makeSnapshot();
      const { service } = makeService(
        {
          ...VALID_RAW,
          suggestedVerdict: "INCONCLUSIVE",
          suggestedFaultParty: "INCONCLUSIVE",
          confidence: 0.5,
          reporterImages: {
            support: "CONTRADICTS",
            analysis:
              "Ảnh cho thấy món khác với đơn đã đặt — đây là ảnh ủng hộ khiếu nại sai món.",
          },
          suggestedActions: [],
        },
        makeSnapshot({
          case: {
            ...base.case,
            category: CaseCategory.WRONG_ITEM,
            subject: "Giao nhầm món",
            description: "Đặt cơm gà nhưng nhận phở bò",
          },
          imagesAttached: 2,
          reporterImagesAttached: 1,
          respondentImagesAttached: 1,
        }),
      );

      const result = await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      // Sai món không phải danh mục được phép ép INVALID: giữ nguyên để admin
      // xem ảnh + món đã đặt và quyết định, không đổ lỗi khách một cách máy móc.
      expect(result.suggestedVerdict).toBe("INCONCLUSIVE");
      expect(result.suggestedFaultParty).not.toBe("CUSTOMER");
      expect(result.warnings.join(" ")).not.toContain("Trọng số bằng chứng");
    });

    it("AI nói INVALID nhưng ảnh giao hàng lệch món + ảnh khách ủng hộ ⇒ hạ INCONCLUSIVE", async () => {
      const base = makeSnapshot();
      const { service } = makeService(
        {
          ...VALID_RAW,
          suggestedVerdict: "INVALID",
          suggestedFaultParty: "CUSTOMER",
          confidence: 0.9,
          reporterImages: {
            support: "SUPPORTS",
            analysis: "Ảnh cho thấy phở bò, không phải cơm gà đã đặt.",
          },
          deliveryProof: {
            matchesOrder: "MISMATCH",
            itemsSeen: "Hộp phở bò",
            analysis: "Ảnh tài xế chụp phở bò, không khớp đơn cơm gà.",
          },
          suggestedActions: [],
        },
        makeSnapshot({
          case: {
            ...base.case,
            category: CaseCategory.WRONG_ITEM,
            subject: "Giao nhầm món",
            description: "Đặt cơm gà nhưng nhận phở bò",
          },
          imagesAttached: 2,
          reporterImagesAttached: 1,
          respondentImagesAttached: 0,
          deliveryProofPhotoUrl:
            "http://localhost:3010/api/v1/upload/delivery/proof.jpg",
          deliveryProofImageAttached: true,
        }),
      );

      const result = await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      expect(result.suggestedVerdict).toBe("INCONCLUSIVE");
      expect(result.suggestedFaultParty).toBe("INCONCLUSIVE");
      expect(result.suggestedResolutionNote).toContain("Chưa đủ căn cứ");
      expect(result.warnings.join(" ")).toContain("Bằng chứng mâu thuẫn");
    });

    it("model đã kết luận ⇒ giữ nguyên verdict, chỉ ghi nhận trọng số", async () => {
      const { service } = makeService({
        ...VALID_RAW,
        suggestedVerdict: "VALID",
        suggestedFaultParty: "MERCHANT",
        reporterImages: {
          support: "CONTRADICTS",
          analysis: "Ảnh không thấy hư hỏng.",
        },
      });

      const result = await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      expect(result.suggestedVerdict).toBe("VALID");
      expect(result.suggestedFaultParty).toBe("MERCHANT");
      expect(result.evidenceWeight.reporterSelfContradiction).toBe(true);
    });

    it("tính trọng số bằng chứng: ảnh + hệ thống so với lời khai", async () => {
      const { service } = makeService(
        VALID_RAW,
        makeSnapshot({
          imagesAttached: 3,
          reporterImagesAttached: 2,
          respondentImagesAttached: 0,
          deliveryProofPhotoUrl:
            "http://localhost:3010/api/v1/upload/delivery/proof.jpg",
          deliveryProofImageAttached: true,
        }),
      );

      const result = await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      // ảnh: hệ thống 35 + khách 25 = 60; dữ liệu hệ thống: 1 nguồn có dữ liệu = 2%
      expect(result.evidenceWeight).toMatchObject({
        images: 60,
        system: 2,
        testimony: 5,
        objective: 62,
        basis: "IMAGES",
      });
    });

    it("bên không có ảnh ⇒ NO_IMAGE dù model nói khác", async () => {
      const { service } = makeService(
        {
          ...VALID_RAW,
          reporterImages: { support: "SUPPORTS", analysis: "" },
          respondentImages: { support: "SUPPORTS", analysis: "" },
        },
        makeSnapshot({
          imagesAttached: 0,
          reporterImagesAttached: 0,
          respondentImagesAttached: 0,
          imagesSkipped: [],
        }),
      );

      const result = await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      expect(result.imagesAnalyzed).toBe(0);
      expect(result.reporterImages.support).toBe("NO_IMAGE");
      expect(result.respondentImages.support).toBe("NO_IMAGE");
      expect(result.reporterImages.analysis).toBe("Không có ảnh bằng chứng");
      expect(result.warnings.join(" ")).toContain("đã đặt NO_IMAGE");
    });

    it("support lạ ⇒ NEUTRAL + cảnh báo (theo từng bên)", async () => {
      const { service } = makeService({
        ...VALID_RAW,
        reporterImages: { support: "MAYBE", analysis: "abc" },
      });

      const result = await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      expect(result.reporterImages.support).toBe("NEUTRAL");
      expect(result.warnings.join(" ")).toContain("reporterImages.support");
    });

    it("ảnh bị bỏ (model không nhận ảnh) ⇒ cả hai bên NO_IMAGE", async () => {
      const { service, gemini } = makeService(VALID_RAW);
      gemini.generateJson.mockResolvedValueOnce({
        data: VALID_RAW,
        rawText: JSON.stringify(VALID_RAW),
        model: "glm-4.5-flash",
        endpoint: "https://example.invalid/chat/completions",
        usage: { promptTokens: 1, outputTokens: 1, totalTokens: 2 },
        imagesUsed: 0,
        notes: [
          "Không phân tích 1 ảnh bằng chứng (model vision lỗi) — gợi ý dưới đây chỉ dựa trên dữ liệu chữ.",
        ],
      });

      const result = await service.analyzeCase("case-1", {}, ADMIN_USER as any);

      expect(result.imagesAnalyzed).toBe(0);
      expect(result.reporterImages.support).toBe("NO_IMAGE");
      expect(result.respondentImages.support).toBe("NO_IMAGE");
      expect(result.warnings.join(" ")).toContain("Không phân tích 1 ảnh");
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

    it("duyệt ⇒ áp dụng phán quyết/hình phạt và lưu vết duyệt", async () => {
      const { service, analysisRepo, caseService } = makeService(VALID_RAW);
      analysisRepo.findByCaseId.mockResolvedValueOnce({
        caseId: "case-1",
        caseNumber: "CASE-2026-000001",
        source: "AUTO",
        createdAt: "2026-10-17T10:00:00.000Z",
        suggestion: VALID_RAW as any,
        review: null,
        stale: false,
      });

      const result = await service.reviewAnalysis(
        "case-1",
        "ACCEPTED",
        ADMIN_USER as any,
        " ok ",
      );

      expect(caseService.applyAiDecision).toHaveBeenCalledWith(
        "case-1",
        expect.objectContaining({
          verdict: "VALID",
          faultParty: "DRIVER",
          actions: expect.arrayContaining([
            expect.objectContaining({ type: "FINE", targetType: "DRIVER" }),
          ]),
        }),
        ADMIN_USER,
      );
      expect(analysisRepo.saveReview).toHaveBeenCalledWith(
        "case-1",
        "ACCEPTED",
        "admin-1",
        "ok",
      );
      expect(result?.outcome.applied).toBe(true);
      expect(result?.outcome.penalties).toBe(1);
    });

    it("bỏ qua ⇒ KHÔNG áp dụng gì vào vụ việc", async () => {
      const { service, analysisRepo, caseService } = makeService(VALID_RAW);
      analysisRepo.findByCaseId.mockResolvedValueOnce({
        caseId: "case-1",
        caseNumber: "CASE-2026-000001",
        source: "AUTO",
        createdAt: "2026-10-17T10:00:00.000Z",
        suggestion: VALID_RAW as any,
        review: null,
        stale: false,
      });

      const result = await service.reviewAnalysis(
        "case-1",
        "REJECTED",
        ADMIN_USER as any,
      );

      expect(caseService.applyAiDecision).not.toHaveBeenCalled();
      expect(result?.outcome.applied).toBe(false);
    });

    it("vụ việc chưa có bản phân tích ⇒ review trả null", async () => {
      const { service, caseService } = makeService(VALID_RAW);

      const result = await service.reviewAnalysis(
        "case-1",
        "ACCEPTED",
        ADMIN_USER as any,
      );

      expect(result).toBeNull();
      expect(caseService.applyAiDecision).not.toHaveBeenCalled();
    });

    it("health cho biết có tự phân tích hay không", () => {
      const { service } = makeService(VALID_RAW);
      expect(service.getHealth().autoAnalyze).toBe(true);
    });
  });

  describe("bản phân tích cũ (stale)", () => {
    const record = {
      caseId: "case-1",
      caseNumber: "CASE-2026-000001",
      source: "AUTO" as const,
      createdAt: "2026-10-17T10:00:00.000Z",
      suggestion: VALID_RAW as any,
      review: null,
    };

    it("phản hồi của bên bị khiếu nại có SAU bản phân tích ⇒ stale=true", async () => {
      const { service, analysisRepo, caseRepo } = makeService(VALID_RAW);
      analysisRepo.findByCaseId.mockResolvedValueOnce(record);
      caseRepo.findByIdOrFail.mockResolvedValueOnce({
        caseRespondentRespondedAt: new Date("2026-10-17T11:00:00.000Z"),
      });

      const result = await service.getAnalysis("case-1");

      expect(result?.stale).toBe(true);
    });

    it("bản phân tích mới hơn phản hồi ⇒ stale=false", async () => {
      const { service, analysisRepo, caseRepo } = makeService(VALID_RAW);
      analysisRepo.findByCaseId.mockResolvedValueOnce(record);
      caseRepo.findByIdOrFail.mockResolvedValueOnce({
        caseRespondentRespondedAt: new Date("2026-10-17T09:00:00.000Z"),
      });

      const result = await service.getAnalysis("case-1");

      expect(result?.stale).toBe(false);
    });

    it("chưa có phản hồi ⇒ stale=false", async () => {
      const { service, analysisRepo } = makeService(VALID_RAW);
      analysisRepo.findByCaseId.mockResolvedValueOnce(record);

      const result = await service.getAnalysis("case-1");

      expect(result?.stale).toBe(false);
    });

    it("có bổ sung bằng chứng/cập nhật sau bản phân tích ⇒ stale=true", async () => {
      const { service, analysisRepo, caseRepo } = makeService(VALID_RAW);
      analysisRepo.findByCaseId.mockResolvedValueOnce(record);
      caseRepo.findByIdOrFail.mockResolvedValueOnce({
        caseRespondentRespondedAt: null,
        updatedAt: new Date("2026-10-17T12:00:00.000Z"),
      });

      const result = await service.getAnalysis("case-1");

      expect(result?.stale).toBe(true);
    });
  });
});

describe("assistant prompt helpers", () => {
  it("đánh dấu nguồn không có và cảnh báo nguồn bắt buộc còn thiếu", () => {
    const prompt = buildUserPrompt(makeSnapshot());
    expect(prompt).toContain("D1 · Chi tiết đơn hàng: CÓ");
    expect(prompt).toContain("D4 · Vết GPS của tài xế: KHÔNG CÓ");
    expect(prompt).toContain("CẢNH BÁO DỮ LIỆU");
    expect(prompt).toContain("ẢNH BẰNG CHỨNG ĐÍNH KÈM — 1 ảnh");
    expect(prompt).toContain("[BÊN KHIẾU NẠI]");
  });

  it("đưa MÓN ĐÃ ĐẶT làm mốc đối chiếu + playbook giao nhầm món", () => {
    const snapshot = makeSnapshot({
      orderItems: [
        { name: "Cơm gà", quantity: 1, options: "ít cay" },
        { name: "Trà đào", quantity: 2 },
      ],
      orderTotalAmount: 95000,
    });

    const prompt = buildUserPrompt(snapshot, {
      deliveryProof: {
        visibleItems: "Một hộp phở bò",
        matchesOrder: "MISMATCH",
        analysis: "Ảnh tài xế cho thấy phở bò, không có trong đơn.",
      },
      reporterImages: {
        visibleItems: "Hộp phở bò đã mở",
        support: "SUPPORTS",
        analysis: "Khách chụp đúng món phở bò nhận được.",
      },
      respondentImages: {
        visibleItems: "Không có",
        support: "NO_IMAGE",
        analysis: "Không có ảnh bằng chứng",
      },
      sideComparison:
        "Cả ảnh tài xế và ảnh khách đều là phở bò, không khớp đơn.",
    });

    expect(prompt).toContain("<MON_DA_DAT>");
    expect(prompt).toContain("1 × Cơm gà · ít cay");
    expect(prompt).toContain("2 × Trà đào");
    expect(prompt).toContain("<PHAN_TICH_ANH>");
    expect(prompt).toContain('"matchesOrder": "MISMATCH"');
    expect(imageBuildPrompt(snapshot)).toContain("MÓN KHÁCH ĐÃ ĐẶT");
    expect(AI_SYSTEM_INSTRUCTION).toContain("PLAYBOOK SAI MÓN / THIẾU MÓN");
    expect(AI_IMAGE_SYSTEM_INSTRUCTION).toContain(
      "Hai ảnh giống nhau vẫn có thể CÙNG SAI MÓN",
    );
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

describe("assistant prompt — chỉ hỏi khi thật sự cần", () => {
  it("có luật bắt buộc + playbook từ chối đơn của nhà hàng", () => {
    expect(AI_SYSTEM_INSTRUCTION).toContain("CHỈ HỎI KHI THẬT SỰ CẦN");
    expect(AI_SYSTEM_INSTRUCTION).toContain("followUpQuestions = []");
    expect(AI_SYSTEM_INSTRUCTION).toContain("không hỏi tài xế");
    expect(AI_SYSTEM_INSTRUCTION).toContain("UNAUTHORIZED_CANCEL");
    expect(AI_SYSTEM_INSTRUCTION).toContain("ĐƠN ĐẦU TIÊN");
  });
});
