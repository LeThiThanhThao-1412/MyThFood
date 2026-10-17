import { Inject, Injectable, Logger, forwardRef } from "@nestjs/common";
import { FaultParty, Severity, Verdict } from "../../case/domain/case.enums";
import {
  AI_ACTION_TYPES,
  AI_IMAGE_SUPPORT,
  AI_TARGET_TYPES,
  AiActionType,
  AiAnalysisSource,
  AiEvidenceWeight,
  AiImageSupport,
  AiReviewDecision,
  AiSideImageAnalysis,
  AiSuggestedAction,
  AiTargetType,
  AssistantHealth,
  CASE_CONTEXT_SOURCES,
  CaseAiAnalysisRecord,
  CaseAiReviewResult,
  CaseAiSuggestion,
  CaseContextSnapshot,
} from "../domain/assistant.types";
import {
  AI_SUGGESTION_SCHEMA,
  AI_SYSTEM_INSTRUCTION,
  buildUserPrompt,
} from "../domain/assistant.prompt";
import { ASSISTANT_LLM, AssistantLlmClient } from "../infrastructure/llm.types";
import { CaseAiAnalysisRepository } from "../infrastructure/analysis.repository";
import { CaseRepository } from "../../case/infrastructure/case.repository";
import {
  CaseService,
  AiDecisionOutcome,
} from "../../case/application/case.service";
import { CaseContextService } from "./case-context.service";
import { AnalyzeCaseDto } from "./dtos/assistant.dto";
import type { AuthUser } from "../../case/application/case.service";

/** Dạng thô model trả về — chưa tin tưởng được, phải chuẩn hoá. */
type RawSuggestion = Record<string, any>;

interface NormalizedSuggestion {
  summary: string;
  reporterImages: AiSideImageAnalysis;
  respondentImages: AiSideImageAnalysis;
  deliveryProofAnalyzed: boolean;
  sideComparison: string;
  suggestedVerdict: Verdict;
  suggestedFaultParty: FaultParty;
  suggestedSeverity: Severity;
  confidence: number;
  keyFindings: string[];
  evidenceGaps: string[];
  riskFlags: string[];
  suggestedActions: AiSuggestedAction[];
  suggestedResolutionNote: string;
  followUpQuestions: string[];
  respondentQuestions: string[];
  warnings: string[];
}

/**
 * Giới hạn độ dài output để admin đọc trong ~30 giây.
 *
 * Model có thể trả dài bất kể prompt dặn gì, nên tầng `normalize()` chốt lại lần
 * cuối — đây là "hợp đồng" về độ dài mà UI dựa vào.
 */
const LIMITS = {
  summaryChars: 240,
  summarySentences: 2,
  imageAnalysisChars: 400,
  imageAnalysisSentences: 3,
  sideComparisonChars: 420,
  noteChars: 420,
  noteSentences: 3,
  keyFindings: 3,
  evidenceGaps: 3,
  riskFlags: 2,
  questions: 2,
  actions: 4,
  bulletChars: 220,
} as const;

/** Câu hỏi không phải bằng chứng / không làm thay đổi kết luận. */
const QUESTION_NOISE =
  /(có muốn|muốn đặt lại|đặt lại món|sẽ giải quyết|giải quyết tình huống|cảm thấy|hài lòng|mong muốn|ưu tiên gì)/i;

/** "Dấu hiệu rủi ro" không phải rủi ro gian lận. */
const RISK_NOISE =
  /(ít đơn|đơn đầu tiên|chưa có kinh nghiệm|mới tham gia|chưa có đơn hàng nào|kinh nghiệm xử lý)/i;

/** Ghi chú phán quyết thay thế khi guard trọng số lật sang `INVALID`. */
const NOTE_SELF_CONTRADICTION =
  "Khiếu nại không có căn cứ: ảnh do bên khiếu nại tự cung cấp không khớp với mô tả thiệt hại. " +
  "Đề xuất đóng vụ việc (INVALID), không áp dụng hình phạt, thông báo kết quả cho cả hai bên.";

/** Tài khoản hệ thống dùng khi AI tự phân tích (không có admin bấm). */
const SYSTEM_ACTOR: AuthUser = {
  userId: "system:assistant",
  roles: ["ADMIN"],
};

const VERDICT_VALUES = Object.values(Verdict);
const FAULT_VALUES = Object.values(FaultParty);
const SEVERITY_VALUES = Object.values(Severity);

