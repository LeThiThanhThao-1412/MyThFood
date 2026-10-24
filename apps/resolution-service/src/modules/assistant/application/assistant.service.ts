import { Inject, Injectable, Logger, forwardRef } from "@nestjs/common";
import {
  CaseCategory,
  FaultParty,
  Severity,
  Verdict,
} from "../../case/domain/case.enums";
import {
  AI_ACTION_TYPES,
  AI_DELIVERY_MATCH,
  AI_IMAGE_SUPPORT,
  AI_TARGET_TYPES,
  AiActionType,
  AiAnalysisSource,
  AiContradiction,
  AiDeliveryMatch,
  AiDetailedFinding,
  AiEvidenceWeight,
  AiFindingWeight,
  AiImageFindings,
  AiImageReadDiagnostics,
  AiImageSupport,
  AiReviewDecision,
  AiSideImageAnalysis,
  AiSourceAssessment,
  AiSuggestedAction,
  AiTargetType,
  AiTimelineHighlight,
  AiVerdictChange,
  AssistantHealth,
  CASE_CONTEXT_SOURCES,
  CaseAiAnalysisRecord,
  CaseAiAutoStatus,
  CaseAiListSummary,
  CaseAiReviewResult,
  CaseAiSuggestion,
  CaseContextSnapshot,
} from "../domain/assistant.types";
import {
  AI_IMAGE_SCHEMA,
  AI_IMAGE_SYSTEM_INSTRUCTION,
  AI_SUGGESTION_SCHEMA,
  AI_SYSTEM_INSTRUCTION,
  buildImagePrompt,
  buildUserPrompt,
} from "../domain/assistant.prompt";
import {
  ASSISTANT_LLM,
  AssistantLlmClient,
  LlmImageFailure,
} from "../infrastructure/llm.types";
import { CaseAiAnalysisRepository } from "../infrastructure/analysis.repository";
import { CaseRepository } from "../../case/infrastructure/case.repository";
import {
  CaseService,
  AiDecisionOutcome,
} from "../../case/application/case.service";
import { CaseContextService } from "./case-context.service";
import { allocateImagesByKind, DEFAULT_IMAGE_ORDER } from "./image-plan";
import {
  createPiiContext,
  redactPayload,
  resolvePiiMode,
} from "./pii/pii-redactor";
import { AnalyzeCaseDto } from "./dtos/assistant.dto";
import type { AuthUser } from "../../case/application/case.service";

/** Dạng thô model trả về — chưa tin tưởng được, phải chuẩn hoá. */
type RawSuggestion = Record<string, any>;

interface NormalizedSuggestion {
  summary: string;
  reporterImages: AiSideImageAnalysis;
  respondentImages: AiSideImageAnalysis;
  deliveryProof: {
    analyzed: boolean;
    matchesOrder: AiDeliveryMatch | null;
    itemsSeen: string | null;
    analysis: string | null;
  };
  menuImagesAnalyzed: number;
  sourceAssessment: AiSourceAssessment[];
  detailedFindings: AiDetailedFinding[];
  contradictions: AiContradiction[];
  timelineHighlights: AiTimelineHighlight[];
  whatWouldChangeVerdict: AiVerdictChange[];
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
  keyFindings: 5,
  evidenceGaps: 5,
  riskFlags: 3,
  questions: 2,
  actions: 4,
  bulletChars: 220,
  detailedFindings: 6,
  contradictions: 4,
  timelineHighlights: 6,
  verdictChanges: 4,
  sourceAssessments: 10,
  detailChars: 320,
} as const;

const AI_FINDING_WEIGHT_VALUES: AiFindingWeight[] = [
  "STRONG",
  "MEDIUM",
  "WEAK",
];
const AI_SOURCE_STATUS_VALUES: AiSourceAssessment["status"][] = [
  "USED",
  "MISSING",
  "CONTRADICTS",
  "NOT_RELEVANT",
];

/** Cờ bật/tắt tầng phân tích chi tiết (rollout). */
const deepOutputEnabled = (): boolean => {
  const raw = process.env.AI_DEEP_OUTPUT;
  if (raw === undefined || raw === "") return true;
  return !["false", "0", "off", "no"].includes(raw.trim().toLowerCase());
};

const envBool = (key: string, fallback: boolean): boolean => {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  return !["false", "0", "off", "no"].includes(raw.trim().toLowerCase());
};

