import { Inject, Injectable, Logger } from "@nestjs/common";
import { FaultParty, Severity, Verdict } from "../../case/domain/case.enums";
import {
  AI_ACTION_TYPES,
  AI_TARGET_TYPES,
  AiActionType,
  AiAnalysisSource,
  AiReviewDecision,
  AiSuggestedAction,
  AiTargetType,
  AssistantHealth,
  CASE_CONTEXT_SOURCES,
  CaseAiAnalysisRecord,
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
import { CaseContextService } from "./case-context.service";
import { AnalyzeCaseDto } from "./dtos/assistant.dto";
import type { AuthUser } from "../../case/application/case.service";

/** Dạng thô model trả về — chưa tin tưởng được, phải chuẩn hoá. */
type RawSuggestion = Record<string, any>;

interface NormalizedSuggestion {
  summary: string;
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
  noteChars: 420,
  noteSentences: 3,
  keyFindings: 3,
  evidenceGaps: 3,
  riskFlags: 2,
  questions: 3,
  actions: 4,
  bulletChars: 220,
} as const;

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
      this.logger.log(`Bỏ qua tự phân tích (AI_AUTO_ANALYZE=false) — case ${caseId}`);
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
      const suggestion = await this.analyzeCase(caseId, {}, SYSTEM_ACTOR, "AUTO");
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
    return this.analysisRepo.findByCaseId(caseId);
  }

  /** Admin duyệt / bỏ qua gợi ý. Trả `null` nếu vụ việc chưa có bản phân tích. */
  async reviewAnalysis(
    caseId: string,
    decision: AiReviewDecision,
    user: AuthUser,
    note?: string,
  ): Promise<CaseAiAnalysisRecord | null> {
    const record = await this.analysisRepo.saveReview(
      caseId,
      decision,
      user.userId,
      note?.trim() || null,
    );
    if (record) {
      this.logger.log(
        `Admin ${user.userId} ${decision === "ACCEPTED" ? "đã duyệt" : "đã bỏ qua"} ` +
          `gợi ý AI của ${record.caseNumber}`,
      );
    }
    return record;
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

    const normalized = this.normalize(response.data, snapshot);

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
  ): NormalizedSuggestion {
    const warnings: string[] = [];
    const src: RawSuggestion =
      raw && typeof raw === "object" ? raw : ({} as RawSuggestion);

    const allowedTargets = this.allowedTargetTypes(snapshot);

    return {
      summary:
        this.shortenedText(
          this.str(src.summary),
          LIMITS.summarySentences,
          LIMITS.summaryChars,
          "summary",
          warnings,
        ) || "(model không trả về tóm tắt)",
      suggestedVerdict: this.pickEnum(
        src.suggestedVerdict,
        VERDICT_VALUES,
        Verdict.INCONCLUSIVE,
        "suggestedVerdict",
        warnings,
      ),
      suggestedFaultParty: this.pickEnum(
        src.suggestedFaultParty,
        FAULT_VALUES,
        FaultParty.INCONCLUSIVE,
        "suggestedFaultParty",
        warnings,
      ),
      suggestedSeverity: this.pickEnum(
        src.suggestedSeverity,
        SEVERITY_VALUES,
        snapshot.case.severity,
        "suggestedSeverity",
        warnings,
      ),
      confidence: this.clampConfidence(src.confidence, warnings),
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
        this.strArray(src.riskFlags),
        LIMITS.riskFlags,
        "riskFlags",
        warnings,
      ),
      suggestedActions: this.normalizeActions(
        src.suggestedActions,
        allowedTargets,
        warnings,
      ),
      suggestedResolutionNote: this.shortenedText(
        this.str(src.suggestedResolutionNote),
        LIMITS.noteSentences,
        LIMITS.noteChars,
        "suggestedResolutionNote",
        warnings,
      ),
      followUpQuestions: this.shortList(
        this.strArray(src.followUpQuestions),
        LIMITS.questions,
        "followUpQuestions",
        warnings,
      ),
      respondentQuestions: this.shortList(
        this.strArray(src.respondentQuestions),
        LIMITS.questions,
        "respondentQuestions",
        warnings,
      ),
      warnings,
    };
  }

  /** Gộp mọi khoảng trắng/xuống dòng về một dòng để hiển thị gọn trên UI. */
  private oneLine(text: string): string {
    return text.replace(/\s+/g, " ").trim();
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
    const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
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
  private allowedTargetTypes(
    snapshot: CaseContextSnapshot,
  ): Set<AiTargetType> {
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
      const needsDuration =
        type === "SUSPEND" || type === "RESTRICT_ACTIVITY";

      actions.push({
        type,
        targetType,
        amount: needsAmount ? this.positiveNumber(raw.amount) : null,
        durationDays: needsDuration ? this.positiveNumber(raw.durationDays) : null,
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