/**
 * Điều phối: dựng ngữ cảnh → gọi LLM (provider chọn bằng `AI_PROVIDER`) →
 * chuẩn hoá kết quả.
 *
 * Service này KHÔNG tự thực thi hình phạt hay đổi trạng thái vụ việc: kết quả
 * chỉ là gợi ý để admin quyết định (human-in-the-loop).
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly contextService: CaseContextService,
    @Inject(ASSISTANT_LLM) private readonly llm: AssistantLlmClient,
    private readonly analysisRepo: CaseAiAnalysisRepository,
    private readonly caseRepo: CaseRepository,
    // forwardRef vì CaseModule cũng cần AssistantService (tự phân tích nền).
    @Inject(forwardRef(() => CaseService))
    private readonly caseService: CaseService,
  ) {}

  /**
   * Có tự phân tích khi vụ việc vừa được tạo không (`AI_AUTO_ANALYZE`, mặc định bật).
   *
   * Bật thì admin mở vụ việc là có sẵn gợi ý để đọc & duyệt; tắt thì quay lại
   * luồng bấm tay như trước.
   */
  get autoAnalyze(): boolean {
    return (
      (process.env.AI_AUTO_ANALYZE ?? "true").trim().toLowerCase() !== "false"
    );
  }

  getHealth(): AssistantHealth {
    return {
      provider: this.llm.provider,
      enabled: this.llm.enabled,
      hasApiKey: this.llm.hasApiKey,
      apiKeyEnv: this.llm.apiKeyEnv,
      apiBase: this.llm.apiBase,
      model: this.llm.model,
      visionModel: this.llm.visionModel ?? null,
      maxEvidenceImages: this.llm.maxEvidenceImages,
      sourceCount: CASE_CONTEXT_SOURCES.length,
      autoAnalyze: this.autoAnalyze,
    };
  }

  /**
   * Chạy nền khi có khiếu nại mới (được `CaseService.create()` gọi).
   *
   * Cố ý **nuốt mọi lỗi**: vụ việc phải được tạo thành công kể cả khi model lỗi,
   * hết quota hay service chưa cấu hình key — admin vẫn bấm "Phân tích" tay được.
   */
  async triggerAutoAnalysis(caseId: string): Promise<void> {
    if (!this.autoAnalyze) {
      this.logger.log(
        `Bỏ qua tự phân tích (AI_AUTO_ANALYZE=false) — case ${caseId}`,
      );
      return;
    }
    if (!this.llm.enabled || !this.llm.hasApiKey) {
      this.logger.log(
        `Bỏ qua tự phân tích vì trợ lý AI chưa sẵn sàng (enabled=${this.llm.enabled}, cóKey=${this.llm.hasApiKey})`,
      );
      return;
    }

    const startedAt = Date.now();
    try {
      const suggestion = await this.analyzeCase(
        caseId,
        {},
        SYSTEM_ACTOR,
        "AUTO",
      );
      this.logger.log(
        `AI tự phân tích ${suggestion.caseNumber} | verdict=${suggestion.suggestedVerdict} ` +
          `confidence=${suggestion.confidence} model=${suggestion.model} ms=${Date.now() - startedAt}`,
      );
    } catch (err: any) {
      this.logger.warn(
        `AI tự phân tích thất bại (case ${caseId}) sau ${Date.now() - startedAt}ms: ${err?.message ?? err}`,
      );
    }
  }

  /** Bản phân tích đã lưu của vụ việc (null nếu chưa có). */
  async getAnalysis(caseId: string): Promise<CaseAiAnalysisRecord | null> {
    try {
      const record = await this.analysisRepo.findByCaseId(caseId);
      if (!record) return null;
      return { ...record, stale: await this.isStale(caseId, record.createdAt) };
    } catch (err: any) {
      // Bảng chưa được tạo (chưa migrate / thiếu entity) không được làm sập
      // panel của cả vụ việc — chỉ coi như "chưa có bản phân tích".
      this.logger.warn(
        `Không đọc được bản phân tích (${caseId}): ${err?.message ?? err}`,
      );
      return null;
    }
  }

  /**
   * Bản phân tích có cũ không?
   *
   * Hiện so sánh với **thời điểm bên bị khiếu nại phản hồi**: AI chạy lúc mở vụ
   * việc (chưa có phản hồi), nên khi có phản hồi mà chưa phân tích lại thì gợi ý
   * đang hiển thị là gợi ý "chưa đọc phản hồi".
   */
  private async isStale(caseId: string, analyzedAt: string): Promise<boolean> {
    try {
      const c = await this.caseRepo.findByIdOrFail(caseId);
      const analyzed = new Date(analyzedAt).getTime();

      // Bên bị khiếu nại phản hồi sau khi phân tích ⇒ chắc chắn cũ.
      const respondedAt = c.caseRespondentRespondedAt;
      if (respondedAt && new Date(respondedAt).getTime() > analyzed)
        return true;

      // Có cập nhật khác sau đó (bổ sung bằng chứng, đổi trạng thái...) ⇒ cũ.
      const updatedAt = c.updatedAt;
      return !!updatedAt && new Date(updatedAt).getTime() > analyzed + 1000;
    } catch {
      return false;
    }
  }

  /**
   * Admin duyệt / bỏ qua gợi ý AI.
   *
   * - `ACCEPTED` ⇒ **áp dụng luôn** phán quyết + hình phạt vào vụ việc
   *   (`CaseService.applyAiDecision`), rồi thông báo cho bên cần bổ sung bằng chứng
   *   (nếu chưa đủ căn cứ) hoặc cả hai bên (nếu đã có phán quyết).
   * - `REJECTED` ⇒ chỉ lưu vết, không thay đổi vụ việc.
   *
   * @returns `null` nếu vụ việc chưa có bản phân tích.
   */
  async reviewAnalysis(
    caseId: string,
    decision: AiReviewDecision,
    user: AuthUser,
    note?: string,
  ): Promise<CaseAiReviewResult | null> {
    const record = await this.analysisRepo.findByCaseId(caseId);
    if (!record) return null;

    let outcome: AiDecisionOutcome = {
      applied: false,
      verdict: null,
      caseStatus: null,
      penalties: 0,
      notified: [],
      evidenceRequestedFrom: [],
      summary:
        decision === "REJECTED"
          ? "Đã bỏ qua gợi ý AI — vụ việc giữ nguyên để admin tự xử lý."
          : "Không áp dụng được gợi ý.",
    };

    if (decision === "ACCEPTED") {
      outcome = await this.applySuggestion(
        caseId,
        record.suggestion,
        user,
        note,
      );
    }

    const updated = await this.analysisRepo.saveReview(
      caseId,
      decision,
      user.userId,
      note?.trim() || null,
    );

    this.logger.log(
      `Admin ${user.userId} ${decision === "ACCEPTED" ? "duyệt" : "bỏ qua"} ` +
        `gợi ý AI của ${record.caseNumber}` +
        (outcome.applied ? ` → ${outcome.summary}` : ""),
    );

    return { analysis: updated, outcome };
  }

  /**
   * Map gợi ý AI → lệnh áp dụng cho vụ việc.
   *
   * Case module cố ý không import type của assistant, nên chỗ này là ranh giới
   * chuyển đổi duy nhất giữa hai module.
   */
  private async applySuggestion(
    caseId: string,
    suggestion: CaseAiSuggestion,
    user: AuthUser,
    note?: string,
  ): Promise<AiDecisionOutcome> {
    const resolutionNote = (
      note?.trim() ||
      suggestion.suggestedResolutionNote ||
      suggestion.summary ||
      ""
    ).trim();

    // Dùng `caseId` của request (không lấy từ payload đã lưu) để chắc chắn áp
    // đúng vụ việc admin đang mở.
    return this.caseService.applyAiDecision(
      caseId,
      {
        verdict: suggestion.suggestedVerdict,
        faultParty: suggestion.suggestedFaultParty,
        note: resolutionNote,
        actions: (suggestion.suggestedActions ?? []).map((action) => ({
          type: action.type,
          targetType: action.targetType,
          amount: action.amount,
          durationDays: action.durationDays,
          reason: action.reason,
        })),
        reporterQuestions: suggestion.followUpQuestions ?? [],
        respondentQuestions: suggestion.respondentQuestions ?? [],
      },
      user,
    );
  }

  /** Trả về đúng ngữ cảnh sẽ gửi cho model (không tốn token, để debug). */
  async getContext(caseId: string): Promise<CaseContextSnapshot> {
    const { snapshot } = await this.contextService.build(caseId, 0);
    return snapshot;
  }

  /**
   * Phân tích một vụ việc và trả về gợi ý xử lý cho admin.
   *
   * @throws ServiceUnavailableException khi assistant tắt / chưa có API key
   * @throws BadGatewayException khi Gemini trả về nội dung không dùng được
   */
  async analyzeCase(
    caseId: string,
    dto: AnalyzeCaseDto,
    user: AuthUser,
    source: AiAnalysisSource = "MANUAL",
  ) {
    this.llm.assertReady();

    const maxImages = dto.skipImages
      ? 0
      : (dto.maxImages ?? this.llm.maxEvidenceImages);

    const startedAt = Date.now();
    const { snapshot, images } = await this.contextService.build(
      caseId,
      maxImages,
    );

    const response = await this.llm.generateJson<RawSuggestion>({
      systemInstruction: AI_SYSTEM_INSTRUCTION,
      prompt: buildUserPrompt(snapshot),
      schema: AI_SUGGESTION_SCHEMA as unknown as Record<string, unknown>,
      images,
      temperature: 0.2,
      maxOutputTokens: 6000,
    });

    const normalized = this.normalize(
      response.data,
      snapshot,
      response.imagesUsed ?? snapshot.imagesAttached,
    );

    this.logger.log(
      `AI analyzed ${snapshot.case.caseNumber} | model=${response.model} ` +
        `tokens=${response.usage.totalTokens ?? "n/a"} images=${images.length} ` +
        `ms=${Date.now() - startedAt} by=${user.userId}`,
    );

    const suggestion: CaseAiSuggestion = {
      caseId: snapshot.case.id,
      caseNumber: snapshot.case.caseNumber,
      generatedAt: new Date().toISOString(),
      model: response.model,
      summary: normalized.summary,
      imagesAnalyzed: response.imagesUsed ?? snapshot.imagesAttached,
      reporterImages: normalized.reporterImages,
      respondentImages: normalized.respondentImages,
      deliveryProof: {
        photoUrl: snapshot.deliveryProofPhotoUrl ?? null,
        analyzed: normalized.deliveryProofAnalyzed,
      },
      evidenceWeight: this.evidenceWeight(normalized, snapshot),
      sideComparison: normalized.sideComparison,
      suggestedVerdict: normalized.suggestedVerdict,
      suggestedFaultParty: normalized.suggestedFaultParty,
      suggestedSeverity: normalized.suggestedSeverity,
      confidence: normalized.confidence,
      keyFindings: normalized.keyFindings,
      evidenceGaps: normalized.evidenceGaps,
      riskFlags: normalized.riskFlags,
      suggestedActions: normalized.suggestedActions,
      suggestedResolutionNote: normalized.suggestedResolutionNote,
      followUpQuestions: normalized.followUpQuestions,
      respondentQuestions: normalized.respondentQuestions,
      sourcesUsed: snapshot.sources
        .filter((s) => s.available)
        .map((s) => `${s.id} · ${s.name}`),
      sourcesMissing: snapshot.sources
        .filter((s) => !s.available)
        .map((s) => `${s.id} · ${s.name}${s.detail ? ` — ${s.detail}` : ""}`),
      warnings: [
        ...normalized.warnings,
        // Ghi chú kỹ thuật của provider (vd: đã bỏ ảnh bằng chứng vì model chữ).
        ...(response.notes ?? []),
        ...(snapshot.criticalMissingSourceIds.length > 0
          ? [
              `Thiếu nguồn dữ liệu bắt buộc cho danh mục ${snapshot.case.category}: ${snapshot.criticalMissingSourceIds.join(", ")}`,
            ]
          : []),
      ],
      usage: response.usage,
    };

    await this.saveAnalysisQuietly(suggestion, source);

    return suggestion;
  }

  /**
   * Lưu bản phân tích để lần sau admin mở vụ việc là đọc được ngay.
   *
   * Lỗi lưu không được làm hỏng kết quả trả cho admin.
   */
  private async saveAnalysisQuietly(
    suggestion: CaseAiSuggestion,
    source: AiAnalysisSource,
  ): Promise<void> {
    try {
      await this.analysisRepo.saveAnalysis({
        caseId: suggestion.caseId,
        caseNumber: suggestion.caseNumber,
        source,
        suggestion,
      });
    } catch (err: any) {
      this.logger.warn(
        `Không lưu được bản phân tích của ${suggestion.caseNumber}: ${err?.message ?? err}`,
      );
    }
  }

  /**
   * Chuẩn hoá output của model thành kiểu an toàn dùng được.
   *
   * Model có thể trả sai enum / thiếu field / đề xuất phạt bên không có trong
   * vụ việc. Mọi thay đổi đều được ghi lại trong `warnings` để admin biết.
   */
  private normalize(
    raw: RawSuggestion,
    snapshot: CaseContextSnapshot,
    imagesUsed: number,
  ): NormalizedSuggestion {
    const warnings: string[] = [];
    const src: RawSuggestion =
      raw && typeof raw === "object" ? raw : ({} as RawSuggestion);

    const allowedTargets = this.allowedTargetTypes(snapshot);

    // Ảnh gửi cho model theo thứ tự: ảnh hệ thống (tài xế chụp lúc giao, nếu
    // có) → bên khiếu nại → bên bị khiếu nại. Ảnh hệ thống không thuộc bên nào.
    const systemImages = snapshot.deliveryProofImageAttached ? 1 : 0;
    const sideImagesUsed = Math.max(0, imagesUsed - systemImages);
    const reporterAnalyzed = Math.min(
      snapshot.reporterImagesAttached,
      sideImagesUsed,
    );
    const respondentAnalyzed = Math.min(
      snapshot.respondentImagesAttached,
      Math.max(0, sideImagesUsed - reporterAnalyzed),
    );

    const reporterImages = this.normalizeSideImages(
      src.reporterImages,
      snapshot.reporterImagesAttached,
      reporterAnalyzed,
      "reporterImages",
      warnings,
    );
    const respondentImages = this.normalizeSideImages(
      src.respondentImages,
      snapshot.respondentImagesAttached,
      respondentAnalyzed,
      "respondentImages",
      warnings,
    );
    // Ảnh hệ thống chỉ tính là "đã đọc" khi model thật sự nhận được ít nhất 1 ảnh.
    const deliveryProofAnalyzed = systemImages > 0 && imagesUsed > 0;

    const verdictRaw = this.pickEnum(
      src.suggestedVerdict,
      VERDICT_VALUES,
      Verdict.INCONCLUSIVE,
      "suggestedVerdict",
      warnings,
    );
    const faultRaw = this.pickEnum(
      src.suggestedFaultParty,
      FAULT_VALUES,
      FaultParty.INCONCLUSIVE,
      "suggestedFaultParty",
      warnings,
    );

    // Trọng số bằng chứng (prompt luật 25–28): ảnh + dữ liệu hệ thống = 80%,
    // lời khai chỉ 5% ⇒ khi ảnh tự mâu thuẫn thì không được "chưa đủ căn cứ".
    const weighted = this.applyEvidenceWeight(
      verdictRaw,
      faultRaw,
      this.clampConfidence(src.confidence, warnings),
      reporterImages,
      respondentImages,
      warnings,
    );

    // Đã kết luận được thì KHÔNG hỏi thêm bên nào (prompt luật 18) — guard lại
    // vì model hay "hỏi cho có" làm admin/khách phải trả lời vô ích.
    const decided = weighted.verdict !== Verdict.INCONCLUSIVE;

    return {
      summary:
        this.shortenedText(
          this.str(src.summary),
          LIMITS.summarySentences,
          LIMITS.summaryChars,
          "summary",
          warnings,
        ) || "(model không trả về tóm tắt)",
      suggestedVerdict: weighted.verdict,
      suggestedFaultParty: weighted.faultParty,
      suggestedSeverity: this.pickEnum(
        src.suggestedSeverity,
        SEVERITY_VALUES,
        snapshot.case.severity,
        "suggestedSeverity",
        warnings,
      ),
      confidence: weighted.confidence,
      reporterImages,
      respondentImages,
      deliveryProofAnalyzed,
      sideComparison:
        this.shortenedText(
          this.str(src.sideComparison),
          3,
          LIMITS.sideComparisonChars,
          "sideComparison",
          warnings,
        ) || "(model không so sánh hai bên)",
      keyFindings: this.shortList(
        this.strArray(src.keyFindings),
        LIMITS.keyFindings,
        "keyFindings",
        warnings,
      ),
      evidenceGaps: this.shortList(
        this.strArray(src.evidenceGaps),
        LIMITS.evidenceGaps,
        "evidenceGaps",
        warnings,
      ),
      riskFlags: this.shortList(
        this.filterNoise(
          this.strArray(src.riskFlags),
          RISK_NOISE,
          "riskFlags",
          warnings,
        ),
        LIMITS.riskFlags,
        "riskFlags",
        warnings,
      ),
      suggestedActions:
        weighted.verdict === Verdict.INVALID
          ? this.noActionsForInvalid(src, warnings)
          : this.normalizeActions(
              src.suggestedActions,
              allowedTargets,
              warnings,
            ),
      suggestedResolutionNote: weighted.overridden
        ? NOTE_SELF_CONTRADICTION
        : this.shortenedText(
            this.str(src.suggestedResolutionNote),
            LIMITS.noteSentences,
            LIMITS.noteChars,
            "suggestedResolutionNote",
            warnings,
          ),
      followUpQuestions: this.cleanQuestions(
        this.strArray(src.followUpQuestions),
        "followUpQuestions",
        decided,
        warnings,
      ),
      respondentQuestions: this.cleanQuestions(
        this.strArray(src.respondentQuestions),
        "respondentQuestions",
        decided,
        warnings,
      ),
      warnings,
    };
  }

  /** Chuẩn hoá phần phân tích ảnh của **một bên**. */
  private normalizeSideImages(
    raw: unknown,
    attached: number,
    analyzed: number,
    field: string,
    warnings: string[],
  ): AiSideImageAnalysis {
    const src = (raw && typeof raw === "object" ? raw : {}) as Record<
      string,
      unknown
    >;
    const support = this.pickSideSupport(
      src.support,
      analyzed,
      field,
      warnings,
    );
    const analysis =
      this.shortenedText(
        this.str(src.analysis),
        LIMITS.imageAnalysisSentences,
        LIMITS.imageAnalysisChars,
        `${field}.analysis`,
        warnings,
      ) ||
      (analyzed > 0
        ? "(model không nhận xét ảnh bên này)"
        : "Không có ảnh bằng chứng");

    return { attached, analyzed, support, analysis };
  }

  /** Bên không có ảnh (hoặc ảnh bị bỏ) ⇒ NO_IMAGE; giá trị lạ ⇒ NEUTRAL. */
  private pickSideSupport(
    value: unknown,
    analyzed: number,
    field: string,
    warnings: string[],
  ): AiImageSupport {
    const normalized =
      typeof value === "string" ? value.trim().toUpperCase() : "";

    if (analyzed === 0) {
      if (normalized && normalized !== "NO_IMAGE") {
        warnings.push(
          `${field}.support="${normalized}" nhưng bên này không có ảnh gửi model — đã đặt NO_IMAGE.`,
        );
      }
      return "NO_IMAGE";
    }

    const hit = AI_IMAGE_SUPPORT.find(
      (allowed) => allowed !== "NO_IMAGE" && allowed === normalized,
    );
    if (!hit) {
      warnings.push(
        `${field}.support="${String(value)}" không hợp lệ — đã dùng "NEUTRAL".`,
      );
      return "NEUTRAL";
    }
    return hit;
  }

  /** Gộp mọi khoảng trắng/xuống dòng về một dòng để hiển thị gọn trên UI. */
  private oneLine(text: string): string {
    return text.replace(/\s+/g, " ").trim();
  }

  /**
   * `INVALID` ⇒ khiếu nại không có căn cứ nên **không có hình phạt nào** để áp
   * dụng; bỏ luôn đề xuất của model để admin không bấm duyệt nhầm.
   */
  private noActionsForInvalid(
    raw: RawSuggestion,
    warnings: string[],
  ): AiSuggestedAction[] {
    if (
      Array.isArray(raw.suggestedActions) &&
      raw.suggestedActions.length > 0
    ) {
      warnings.push(
        `Bỏ ${raw.suggestedActions.length} hình phạt đề xuất vì khiếu nại không có căn cứ (INVALID).`,
      );
    }
    return [];
  }

  /**
   * Guard theo trọng số bằng chứng (prompt luật 25–28).
   *
   * Ảnh + dữ liệu hệ thống chiếm 80% nên khi **ảnh của chính bên khiếu nại** mâu
   * thuẫn với lời khai (không thấy thiệt hại đã nêu) thì không được trả
   * `INCONCLUSIVE` — chuyển `INVALID` + lỗi thuộc CUSTOMER.
   */
  private applyEvidenceWeight(
    verdict: Verdict,
    faultParty: FaultParty,
    confidence: number,
    reporter: AiSideImageAnalysis,
    respondent: AiSideImageAnalysis,
    warnings: string[],
  ): {
    verdict: Verdict;
    faultParty: FaultParty;
    confidence: number;
    overridden: boolean;
  } {
    if (verdict !== Verdict.INCONCLUSIVE) {
      return { verdict, faultParty, confidence, overridden: false };
    }

    // Khách tự gửi ảnh mà ảnh KHÔNG chứng minh thiệt hại ⇒ khiếu nại yếu; bên
    // bị khiếu nại không có ảnh phản bác ngược lại thì càng rõ.
    const selfContradiction =
      reporter.analyzed > 0 &&
      reporter.support === "CONTRADICTS" &&
      respondent.support !== "CONTRADICTS";

    if (!selfContradiction) {
      return { verdict, faultParty, confidence, overridden: false };
    }

    warnings.push(
      "Trọng số bằng chứng: ảnh của chính bên khiếu nại mâu thuẫn với khiếu nại " +
        "⇒ kết luận INVALID (lỗi thuộc CUSTOMER), không cần hỏi thêm.",
    );

    return {
      verdict: Verdict.INVALID,
      faultParty: FaultParty.CUSTOMER,
      confidence: Math.max(confidence, 0.7),
      overridden: true,
    };
  }

  /**
   * Tính trọng số bằng chứng (%) từ những gì model **thực sự** đã đọc.
   *
   * Không hỏi model (model hay tự chấm cảm tính) — chốt bằng công thức cố định
   * để admin luôn thấy cùng một thang đo giữa các lần phân tích.
   */
  private evidenceWeight(
    suggestion: NormalizedSuggestion,
    snapshot: CaseContextSnapshot,
  ): AiEvidenceWeight {
    // Ảnh: hệ thống 35 + bên khiếu nại 25 + bên bị khiếu nại 15 (tối đa 75).
    const proof = suggestion.deliveryProofAnalyzed ? 35 : 0;
    const reporter = suggestion.reporterImages.analyzed > 0 ? 25 : 0;
    const respondent = suggestion.respondentImages.analyzed > 0 ? 15 : 0;
    const images = proof + reporter + respondent;

    // Dữ liệu hệ thống: mỗi nguồn có dữ liệu 2%, tối đa 20%.
    const available = snapshot.sources.filter(
      (source) => source.available,
    ).length;
    const system = Math.min(20, available * 2);
    const testimony = 5;

    const objective = images + system;

    return {
      images,
      system,
      testimony,
      objective,
      basis:
        objective === 0 ? "TESTIMONY" : images >= system ? "IMAGES" : "SYSTEM",
      reporterSelfContradiction:
        suggestion.reporterImages.analyzed > 0 &&
        suggestion.reporterImages.support === "CONTRADICTS",
    };
  }

  /**
   * Câu hỏi bổ sung: chỉ giữ khi vụ việc CHƯA kết luận được và câu hỏi thật sự
   * cần thiết (hỏi ý muốn/cảm nhận không phải bằng chứng).
   */
  private cleanQuestions(
    items: string[],
    field: string,
    decided: boolean,
    warnings: string[],
  ): string[] {
    if (decided) {
      if (items.length > 0) {
        warnings.push(
          `${field}: đã đủ căn cứ kết luận — bỏ ${items.length} câu hỏi không cần thiết.`,
        );
      }
      return [];
    }
    return this.shortList(
      this.filterNoise(items, QUESTION_NOISE, field, warnings),
      LIMITS.questions,
      field,
      warnings,
    );
  }

  /** Bỏ các ý khớp mẫu nhiễu (model hay thêm dù không phải bằng chứng/rủi ro). */
  private filterNoise(
    items: string[],
    pattern: RegExp,
    field: string,
    warnings: string[],
  ): string[] {
    return items.filter((item) => {
      if (!pattern.test(item)) return true;
      warnings.push(
        `Bỏ ${field} không phù hợp: "${this.oneLine(item).slice(0, 70)}"`,
      );
      return false;
    });
  }

  /**
   * Cắt danh sách theo giới hạn "đọc trong 30 giây" + gọt từng gạch đầu dòng.
   *
   * Model không phải lúc nào cũng tuân thủ prompt, nên chốt lần cuối ở đây; mọi
   * lần cắt đều ghi vào `warnings` để không "im lặng sửa" output của AI.
   */
  private shortList(
    items: string[],
    max: number,
    field: string,
    warnings: string[],
  ): string[] {
    const cleaned = items
      .map((item) => this.oneLine(item).slice(0, LIMITS.bulletChars))
      .filter((item) => item.length > 0);

    if (cleaned.length > max) {
      warnings.push(
        `${field} có ${cleaned.length} ý — chỉ giữ ${max} ý để admin đọc nhanh.`,
      );
      return cleaned.slice(0, max);
    }
    return cleaned;
  }

  /** Cắt theo số câu rồi theo số ký tự; có cảnh báo khi phải cắt. */
  private shortenedText(
    text: string,
    maxSentences: number,
    maxChars: number,
    field: string,
    warnings: string[],
  ): string {
    const cleaned = this.oneLine(text);
    if (!cleaned) return "";

    const sentences = (cleaned.match(/[^.!?]+[.!?]*/g) ?? [cleaned])
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0);
    let result = sentences.slice(0, maxSentences).join(" ").trim();
    if (sentences.length > maxSentences) {
      warnings.push(`${field} quá dài — đã cắt còn ${maxSentences} câu.`);
    }
    if (result.length > maxChars) {
      result = `${result.slice(0, maxChars).trimEnd()}…`;
      warnings.push(`${field} quá dài — đã cắt còn ${maxChars} ký tự.`);
    }
    return result;
  }

  private str(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }

  private strArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((v) => (typeof v === "string" ? v.trim() : String(v ?? "").trim()))
      .filter((v) => v.length > 0);
  }

  private pickEnum<T extends string>(
    value: unknown,
    allowed: T[],
    fallback: T,
    field: string,
    warnings: string[],
  ): T {
    const normalized =
      typeof value === "string" ? value.trim().toUpperCase() : "";
    const hit = allowed.find((a) => a.toUpperCase() === normalized);
    if (!hit) {
      warnings.push(
        `${field}="${String(value)}" không hợp lệ — đã dùng "${fallback}".`,
      );
      return fallback;
    }
    return hit;
  }

  private clampConfidence(value: unknown, warnings: string[]): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      warnings.push("confidence không phải số — đã đặt 0.");
      return 0;
    }
    return Math.min(1, Math.max(0, parsed));
  }

  /** Chỉ cho phép hình phạt nhắm vào bên thực sự có mặt trong vụ việc. */
  private allowedTargetTypes(snapshot: CaseContextSnapshot): Set<AiTargetType> {
    const targets = new Set<AiTargetType>();
    for (const actor of [
      snapshot.case.reporterType,
      snapshot.case.respondentType,
    ]) {
      if ((AI_TARGET_TYPES as readonly string[]).includes(actor)) {
        targets.add(actor as AiTargetType);
      }
    }
    return targets;
  }

  private normalizeActions(
    value: unknown,
    allowedTargets: Set<AiTargetType>,
    warnings: string[],
  ): AiSuggestedAction[] {
    if (!Array.isArray(value)) return [];
    const actions: AiSuggestedAction[] = [];

    value.forEach((item, index) => {
      const raw = (item ?? {}) as Record<string, unknown>;
      const label = `suggestedActions[${index}]`;

      const typeRaw =
        typeof raw.type === "string" ? raw.type.trim().toUpperCase() : "";
      if (!(AI_ACTION_TYPES as readonly string[]).includes(typeRaw)) {
        warnings.push(`Bỏ ${label}: type "${String(raw.type)}" không hợp lệ.`);
        return;
      }
      const type = typeRaw as AiActionType;
      // NO_ACTION không phải một hình phạt — không đưa vào danh sách.
      if (type === "NO_ACTION") return;

      const targetRaw =
        typeof raw.targetType === "string"
          ? raw.targetType.trim().toUpperCase()
          : "";
      if (!(AI_TARGET_TYPES as readonly string[]).includes(targetRaw)) {
        warnings.push(
          `Bỏ ${label}: targetType "${String(raw.targetType)}" không hợp lệ.`,
        );
        return;
      }
      const targetType = targetRaw as AiTargetType;
      if (!allowedTargets.has(targetType)) {
        warnings.push(
          `Bỏ ${label}: ${targetType} không phải bên tham gia vụ việc.`,
        );
        return;
      }

      const needsAmount = type === "FINE" || type === "COMPENSATION";
      const needsDuration = type === "SUSPEND" || type === "RESTRICT_ACTIVITY";

      actions.push({
        type,
        targetType,
        amount: needsAmount ? this.positiveNumber(raw.amount) : null,
        durationDays: needsDuration
          ? this.positiveNumber(raw.durationDays)
          : null,
        reason: this.str(raw.reason) || "(model không nêu lý do)",
      });
    });

    if (actions.length > LIMITS.actions) {
      warnings.push(
        `Model đề xuất ${actions.length} hình phạt — chỉ giữ ${LIMITS.actions} để admin xem nhanh.`,
      );
    }
    return actions.slice(0, LIMITS.actions);
  }

  private positiveNumber(value: unknown): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed);
  }
}