const envInt = (
  key: string,
  fallback: number,
  min: number,
  max: number,
): number => {
  const parsed = Number(process.env[key]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

/** Câu hỏi không phải bằng chứng / không làm thay đổi kết luận. */
const QUESTION_NOISE =
  /(có muốn|muốn đặt lại|đặt lại món|sẽ giải quyết|giải quyết tình huống|cảm thấy|hài lòng|mong muốn|ưu tiên gì)/i;

/** "Dấu hiệu rủi ro" không phải rủi ro gian lận. */
const RISK_NOISE =
  /(ít đơn|đơn đầu tiên|chưa có kinh nghiệm|mới tham gia|chưa có đơn hàng nào|kinh nghiệm xử lý)/i;

/** Ghi chú phán quyết thay thế khi guard trọng số lật sang `INVALID`. */
const NOTE_SELF_CONTRADICTION =
  "Khiếu nại không có căn cứ: ảnh do bên khiếu nại tự cung cấp cho thấy tình trạng NGƯỢC với thiệt hại đã mô tả. " +
  "Đề xuất đóng vụ việc (INVALID), không áp dụng hình phạt, thông báo kết quả cho cả hai bên.";

/**
 * Chỉ những danh mục này mới được phép tự lật `INCONCLUSIVE` → `INVALID` khi ảnh
 * của chính bên khiếu nại mâu thuẫn với thiệt hại họ nêu.
 *
 * Cố ý KHÔNG gồm `WRONG_ITEM` / `MISSING_ITEM` / `NOT_RECEIVED`: với các vụ này
 * ảnh chụp món khác đơn là bằng chứng **ủng hộ** khách, lật sang INVALID sẽ oan
 * (đúng sự cố "giao nhầm món" — ảnh khách + ảnh tài xế cùng một món sai).
 */
const SELF_CONTRADICTION_CATEGORIES = new Set<CaseCategory>([
  CaseCategory.DAMAGED_ITEM,
  CaseCategory.ORDER_QUALITY,
  CaseCategory.FOOD_SAFETY,
]);

/**
 * Danh mục "đúng/sai món" — nếu ảnh giao hàng KHÔNG khớp món đã đặt thì không
 * được bác bỏ khiếu nại, dù model chữ kết luận INVALID.
 */
const ITEM_IDENTITY_CATEGORIES = new Set<CaseCategory>([
  CaseCategory.WRONG_ITEM,
  CaseCategory.MISSING_ITEM,
]);

/** Ghi chú thay thế khi AI kết luận INVALID nhưng ảnh lại cho thấy món khác đơn. */
const NOTE_ITEM_MISMATCH_NEEDS_REVIEW =
  "Chưa đủ căn cứ để bác bỏ khiếu nại: ảnh giao hàng/ảnh khách không khớp món khách đã đặt. " +
  "Đề xuất admin đối chiếu lại món đã đặt với ảnh hai bên trước khi kết luận.";

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

  /**
   * Trạng thái lần tự phân tích gần nhất theo vụ việc (chẩn đoán, giữ trong RAM).
   *
   * Không lưu DB vì đây chỉ là thông tin vận hành: khi tự phân tích lỗi, admin cần
   * biết ngay lý do (model quá tải, thiếu key, `AI_AUTO_ANALYZE=false`…) thay vì
   * chỉ thấy "Chưa có bản phân tích nào". Mất khi restart — chấp nhận được, vì
   * lúc đó admin bấm "Phân tích lại" là có kết quả mới.
   */
  private readonly autoStatus = new Map<string, CaseAiAutoStatus>();

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

  /** Trạng thái lần tự phân tích gần nhất của vụ việc (mặc định `PENDING`). */
  getAutoStatus(caseId: string): CaseAiAutoStatus {
    return (
      this.autoStatus.get(caseId) ?? {
        caseId,
        autoAnalyze: this.autoAnalyze,
        status: this.autoAnalyze ? "PENDING" : "SKIPPED",
        attemptedAt: null,
        detail: this.autoAnalyze
          ? null
          : "AI_AUTO_ANALYZE=false — chỉ phân tích khi admin bấm tay.",
      }
    );
  }

  /** Ghi nhận trạng thái tự phân tích (best-effort, chỉ để hiển thị). */
  private setAutoStatus(
    caseId: string,
    patch: Partial<Omit<CaseAiAutoStatus, "caseId" | "autoAnalyze">>,
  ): void {
    this.autoStatus.set(caseId, {
      ...this.getAutoStatus(caseId),
      ...patch,
      caseId,
      autoAnalyze: this.autoAnalyze,
    });
  }

  getHealth(): AssistantHealth {
    const enabledContextSources = CASE_CONTEXT_SOURCES.filter((source) => {
      switch (source.id) {
        case "D15":
          return envBool("AI_CONTEXT_MENU", true);
        case "D16":
          return envBool("AI_CONTEXT_PROMO", true);
        case "D17":
          return envBool("AI_CONTEXT_MERCHANT_REVIEWS", true);
        case "D18":
          return envBool("AI_CONTEXT_DRIVER_REVIEWS", true);
        case "D19":
          return envBool("AI_CONTEXT_DRIVER_PROFILE", true);
        default:
          return true;
      }
    }).map((source) => source.id);

    return {
      provider: this.llm.provider,
      enabled: this.llm.enabled,
      hasApiKey: this.llm.hasApiKey,
      apiKeyEnv: this.llm.apiKeyEnv,
      apiBase: this.llm.apiBase,
      model: this.llm.model,
      visionModel: this.llm.visionModel ?? null,
      maxEvidenceImages: this.llm.maxEvidenceImages,
      maxMenuImages: envInt("AI_MAX_MENU_IMAGES", 2, 0, 8),
      sourceCount: CASE_CONTEXT_SOURCES.length,
      enabledContextSources,
      piiMode: resolvePiiMode(),
      promptCharBudget: envInt("AI_PROMPT_CHAR_BUDGET", 48000, 4000, 200000),
      deepOutput: deepOutputEnabled(),
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
      this.setAutoStatus(caseId, {
        status: "SKIPPED",
        detail: "AI_AUTO_ANALYZE=false — chỉ phân tích khi admin bấm tay.",
      });
      return;
    }
    if (!this.llm.enabled || !this.llm.hasApiKey) {
      this.logger.log(
        `Bỏ qua tự phân tích vì trợ lý AI chưa sẵn sàng (enabled=${this.llm.enabled}, cóKey=${this.llm.hasApiKey})`,
      );
      this.setAutoStatus(caseId, {
        status: "SKIPPED",
        detail:
          `AI chưa sẵn sàng (AI_ASSISTANT_ENABLED=${this.llm.enabled}, ` +
          `có ${this.llm.apiKeyEnv}=${this.llm.hasApiKey})`,
      });
      return;
    }

    const startedAt = Date.now();
    this.setAutoStatus(caseId, {
      status: "RUNNING",
      attemptedAt: new Date().toISOString(),
      detail: null,
    });
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
      this.setAutoStatus(caseId, {
        status: "DONE",
        detail: `model=${suggestion.model}`,
      });
    } catch (err: any) {
      const detail = String(err?.message ?? err).slice(0, 400);
      // `error` (không phải `warn`): tự phân tích lỗi là sự cố vận hành — admin
      // mở vụ việc không thấy bản phân tích nào và cần biết vì sao.
      this.logger.error(
        `AI tự phân tích thất bại (case ${caseId}) sau ${Date.now() - startedAt}ms: ${detail}`,
      );
      this.setAutoStatus(caseId, { status: "FAILED", detail });
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
   * Bản rút gọn của nhiều vụ việc — badge "AI: có căn cứ · 82%" trên lưới vụ việc.
   *
   * Một query cho cả trang, thay vì gọi `/analysis` cho từng thẻ.
   */
  async listSummaries(caseIds: string[]): Promise<CaseAiListSummary[]> {
    const ids = [...new Set((caseIds ?? []).filter(Boolean))].slice(0, 200);
    if (ids.length === 0) return [];
    try {
      return await this.analysisRepo.findSummaries(ids);
    } catch (err: any) {
      this.logger.warn(
        `Không đọc được danh sách bản phân tích: ${err?.message ?? err}`,
      );
      return [];
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

  /**
   * Ghi chú cho các ảnh bằng chứng **không** tải được, gắn nhãn bên gửi.
   *
   * Chỉ nêu tối đa 3 ảnh để không làm loãng `warnings`; phần còn lại gộp thành
   * một dòng. Nguyên nhân lấy từ `snapshot.imageSkipReasons` (404, quá dung
   * lượng, content-type không phải ảnh, redirect S3 lỗi…).
   */
  private describeSkippedImages(snapshot: CaseContextSnapshot): string[] {
    const reasons = snapshot.imageSkipReasons ?? [];
    if (reasons.length === 0) return [];

    const reporter = new Set(snapshot.case.evidence ?? []);
    const respondent = new Set(snapshot.case.respondentEvidence ?? []);
    const notes = reasons.slice(0, 3).map((item) => {
      const side = reporter.has(item.url)
        ? "bên khiếu nại"
        : respondent.has(item.url)
          ? "bên bị khiếu nại"
          : "ảnh bằng chứng";
      return `Không tải được ảnh của ${side}: ${item.reason}`;
    });
    if (reasons.length > 3) {
      notes.push(
        `Còn ${reasons.length - 3} ảnh khác cũng không tải được — xem "Dữ liệu AI nhận".`,
      );
    }
    return notes;
  }

  /**
   * Dựng chẩn đoán lượt đọc ảnh cho panel: **vì sao** ảnh không được đọc và
   * admin nên làm gì.
   *
   * Vì sao cần: trước đây mọi trường hợp đều chỉ hiện "N ảnh đã gửi nhưng model
   * không đọc", khiến admin bấm "Phân tích lại" liên tục trong lúc model vision
   * đang quá tải (429/1305) — vừa không được việc, vừa làm tài khoản bị 1302.
   */
  private describeImageRead(
    snapshot: CaseContextSnapshot,
    attached: number,
    analyzed: number,
    failure: LlmImageFailure | null,
  ): AiImageReadDiagnostics {
    const base = {
      attached,
      analyzed,
      modelsTried: failure?.modelsTried ?? [],
      detail: failure?.detail ?? null,
    };

    if (attached === 0) {
      // Có ảnh trong vụ việc nhưng không tải/gửi được ảnh nào ⇒ lỗi tải ảnh,
      // không phải lỗi model.
      const available =
        (snapshot.imagesAvailable?.reporter ?? 0) +
        (snapshot.imagesAvailable?.respondent ?? 0) +
        (snapshot.imagesAvailable?.deliveryProof ?? 0);
      const downloadFailed =
        available > 0 ||
        (snapshot.imagesSkipped ?? []).length > 0 ||
        (snapshot.imageSkipReasons ?? []).length > 0;
      return {
        ...base,
        status: downloadFailed ? "DOWNLOAD_FAILED" : "NO_IMAGES",
        hint: downloadFailed
          ? "Ảnh có trong vụ việc nhưng tải về không được (DNS/404/quá dung lượng) — " +
            'xem "Dữ liệu AI nhận" để biết URL lỗi, rồi bấm "Phân tích lại".'
          : null,
      };
    }

    if (!failure) {
      if (analyzed > 0) return { ...base, status: "OK", hint: null };
      // Đã gửi ảnh nhưng provider báo đọc 0 ảnh mà không nêu lý do (vd. provider
      // lùi về đường chữ) ⇒ vẫn phải báo để admin kiểm tra, không im lặng.
      return {
        ...base,
        status: "VISION_ERROR",
        detail: base.detail ?? "provider báo 0 ảnh đã đọc",
        hint: 'Provider không đọc ảnh ở lượt này — kiểm tra model vision rồi bấm "Phân tích lại".',
      };
    }

    switch (failure.reason) {
      case "VISION_OVERLOADED":
        return {
          ...base,
          status: "VISION_OVERLOADED",
          hint:
            "Model đọc ảnh đang quá tải (429/1302/1305) — đợi 30–60 giây rồi bấm " +
            '"Phân tích lại". Nếu lặp lại nhiều lần, đổi GLM_VISION_MODEL sang ' +
            '"glm-4.6v-flashx" (bản trả phí rẻ, ít nghẽn hơn bản free).',
        };
      case "VISION_DISABLED":
        return {
          ...base,
          status: "VISION_DISABLED",
          hint:
            "Chưa bật model đọc ảnh (GLM_VISION_MODEL=none) — đặt GLM_VISION_MODEL=" +
            "glm-4.6v-flash rồi restart resolution-service.",
        };
      default:
        return {
          ...base,
          status: "VISION_ERROR",
          hint:
            "Model đọc ảnh lỗi — kiểm tra GLM_VISION_MODEL/GLM_VISION_FALLBACK_MODELS " +
            '(model có thể bị gỡ) rồi bấm "Phân tích lại".',
        };
    }
  }

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

    // ---- Lượt 1: ĐỌC ẢNH bằng schema nhỏ (model vision) ----
    // Tách khỏi lượt suy luận vì model vision free hay trả JSON hỏng khi phải
    // nhả cùng lúc schema lớn; schema nhỏ giúp phần ảnh luôn được đọc thay vì bị
    // bỏ âm thầm (đây là lý do bản auto-analysis trước đây "không phân tích ảnh").
    let imageFindings: AiImageFindings | null = null;
    let imagesUsed: number | null = null;
    let imageUsage: CaseAiSuggestion["usage"] | null = null;
    /**
     * Lý do provider phải bỏ ảnh (quá tải model vision, tắt vision, lỗi model).
     * Giữ lại để dựng `imageDiagnostics` — admin cần biết *vì sao* mất ảnh chứ
     * không chỉ thấy câu "model không đọc ảnh".
     */
    let imageFailure: LlmImageFailure | null = null;
    const notes: string[] = [];

    // Ảnh chuẩn món là dữ liệu đối chiếu quan trọng với sự cố món ăn. Nếu có
    // ảnh nhưng không đính kèm được suất nào, phải nói rõ cho admin thay vì im lặng.
    const menuWithImage = (snapshot.menuItems ?? []).filter(
      (item) => !!item.imageUrl,
    ).length;
    const menuAttached = snapshot.imagePlan?.menuReference ?? 0;
    if (menuWithImage > 0 && menuAttached === 0) {
      notes.push(
        `Không đính kèm được ảnh chuẩn món (${menuWithImage} món có ảnh). ` +
          `Ngân sách ảnh hiện tại = ${maxImages} — ảnh bằng chứng đã dùng hết suất` +
          (snapshot.imagesSkipped.length > 0
            ? ` hoặc tải ảnh lỗi (${snapshot.imagesSkipped.length} URL bị bỏ)`
            : "") +
          `. Tăng AI_ASSISTANT_MAX_IMAGES nếu cần đối chiếu món.`,
      );
    }

    // Ảnh bằng chứng KHÔNG tải được: nói rõ bên nào + nguyên nhân, thay vì để
    // admin đoán "khách bảo có gửi ảnh mà AI bảo không có ảnh".
    notes.push(...this.describeSkippedImages(snapshot));

    if (images.length > 0) {
      try {
        const imageResponse = await this.llm.generateJson<AiImageFindings>({
          systemInstruction: AI_IMAGE_SYSTEM_INSTRUCTION,
          prompt: buildImagePrompt(snapshot),
          schema: AI_IMAGE_SCHEMA as unknown as Record<string, unknown>,
          images,
          temperature: 0.1,
          maxOutputTokens: 2000,
        });
        imageFindings = imageResponse.data ?? null;
        imagesUsed = imageResponse.imagesUsed ?? images.length;
        imageUsage = imageResponse.usage;
        imageFailure = imageResponse.imageFailure ?? null;
        notes.push(...(imageResponse.notes ?? []));
        if (imagesUsed === 0) {
          // Provider tự lùi về model chữ ⇒ output không phải kết quả nhìn ảnh.
          imageFindings = null;
          notes.push(
            "Model vision không dùng được — phần ảnh được đánh giá là KHÔNG có bằng chứng ảnh.",
          );
        }
      } catch (err: any) {
        this.logger.error(
          `Đọc ${images.length} ảnh bằng chứng thất bại (case ${caseId}): ${err?.message ?? err}`,
        );
        imageFailure = {
          reason: "VISION_ERROR",
          detail: String(err?.message ?? "lỗi model vision").slice(0, 200),
          modelsTried: this.llm.visionModel ? [this.llm.visionModel] : [],
          retryable: false,
        };
        notes.push(
          `Không đọc được ${images.length} ảnh bằng chứng (${err?.message ?? "lỗi model vision"}) — phân tích chỉ dựa trên dữ liệu chữ.`,
        );
      }
    }

    // ---- Lượt 2: SUY LUẬN CHỮ với kết quả ảnh đã đọc ----
    const unreadableImages =
      images.length > 0 && imageFindings === null ? images.length : 0;
    const response = await this.llm.generateJson<RawSuggestion>({
      systemInstruction: AI_SYSTEM_INSTRUCTION,
      prompt: buildUserPrompt(snapshot, imageFindings, unreadableImages),
      schema: AI_SUGGESTION_SCHEMA as unknown as Record<string, unknown>,
      // Ảnh đã đọc ở lượt 1: gửi lại chỉ tốn token và dễ làm model chữ trả JSON lỗi.
      images: [],
      temperature: 0.2,
      maxOutputTokens: 6000,
    });

    const mergedRaw = this.mergeImageFindings(response.data, imageFindings);
    // Không có lượt đọc ảnh (không có ảnh, hoặc provider chỉ chạy đường chữ) thì
    // lấy `imagesUsed` provider báo; test/legacy không báo ⇒ tin số ảnh đã đính kèm.
    if (imagesUsed === null) {
      imagesUsed = response.imagesUsed ?? snapshot.imagesAttached;
    }
    notes.push(...(response.notes ?? []));
    const normalized = this.normalize(mergedRaw, snapshot, imagesUsed);
    const textUsage = response.usage;
    const combineTokens = (
      a: number | null | undefined,
      b: number | null | undefined,
    ) => (a == null && b == null ? null : (a ?? 0) + (b ?? 0));
    const usage = {
      promptTokens: combineTokens(
        imageUsage?.promptTokens,
        textUsage?.promptTokens,
      ),
      outputTokens: combineTokens(
        imageUsage?.outputTokens,
        textUsage?.outputTokens,
      ),
      totalTokens: combineTokens(
        imageUsage?.totalTokens,
        textUsage?.totalTokens,
      ),
    };

    const imageDiagnostics = this.describeImageRead(
      snapshot,
      images.length,
      imagesUsed,
      imageFailure,
    );

    this.logger.log(
      `AI analyzed ${snapshot.case.caseNumber} | model=${response.model} ` +
        `tokens=${usage.totalTokens ?? "n/a"} images=${imagesUsed}/${images.length} ` +
        `imageStatus=${imageDiagnostics.status} ms=${Date.now() - startedAt} by=${user.userId}`,
    );

    const suggestion: CaseAiSuggestion = {
      caseId: snapshot.case.id,
      caseNumber: snapshot.case.caseNumber,
      generatedAt: new Date().toISOString(),
      model: response.model,
      summary: normalized.summary,
      imagesAnalyzed: imagesUsed,
      imageDiagnostics,
      reporterImages: normalized.reporterImages,
      respondentImages: normalized.respondentImages,
      deliveryProof: {
        photoUrl: snapshot.deliveryProofPhotoUrl ?? null,
        analyzed: normalized.deliveryProof.analyzed,
        matchesOrder: normalized.deliveryProof.matchesOrder,
        itemsSeen: normalized.deliveryProof.itemsSeen,
        analysis: normalized.deliveryProof.analysis,
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
        // Ghi chú kỹ thuật: provider bỏ ảnh, lượt đọc ảnh lỗi, model trả JSON lỗi...
        ...notes,
        ...(snapshot.criticalMissingSourceIds.length > 0
          ? [
              `Thiếu nguồn dữ liệu bắt buộc cho danh mục ${snapshot.case.category}: ${snapshot.criticalMissingSourceIds.join(", ")}`,
            ]
          : []),
      ],
      menuImagesAnalyzed: normalized.menuImagesAnalyzed,
      sourceAssessment: normalized.sourceAssessment,
      detailedFindings: normalized.detailedFindings,
      contradictions: normalized.contradictions,
      timelineHighlights: normalized.timelineHighlights,
      whatWouldChangeVerdict: normalized.whatWouldChangeVerdict,
      usage,
    };

    await this.saveAnalysisQuietly(suggestion, source);

    // Chốt lần cuối: kể cả output của model cũng không được chứa PII (model có
    // thể lặp lại tên/SĐT đọc được trong chat). Chạy enforce bất kể cấu hình.
    const sanitized = redactPayload(suggestion, createPiiContext("enforce"));

    return sanitized;
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
   * Gộp kết quả **đọc ảnh** vào output của lượt suy luận chữ.
   *
   * Lượt chữ không nhìn thấy ảnh nên phần mô tả ảnh do nó viết lại có thể bịa.
   * Kết quả vision là nguồn khách quan ⇒ ưu tiên giữ support/analysis của vision,
   * chỉ giữ các field suy luận (verdict, findings...) của lượt chữ.
   */
  private mergeImageFindings(
    raw: RawSuggestion,
    findings: AiImageFindings | null,
  ): RawSuggestion {
    const merged: RawSuggestion =
      raw && typeof raw === "object" ? { ...raw } : ({} as RawSuggestion);
    if (!findings || typeof findings !== "object") return merged;

    const mergeSide = (key: "reporterImages" | "respondentImages") => {
      const visionSide = (findings as any)[key];
      if (!visionSide || typeof visionSide !== "object") return;
      const current =
        merged[key] && typeof merged[key] === "object" ? merged[key] : {};
      merged[key] = {
        ...current,
        ...(typeof visionSide.support === "string"
          ? { support: visionSide.support }
          : {}),
        ...(typeof visionSide.analysis === "string"
          ? { analysis: visionSide.analysis }
          : {}),
        ...(typeof visionSide.visibleItems === "string"
          ? { visibleItems: visionSide.visibleItems }
          : {}),
      };
    };
    mergeSide("reporterImages");
    mergeSide("respondentImages");

    if (
      typeof findings.sideComparison === "string" &&
      findings.sideComparison.trim()
    ) {
      merged.sideComparison = findings.sideComparison;
    }

    const proof = (findings as any).deliveryProof;
    if (proof && typeof proof === "object") {
      merged.deliveryProof = {
        matchesOrder:
          typeof proof.matchesOrder === "string"
            ? proof.matchesOrder
            : "UNCLEAR",
        itemsSeen:
          typeof proof.visibleItems === "string" ? proof.visibleItems : "",
        analysis: typeof proof.analysis === "string" ? proof.analysis : "",
      };
    }
    return merged;
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

    // Ảnh gửi cho model theo thứ tự đã dùng khi tải ảnh (`snapshot.imageOrder`).
    // Provider chỉ báo TỔNG số ảnh đã dùng nên phải phân bổ lại theo đúng thứ
    // tự đó, nếu không số ảnh "đã đọc" của từng bên sẽ sai (nhất là khi ảnh món
    // được ưu tiên trước ảnh hai bên).
    const plan = snapshot.imagePlan ?? {
      deliveryProof: snapshot.deliveryProofImageAttached ? 1 : 0,
      menuReference: snapshot.menuImagesAttached ?? 0,
      reporter: snapshot.reporterImagesAttached,
      respondent: snapshot.respondentImagesAttached,
      review: snapshot.reviewImagesAttached ?? 0,
    };
    const usedByKind = allocateImagesByKind(
      plan,
      snapshot.imageOrder ?? DEFAULT_IMAGE_ORDER,
      imagesUsed,
    );
    const proofAnalyzed = usedByKind.DELIVERY_PROOF;
    const reporterAnalyzed = usedByKind.REPORTER;
    const respondentAnalyzed = usedByKind.RESPONDENT;
    const menuImagesAnalyzed = usedByKind.MENU_REFERENCE;

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
    const deliveryProofAnalyzed = proofAnalyzed > 0 && imagesUsed > 0;
    const proofRaw = (
      src.deliveryProof && typeof src.deliveryProof === "object"
        ? src.deliveryProof
        : {}
    ) as Record<string, unknown>;
    const deliveryProof = {
      analyzed: deliveryProofAnalyzed,
      matchesOrder: deliveryProofAnalyzed
        ? this.pickDeliveryMatch(proofRaw.matchesOrder, warnings)
        : null,
      itemsSeen:
        this.shortenedText(
          this.str(proofRaw.itemsSeen),
          2,
          300,
          "deliveryProof.itemsSeen",
          warnings,
        ) || null,
      analysis:
        this.shortenedText(
          this.str(proofRaw.analysis),
          2,
          300,
          "deliveryProof.analysis",
          warnings,
        ) || null,
    };

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

    // Trọng số bằng chứng (prompt luật 25–35): ảnh + dữ liệu hệ thống = 80%,
    // lời khai chỉ 5%. Guard chỉ được lật kết luận ở các danh mục hư hỏng/chất
    // lượng — nơi ảnh "nguyên vẹn" thực sự phủ định lời khiếu nại.
    const weighted = this.applyEvidenceWeight(
      verdictRaw,
      faultRaw,
      this.clampConfidence(src.confidence, warnings),
      reporterImages,
      respondentImages,
      snapshot.case.category,
      warnings,
    );

    // Guard chống oan cho đúng sự cố "giao nhầm món": model chữ kết luận INVALID
    // nhưng ảnh khách ỦNG HỘ khiếu nại và ảnh giao hàng KHÔNG khớp món đã đặt.
    const itemMismatchGuard =
      weighted.verdict === Verdict.INVALID &&
      ITEM_IDENTITY_CATEGORIES.has(snapshot.case.category) &&
      reporterImages.analyzed > 0 &&
      reporterImages.support === "SUPPORTS" &&
      deliveryProof.analyzed &&
      deliveryProof.matchesOrder === "MISMATCH";
    if (itemMismatchGuard) {
      warnings.push(
        "Bằng chứng mâu thuẫn: AI kết luận INVALID nhưng ảnh khách ủng hộ khiếu nại và ảnh giao hàng không khớp món đã đặt ⇒ hạ xuống INCONCLUSIVE để admin xem.",
      );
    }
    const finalVerdict = itemMismatchGuard
      ? Verdict.INCONCLUSIVE
      : weighted.verdict;
    const finalFault = itemMismatchGuard
      ? FaultParty.INCONCLUSIVE
      : weighted.faultParty;
    const finalConfidence = itemMismatchGuard
      ? Math.min(weighted.confidence, 0.6)
      : weighted.confidence;

    // Ngữ cảnh con người: lỗi có thể nằm ở bên KHÔNG được chọn khi tạo khiếu nại
    // (vd khách khiếu nại tài xế nhưng nhà hàng đóng gói sai). Nêu rõ để admin
    // không bỏ sót bên chịu trách nhiệm thật.
    const faultActor =
      finalFault === FaultParty.CUSTOMER
        ? "CONSUMER"
        : finalFault === FaultParty.MERCHANT
          ? "MERCHANT"
          : finalFault === FaultParty.DRIVER
            ? "DRIVER"
            : null;
    if (
      faultActor &&
      faultActor !== snapshot.case.reporterType &&
      faultActor !== snapshot.case.respondentType
    ) {
      warnings.push(
        `AI xác định lỗi thuộc ${finalFault} nhưng bên này không nằm trong vụ việc (${snapshot.case.reporterType} → ${snapshot.case.respondentType}) — admin cần xem lại phạm vi khiếu nại.`,
      );
    }

    // Đã kết luận được thì KHÔNG hỏi thêm bên nào (prompt luật 18) — guard lại
    // vì model hay "hỏi cho có" làm admin/khách phải trả lời vô ích.
    const decided = finalVerdict !== Verdict.INCONCLUSIVE;

    return {
      summary:
        this.shortenedText(
          this.str(src.summary),
          LIMITS.summarySentences,
          LIMITS.summaryChars,
          "summary",
          warnings,
        ) || "(model không trả về tóm tắt)",
      suggestedVerdict: finalVerdict,
      suggestedFaultParty: finalFault,
      suggestedSeverity: this.pickEnum(
        src.suggestedSeverity,
        SEVERITY_VALUES,
        snapshot.case.severity,
        "suggestedSeverity",
        warnings,
      ),
      confidence: finalConfidence,
      reporterImages,
      respondentImages,
      deliveryProof,
      menuImagesAnalyzed,
      ...this.normalizeDeepOutput(src, warnings),
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
        finalVerdict === Verdict.INVALID
          ? this.noActionsForInvalid(src, warnings)
          : itemMismatchGuard
            ? []
            : this.normalizeActions(
                src.suggestedActions,
                allowedTargets,
                warnings,
              ),
      suggestedResolutionNote: itemMismatchGuard
        ? NOTE_ITEM_MISMATCH_NEEDS_REVIEW
        : weighted.overridden
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

  /** Chuẩn hoá tầng phân tích chi tiết (tùy chọn) và cắt theo giới hạn. */
  private normalizeDeepOutput(src: RawSuggestion, warnings: string[]) {
    const empty = {
      sourceAssessment: [] as AiSourceAssessment[],
      detailedFindings: [] as AiDetailedFinding[],
      contradictions: [] as AiContradiction[],
      timelineHighlights: [] as AiTimelineHighlight[],
      whatWouldChangeVerdict: [] as AiVerdictChange[],
    };
    if (!deepOutputEnabled()) return empty;

    const objects = (value: unknown): any[] =>
      Array.isArray(value)
        ? value.filter((item) => item && typeof item === "object")
        : [];
    const text = (value: unknown, field: string): string => {
      const out = this.str(value).replace(/\s+/g, " ").trim();
      if (out.length <= LIMITS.detailChars) return out;
      warnings.push(
        `Cắt ${field} về ${LIMITS.detailChars} ký tự (model trả quá dài)`,
      );
      return `${out.slice(0, LIMITS.detailChars)}…`;
    };

    const sourceAssessment = objects(src.sourceAssessment)
      .slice(0, LIMITS.sourceAssessments)
      .map((item) => {
        const status = AI_SOURCE_STATUS_VALUES.includes(item?.status)
          ? item.status
          : "USED";
        if (!AI_SOURCE_STATUS_VALUES.includes(item?.status)) {
          warnings.push(
            `sourceAssessment.status không hợp lệ (${String(item?.status)}) → USED`,
          );
        }
        return {
          sourceId: text(item?.sourceId, "sourceAssessment.sourceId").slice(
            0,
            10,
          ),
          status: status as AiSourceAssessment["status"],
          note: text(item?.note, "sourceAssessment.note"),
        };
      })
      .filter((item) => !!item.sourceId);

    const detailedFindings = objects(src.detailedFindings)
      .slice(0, LIMITS.detailedFindings)
      .map((item) => {
        const weight = AI_FINDING_WEIGHT_VALUES.includes(item?.weight)
          ? item.weight
          : "MEDIUM";
        if (!AI_FINDING_WEIGHT_VALUES.includes(item?.weight)) {
          warnings.push(
            `detailedFindings.weight không hợp lệ (${String(item?.weight)}) → MEDIUM`,
          );
        }
        return {
          signal: text(item?.signal, "detailedFindings.signal"),
          facts: text(item?.facts, "detailedFindings.facts"),
          source: text(item?.source, "detailedFindings.source").slice(0, 60),
          interpretation: text(
            item?.interpretation,
            "detailedFindings.interpretation",
          ),
          weight: weight as AiFindingWeight,
        };
      })
      .filter((item) => !!item.facts || !!item.interpretation);

    const contradictions = objects(src.contradictions)
      .slice(0, LIMITS.contradictions)
      .map((item) => ({
        between: text(item?.between, "contradictions.between").slice(0, 80),
        detail: text(item?.detail, "contradictions.detail"),
      }))
      .filter((item) => !!item.detail);

    const timelineHighlights = objects(src.timelineHighlights)
      .slice(0, LIMITS.timelineHighlights)
      .filter((item) => {
        const at = new Date(String(item?.at ?? ""));
        if (!Number.isFinite(at.getTime())) {
          warnings.push(
            `Bỏ timelineHighlights.at không hợp lệ: "${String(item?.at)}"`,
          );
          return false;
        }
        return true;
      })
      .map((item) => ({
        at: new Date(String(item.at)).toISOString(),
        source: text(item?.source, "timelineHighlights.source").slice(0, 60),
        event: text(item?.event, "timelineHighlights.event"),
      }))
      .filter((item) => !!item.event);

    const whatWouldChangeVerdict = objects(src.whatWouldChangeVerdict)
      .slice(0, LIMITS.verdictChanges)
      .map((item) => ({
        missingData: text(
          item?.missingData,
          "whatWouldChangeVerdict.missingData",
        ),
        couldChangeTo: text(
          item?.couldChangeTo,
          "whatWouldChangeVerdict.couldChangeTo",
        ),
      }))
      .filter((item) => !!item.missingData);

    return {
      sourceAssessment,
      detailedFindings,
      contradictions,
      timelineHighlights,
      whatWouldChangeVerdict,
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
   * Guard theo trọng số bằng chứng (prompt luật 25–35).
   *
   * Ảnh + dữ liệu hệ thống chiếm 80% nên khi **ảnh của chính bên khiếu nại** cho
   * thấy tình trạng NGƯỢC với thiệt hại đã nêu thì không nên để `INCONCLUSIVE`.
   *
   * Chỉ áp dụng cho các danh mục hư hỏng/chất lượng — nơi "ảnh nguyên vẹn" thực
   * sự phủ định lời khiếu nại. Với SAI MÓN/THIẾU MÓN, ảnh món khác đơn là bằng
   * chứng ủng hộ khách; lật thành INVALID sẽ kết luận oan (sự cố giao nhầm món).
   */
  private applyEvidenceWeight(
    verdict: Verdict,
    faultParty: FaultParty,
    confidence: number,
    reporter: AiSideImageAnalysis,
    respondent: AiSideImageAnalysis,
    category: CaseCategory,
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
    if (!SELF_CONTRADICTION_CATEGORIES.has(category)) {
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
      `Trọng số bằng chứng: ảnh của chính bên khiếu nại mâu thuẫn với thiệt hại đã nêu (${category}) ` +
        "⇒ kết luận INVALID (lỗi thuộc CUSTOMER), không cần hỏi thêm.",
    );

    return {
      verdict: Verdict.INVALID,
      faultParty: FaultParty.CUSTOMER,
      confidence: Math.max(confidence, 0.7),
      overridden: true,
    };
  }

  /** `deliveryProof.matchesOrder` do model trả — chỉ nhận enum hợp lệ. */
  private pickDeliveryMatch(
    value: unknown,
    warnings: string[],
  ): AiDeliveryMatch | null {
    if (value === null || value === undefined || value === "") return null;
    const normalized = String(value).trim().toUpperCase();
    const hit = AI_DELIVERY_MATCH.find((item) => item === normalized);
    if (!hit) {
      warnings.push(
        `deliveryProof.matchesOrder="${String(value)}" không hợp lệ — bỏ trống.`,
      );
      return null;
    }
    return hit;
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
    const proof = suggestion.deliveryProof.analyzed ? 35 : 0;
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
