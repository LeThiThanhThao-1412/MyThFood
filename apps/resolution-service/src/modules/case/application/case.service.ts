import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  forwardRef,
} from "@nestjs/common";
import {
  CaseListFilters,
  CaseRepository,
} from "../infrastructure/case.repository";
import { PenaltyService } from "../../penalty/application/penalty.service";
import { PenaltyType } from "../../penalty/domain/penalty.enums";
import { Case } from "../domain/case.aggregate";
import {
  ActorType,
  CaseCategory,
  CaseStatus,
  CaseType,
  FaultParty,
  Severity,
  Verdict,
} from "../domain/case.enums";
import { IntegrationService } from "../../integration/integration.service";
import { AssistantService } from "../../assistant/application/assistant.service";
import {
  ActorIdDto,
  AddEvidenceDto,
  CreateCaseDto,
  ResolveCaseDto,
  RespondCaseDto,
} from "./dtos/case.dto";

export interface AuthUser {
  userId: string;
  phone?: string;
  roles: string[];
}

/** Một hình phạt AI đề xuất (đã được chuẩn hoá ở tầng assistant). */
export interface AiDecisionAction {
  type: string;
  targetType: string;
  amount: number | null;
  durationDays: number | null;
  reason: string;
}

/**
 * Quyết định AI đã được admin **duyệt** — đầu vào để áp dụng vào vụ việc.
 *
 * Cố ý không import type của module assistant: case module chỉ nhận dữ liệu
 * thuần, tránh phụ thuộc vòng giữa hai module.
 */
export interface AiDecisionInput {
  verdict: Verdict;
  faultParty: FaultParty;
  note: string;
  actions: AiDecisionAction[];
  /** Câu hỏi bổ sung gửi khách hàng (khi chưa đủ căn cứ). */
  reporterQuestions: string[];
  /** Câu hỏi bổ sung gửi tài xế/nhà hàng (khi chưa đủ căn cứ). */
  respondentQuestions: string[];
}

export interface AiDecisionOutcome {
  applied: boolean;
  verdict: Verdict | null;
  caseStatus: string | null;
  penalties: number;
  /** Bên đã được thông báo: REPORTER / RESPONDENT. */
  notified: string[];
  /** Bên được yêu cầu bổ sung bằng chứng: REPORTER / RESPONDENT. */
  evidenceRequestedFrom: string[];
  summary: string;
}

@Injectable()
export class CaseService {
  private readonly logger = new Logger(CaseService.name);

  /** Tránh log lặp lại khi AssistantService không được cắm vào. */
  private warnedMissingAssistant = false;

  constructor(
    private readonly repo: CaseRepository,
    private readonly integration: IntegrationService,
    @Inject(forwardRef(() => PenaltyService))
    private readonly penaltyService: PenaltyService,
    // `@Optional()`: nếu vì lý do nào đó module assistant không sẵn sàng thì
    // resolution-service vẫn khởi động và tạo khiếu nại bình thường (chỉ mất
    // phần tự phân tích AI).
    @Optional()
    @Inject(forwardRef(() => AssistantService))
    private readonly assistant?: AssistantService,
  ) {}

  private mapRoleToActorType(roles: string[]): ActorType {
    const r = new Set(roles);
    if (r.has("ADMIN")) return "ADMIN";
    if (r.has("DRIVER")) return "DRIVER";
    if (r.has("MERCHANT_OWNER") || r.has("MERCHANT")) return "MERCHANT";
    return "CONSUMER";
  }

  private async nextCaseNumber(): Promise<string> {
    const seq = (await this.repo.countAll()) + 1;
    const year = new Date().getFullYear();
    return `CASE-${year}-${String(seq).padStart(6, "0")}`;
  }

  private suggestSeverity(
    category: CaseCategory,
    repeatCount: number,
  ): Severity {
    let base: Severity;
    switch (category) {
      case CaseCategory.FOOD_SAFETY:
      case CaseCategory.COLLUSION:
        base = Severity.CRITICAL;
        break;
      case CaseCategory.COD_THEFT:
      case CaseCategory.ORDER_FARMING:
      case CaseCategory.FAKE_DELIVERY:
        base = Severity.HIGH;
        break;
      case CaseCategory.REFUND_ABUSE:
      case CaseCategory.CHARGEBACK_FRAUD:
      case CaseCategory.MULTI_ACCOUNT:
      case CaseCategory.FAKE_REVIEW:
        base = Severity.MEDIUM;
        break;
      default:
        base = Severity.LOW;
    }
    if (repeatCount >= 3) return Severity.CRITICAL;
    if (repeatCount === 2) return Severity.HIGH;
    if (repeatCount === 1)
      return base === Severity.LOW ? Severity.MEDIUM : base;
    return base;
  }

  async create(dto: CreateCaseDto, user: AuthUser) {
    const reporterType =
      (dto.reporterType as ActorType) ?? this.mapRoleToActorType(user.roles);
    const repeatCount = await this.repo.countRecentByRespondent(
      dto.respondentId,
      30,
    );
    const severity =
      dto.severity ?? this.suggestSeverity(dto.category, repeatCount);
    const caseNumber = await this.nextCaseNumber();

    const c = Case.create({
      caseNumber,
      type: dto.type,
      category: dto.category,
      severity,
      orderId: dto.orderId ?? null,
      reporterId: dto.reporterId ?? user.userId,
      reporterType,
      respondentId: dto.respondentId,
      respondentType: dto.respondentType as ActorType,
      subject: dto.subject,
      description: dto.description,
      evidence: dto.evidence ?? [],
      responseDeadline:
        dto.type === CaseType.COMPLAINT
          ? dto.responseDeadline
            ? new Date(dto.responseDeadline)
            : new Date(Date.now() + 72 * 3600 * 1000)
          : null,
    });

    const id = c.id.toString();
    await this.repo.save(c);
    await this.repo.addTimeline({
      caseId: id,
      fromStatus: null,
      toStatus: c.caseStatus,
      actorId: user.userId,
      actorType: reporterType,
      note: "Case opened",
    });

    if (c.caseOrderId) {
      void this.integration.holdSettlement(c.caseOrderId);
    }
    void this.integration.notify(
      dto.respondentId,
      "Bạn có khiếu nại mới",
      `${dto.subject} — hãy cung cấp bằng chứng trong 48h.`,
    );

    // Trợ lý AI phân tích **nền** ngay khi khiếu nại được tạo: admin mở vụ việc
    // là có sẵn gợi ý để đọc & duyệt, không phải bấm rồi chờ 1-2 phút.
    // Không `await`: response tạo khiếu nại không được chậm vì model AI.
    if (this.assistant) {
      void this.assistant.triggerAutoAnalysis(id);
    } else if (!this.warnedMissingAssistant) {
      this.warnedMissingAssistant = true;
      this.logger.warn(
        "Không tìm thấy AssistantService — bỏ qua tự phân tích AI cho các khiếu nại mới.",
      );
    }

    return this.getEntityOrFail(id);
  }

  async list(filters: CaseListFilters) {
    return this.repo.findAndCount(filters);
  }

  async get(id: string) {
    return this.getEntityOrFail(id);
  }

  async getTimeline(id: string) {
    await this.getEntityOrFail(id);
    return this.repo.getTimeline(id);
  }

  async addEvidence(id: string, dto: AddEvidenceDto, user: AuthUser) {
    const c = await this.repo.findByIdOrFail(id);
    this.assertReporterOrAdmin(c, user, dto.actorId);
    const from = c.caseStatus;

    c.addEvidence(dto.urls);
    // Đang chờ bổ sung mà đã có bằng chứng mới ⇒ quay lại "đang xem xét".
    if (c.caseStatus === CaseStatus.WAITING_EVIDENCE) {
      c.review();
    }
    await this.repo.save(c);
    await this.repo.addTimeline({
      caseId: id,
      fromStatus: from,
      toStatus: c.caseStatus,
      actorId: user.userId,
      actorType: "CONSUMER",
      note: `Người khiếu nại bổ sung ${dto.urls.length} bằng chứng`,
    });

    // Bằng chứng mới ⇒ AI phân tích lại (không await: người gửi không phải chờ).
    if (this.assistant) {
      void this.assistant.triggerAutoAnalysis(id);
    }

    // Bên bị khiếu nại cần biết có bằng chứng mới để kịp phản hồi.
    void this.integration.notify(
      c.caseRespondentId,
      "Bên khiếu nại đã bổ sung bằng chứng",
      `Vụ việc ${c.caseNumberValue} — vui lòng xem lại và phản hồi nếu cần.`,
    );

    return this.getEntityOrFail(id);
  }

  async review(id: string, user: AuthUser) {
    const c = await this.repo.findByIdOrFail(id);
    const from = c.caseStatus;
    c.review();
    await this.repo.save(c);
    await this.repo.addTimeline({
      caseId: id,
      fromStatus: from,
      toStatus: c.caseStatus,
      actorId: user.userId,
      actorType: "ADMIN",
      note: "Under review",
    });
    return this.getEntityOrFail(id);
  }

  async requestEvidence(id: string, user: AuthUser) {
    const c = await this.repo.findByIdOrFail(id);
    const from = c.caseStatus;
    c.requestEvidence();
    await this.repo.save(c);
    await this.repo.addTimeline({
      caseId: id,
      fromStatus: from,
      toStatus: c.caseStatus,
      actorId: user.userId,
      actorType: "ADMIN",
      note: "Waiting for additional evidence",
    });
    return this.getEntityOrFail(id);
  }

  /**
   * Áp dụng quyết định AI mà admin đã duyệt.
   *
   * - `VALID` ⇒ `RESOLVED` + settle tiền + **ghi đúng hình phạt AI đề xuất**
   * - `INVALID` ⇒ `REJECTED` + release tiền đang giữ
   * - `INCONCLUSIVE` ⇒ `WAITING_EVIDENCE` (chờ bổ sung) — không quy lỗi cho ai
   *
   * Bên nào cần bổ sung bằng chứng thì nhận thông báo kèm đúng câu hỏi của AI;
   * khi đã có phán quyết thì cả hai bên nhận thông báo kết quả.
   */
  async applyAiDecision(
    id: string,
    input: AiDecisionInput,
    user: AuthUser,
  ): Promise<AiDecisionOutcome> {
    const c = await this.repo.findByIdOrFail(id);
    const from = c.caseStatus;

    c.resolve(input.verdict, input.note || null, user.userId, input.faultParty);
    await this.repo.save(c);
    await this.repo.addTimeline({
      caseId: id,
      fromStatus: from,
      toStatus: c.caseStatus,
      actorId: user.userId,
      actorType: "ADMIN",
      note: `Duyệt gợi ý AI: verdict=${input.verdict}, fault=${input.faultParty}`,
    });

    if (input.verdict === Verdict.INVALID && c.caseOrderId) {
      void this.integration.releaseSettlement(c.caseOrderId);
    }
    if (input.verdict === Verdict.VALID && c.caseOrderId) {
      void this.integration.settleFailureMoney(
        c.caseOrderId,
        c.caseFaultParty ?? "",
        c.caseSeverity,
      );
    }

    // Hình phạt: ưu tiên đúng hình phạt AI đề xuất (admin đã đọc & duyệt);
    // nếu AI không đề xuất gì thì dùng chính sách mặc định như luồng resolve thường.
    let penalties = 0;
    if (input.verdict === Verdict.VALID) {
      penalties =
        input.actions.length > 0
          ? await this.recordAiPenalties(c, input.actions)
          : await this.recordResolutionPenalties(c);
    }

    const notified: string[] = [];
    const evidenceRequestedFrom: string[] = [];
    const deadline = c.caseResponseDeadline
      ? c.caseResponseDeadline.toISOString().slice(0, 10)
      : null;

    if (input.verdict === Verdict.INCONCLUSIVE) {
      // Chưa đủ căn cứ ⇒ nhờ đúng bên còn thiếu bằng chứng cung cấp thêm.
      if (input.respondentQuestions.length > 0) {
        void this.integration.notify(
          c.caseRespondentId,
          "Cần bổ sung bằng chứng",
          `Vụ việc ${c.caseNumberValue}: ${input.respondentQuestions.join(" | ")}` +
            (deadline ? ` (hạn ${deadline})` : ""),
        );
        notified.push("RESPONDENT");
        evidenceRequestedFrom.push("RESPONDENT");
      }
      if (input.reporterQuestions.length > 0) {
        void this.integration.notify(
          c.caseReporterId,
          "Cần bổ sung bằng chứng",
          `Vụ việc ${c.caseNumberValue}: ${input.reporterQuestions.join(" | ")}` +
            (deadline ? ` (hạn ${deadline})` : ""),
        );
        notified.push("REPORTER");
        evidenceRequestedFrom.push("REPORTER");
      }
      if (notified.length === 0) {
        void this.integration.notify(
          c.caseReporterId,
          "Khiếu nại đang chờ bổ sung bằng chứng",
          `Vụ việc ${c.caseNumberValue} chưa đủ căn cứ kết luận — vui lòng bổ sung thêm bằng chứng.` +
            (deadline ? ` Hạn ${deadline}.` : ""),
        );
        notified.push("REPORTER");
      }
    } else {
      // Đã có phán quyết ⇒ báo cả hai bên.
      const verdictText =
        input.verdict === Verdict.VALID ? "CÓ căn cứ" : "KHÔNG có căn cứ";
      void this.integration.notify(
        c.caseReporterId,
        "Kết quả xử lý khiếu nại",
        `Vụ việc ${c.caseNumberValue} — kết quả: ${verdictText}. ${input.note}`.trim(),
      );
      notified.push("REPORTER");

      const respondentPenalty =
        input.verdict === Verdict.VALID
          ? input.actions
              .filter((a) => a.targetType === c.caseRespondentType)
              .map((a) => `${a.type}${a.amount ? ` ${a.amount}₫` : ""}`)
              .join(", ")
          : "";
      void this.integration.notify(
        c.caseRespondentId,
        "Kết quả xử lý khiếu nại",
        `Vụ việc ${c.caseNumberValue} — kết quả: ${verdictText}.` +
          (respondentPenalty
            ? ` Hình phạt áp dụng cho bạn: ${respondentPenalty}.`
            : ""),
      );
      notified.push("RESPONDENT");
    }

    const summary =
      input.verdict === Verdict.INCONCLUSIVE
        ? "Đã chuyển vụ việc sang chờ bổ sung bằng chứng" +
          (evidenceRequestedFrom.length
            ? ` (đã thông báo: ${evidenceRequestedFrom
                .map((p) =>
                  p === "REPORTER" ? "khách hàng" : "tài xế/nhà hàng",
                )
                .join(", ")})`
            : "")
        : `Đã áp dụng phán quyết ${input.verdict}` +
          (penalties > 0 ? ` và ghi ${penalties} hình phạt` : "") +
          "; đã thông báo cho cả hai bên.";

    return {
      applied: true,
      verdict: input.verdict,
      caseStatus: c.caseStatus,
      penalties,
      notified,
      evidenceRequestedFrom,
      summary,
    };
  }

  async resolve(id: string, dto: ResolveCaseDto, user: AuthUser) {
    const c = await this.repo.findByIdOrFail(id);
    const from = c.caseStatus;
    c.resolve(
      dto.verdict,
      dto.note ?? null,
      user.userId,
      (dto.faultParty as FaultParty) ?? null,
    );
    await this.repo.save(c);
    await this.repo.addTimeline({
      caseId: id,
      fromStatus: from,
      toStatus: c.caseStatus,
      actorId: user.userId,
      actorType: "ADMIN",
      note: dto.note ?? `Verdict: ${dto.verdict}`,
    });

    if (dto.verdict === Verdict.INVALID && c.caseOrderId) {
      void this.integration.releaseSettlement(c.caseOrderId);
    }
    if (dto.verdict === Verdict.VALID && c.caseOrderId) {
      void this.integration.settleFailureMoney(
        c.caseOrderId,
        c.caseFaultParty ?? "",
        c.caseSeverity,
      );
    }
    if (dto.verdict === Verdict.VALID) {
      await this.recordResolutionPenalties(c);
    }
    void this.integration.notify(
      c.caseReporterId,
      "Kết quả xử lý khiếu nại",
      `Vụ việc ${c.caseNumberValue} — kết quả: ${dto.verdict}`,
    );

    return this.getEntityOrFail(id);
  }

  async withdraw(id: string, dto: ActorIdDto, user: AuthUser) {
    const c = await this.repo.findByIdOrFail(id);
    this.assertReporterOrAdmin(c, user, dto?.actorId);
    const from = c.caseStatus;
    c.withdraw();
    await this.repo.save(c);
    await this.repo.addTimeline({
      caseId: id,
      fromStatus: from,
      toStatus: c.caseStatus,
      actorId: user.userId,
      actorType: this.mapRoleToActorType(user.roles),
      note: "Case withdrawn",
    });
    if (c.caseOrderId) {
      void this.integration.releaseSettlement(c.caseOrderId);
    }
    return this.getEntityOrFail(id);
  }

  async escalate(id: string, user: AuthUser) {
    const c = await this.repo.findByIdOrFail(id);
    const from = c.caseStatus;
    c.escalate();
    await this.repo.save(c);
    await this.repo.addTimeline({
      caseId: id,
      fromStatus: from,
      toStatus: c.caseStatus,
      actorId: user.userId,
      actorType: "ADMIN",
      note: "Escalated",
    });
    return this.getEntityOrFail(id);
  }

  async escalateStaleCases(olderThanHours = 72): Promise<number> {
    const stale = await this.repo.findStaleActive(olderThanHours);
    for (const c of stale) {
      const from = c.caseStatus;
      c.escalate();
      await this.repo.save(c);
      await this.repo.addTimeline({
        caseId: c.id.toString(),
        fromStatus: from,
        toStatus: c.caseStatus,
        actorId: "system",
        actorType: "SYSTEM",
        note: "Auto-escalated: SLA exceeded",
      });
    }
    if (stale.length > 0) {
      this.logger.log(`Auto-escalated ${stale.length} stale cases`);
    }
    return stale.length;
  }

  /** Người bị khiếu nại phản hồi (text + ảnh) → case chờ admin phán quyết. */
  async respond(id: string, dto: RespondCaseDto, user: AuthUser) {
    const c = await this.repo.findByIdOrFail(id);
    this.assertRespondent(c, user, dto.actorId);
    const from = c.caseStatus;
    c.respond(dto.text, dto.evidence ?? []);
    await this.repo.save(c);
    await this.repo.addTimeline({
      caseId: id,
      fromStatus: from,
      toStatus: c.caseStatus,
      actorId: user.userId,
      actorType: "CONSUMER",
      note: "Respondent responded",
    });

    // Có phản hồi (+ ảnh) mới ⇒ chạy lại AI nền để gợi ý không còn "chưa đọc
    // phản hồi". Không await: người phản hồi không phải chờ model.
    if (this.assistant) {
      void this.assistant.triggerAutoAnalysis(id);
    }

    // Bên bị tố cáo cũng cần biết hệ thống đã nhận phản hồi (trước đây không ai
    // được báo). Lỗi thông báo không được làm hỏng phản hồi.
    void this.integration.notify(
      c.caseRespondentId,
      "Đã nhận phản hồi của bạn",
      `Vụ việc ${c.caseNumberValue} — admin sẽ xem xét và phản hồi lại.`,
    );

    return this.getEntityOrFail(id);
  }

  /** Người bị khiếu nại xác nhận lỗi → tự chốt lỗi về phía mình. */
  async confirm(id: string, dto: ActorIdDto, user: AuthUser) {
    const c = await this.repo.findByIdOrFail(id);
    this.assertRespondent(c, user, dto?.actorId);
    const from = c.caseStatus;
    c.confirmFault(user.userId);
    await this.repo.save(c);
    await this.repo.addTimeline({
      caseId: id,
      fromStatus: from,
      toStatus: c.caseStatus,
      actorId: user.userId,
      actorType: "CONSUMER",
      note: "Respondent confirmed fault",
    });
    if (c.caseOrderId) {
      void this.integration.settleFailureMoney(
        c.caseOrderId,
        c.caseFaultParty ?? "",
        c.caseSeverity,
      );
    }
    await this.recordResolutionPenalties(c);
    return this.getEntityOrFail(id);
  }

  /** Tự chốt "lỗi khách" cho case quá hạn phản hồi (dùng bởi scheduler). */
  async autoResolveExpiredResponse(): Promise<number> {
    const expired = await this.repo.findPendingResponseExpired();
    for (const c of expired) {
      const from = c.caseStatus;
      c.confirmFault(
        "system",
        "Không phản hồi trong 72 giờ — tự động chốt lỗi",
      );
      await this.repo.save(c);
      await this.repo.addTimeline({
        caseId: c.id.toString(),
        fromStatus: from,
        toStatus: c.caseStatus,
        actorId: "system",
        actorType: "SYSTEM",
        note: "Auto-resolved: respondent did not respond in time",
      });
      if (c.caseOrderId) {
        void this.integration.settleFailureMoney(
          c.caseOrderId,
          c.caseFaultParty ?? "",
          c.caseSeverity,
        );
      }
      await this.recordResolutionPenalties(c);
    }
    if (expired.length > 0) {
      this.logger.log(
        `Auto-resolved ${expired.length} cases due to no response`,
      );
    }
    return expired.length;
  }

  private computeFineAmount(severity: string, total: number): number {
    const table: Record<
      string,
      { rate: number; floor: number; ceiling: number }
    > = {
      LOW: { rate: 0, floor: 0, ceiling: 0 },
      MEDIUM: { rate: 0.15, floor: 20000, ceiling: 200000 },
      HIGH: { rate: 0.25, floor: 40000, ceiling: 500000 },
      CRITICAL: { rate: 0.4, floor: 80000, ceiling: 1500000 },
    };
    const cfg = table[severity] ?? { rate: 0, floor: 0, ceiling: 0 };
    if (cfg.rate === 0) return 0;
    return Math.min(
      cfg.ceiling,
      Math.max(cfg.floor, Math.round(cfg.rate * total)),
    );
  }

  /** Ghi hình phạt đúng như AI đề xuất (admin đã duyệt), có chặn trần tiền. */
  private async recordAiPenalties(
    c: Case,
    actions: AiDecisionAction[],
  ): Promise<number> {
    const targetTypeMap: Record<string, string> = {
      CUSTOMER: "CONSUMER",
      DRIVER: "DRIVER",
      MERCHANT: "MERCHANT",
    };

    const order = c.caseOrderId
      ? await this.integration.getOrder(c.caseOrderId)
      : null;
    const total = Number(order?.totalAmount) || 0;
    // Chặn trần: model không được "đề xuất" mức phạt vô lý so với giá trị đơn.
    const cap = total > 0 ? Math.round(total * 2) : Number.POSITIVE_INFINITY;

    let created = 0;
    for (const action of actions) {
      const targetType = targetTypeMap[action.targetType];
      if (
        !targetType ||
        (targetType !== c.caseReporterType &&
          targetType !== c.caseRespondentType)
      ) {
        this.logger.warn(
          `Bỏ hình phạt ${action.type}: ${action.targetType} không tham gia vụ việc`,
        );
        continue;
      }
      if (!(action.type in PenaltyType)) {
        this.logger.warn(`Bỏ hình phạt: loại "${action.type}" không hỗ trợ`);
        continue;
      }

      const targetId =
        c.caseReporterType === targetType
          ? c.caseReporterId
          : c.caseRespondentId;
      if (!targetId) continue;

      const amount =
        action.amount && Number.isFinite(action.amount)
          ? Math.min(Math.round(action.amount), cap)
          : null;
      const durationDays =
        action.durationDays && Number.isFinite(action.durationDays)
          ? Math.round(action.durationDays)
          : null;

      await this.penaltyService.recordPenalty({
        caseId: c.id.toString(),
        type: action.type as PenaltyType,
        targetId,
        targetType,
        amount,
        durationDays,
        reason: action.reason,
      });
      created += 1;
    }

    if (created === 0) {
      this.logger.warn(
        "AI không đề xuất hình phạt nào hợp lệ — dùng chính sách mặc định",
      );
      return this.recordResolutionPenalties(c);
    }
    return created;
  }

  /**
   * Ghi nhận hình phạt (FINE cho bên lỗi + COMPENSATION cho bên khiếu nại)
   * để cả hai bên thấy được trên UI (penalties tab).
   *
   * @returns số hình phạt đã ghi.
   */
  private async recordResolutionPenalties(c: Case): Promise<number> {
    let created = 0;
    try {
      const fault = c.caseFaultParty;
      if (!fault || fault === "SYSTEM" || fault === "INCONCLUSIVE") return 0;
      const targetTypeMap: Record<string, string> = {
        CUSTOMER: "CONSUMER",
        DRIVER: "DRIVER",
        MERCHANT: "MERCHANT",
      };
      const targetType = targetTypeMap[fault];
      if (!targetType) return 0;
      const targetId =
        c.caseReporterType === targetType
          ? c.caseReporterId
          : c.caseRespondentId;

      const order = await this.integration.getOrder(c.caseOrderId ?? "");
      const total = Number(order?.totalAmount) || 0;
      const shippingFee = Number(order?.deliveryFee) || 0;

      const fine = this.computeFineAmount(c.caseSeverity, total);
      if (fine > 0 && targetId) {
        await this.penaltyService.recordPenalty({
          caseId: c.id.toString(),
          type: PenaltyType.FINE,
          targetId,
          targetType,
          amount: fine,
          reason: `Phạt do lỗi ${fault} — ${c.caseCategory}`,
        });
        created += 1;
      }

      // Bồi thường: ghi nhận trên tài khoản của bên khiếu nại (bên được hưởng).
      // Trường hợp bên khiếu nại đồng thời là bên lỗi (vd: tài xế tự nhận lỗi khi
      // giao thất bại) thì không có ai để bồi thường → bỏ qua mục bồi thường.
      const selfAdmittedFault = c.caseReporterType === targetType;
      if (!selfAdmittedFault) {
        const compensation =
          c.caseReporterType === "CONSUMER" ? total : shippingFee;
        if (compensation > 0 && c.caseReporterId) {
          await this.penaltyService.recordPenalty({
            caseId: c.id.toString(),
            type: PenaltyType.COMPENSATION,
            targetId: c.caseReporterId,
            targetType: c.caseReporterType,
            amount: compensation,
            reason: `Bồi thường do ${fault} gây lỗi`,
          });
          created += 1;
        }
      }
    } catch (err: any) {
      this.logger.warn(`Record resolution penalties failed: ${err?.message}`);
      return 0;
    }
    return created;
  }

  private assertRespondent(c: Case, user: AuthUser, actorId?: string): void {
    const isAdmin = user.roles.includes("ADMIN") || user.userId === "service";
    if (isAdmin) return;
    const callerId = actorId || user.userId;
    if (c.caseRespondentId !== callerId && c.caseRespondentId !== user.userId) {
      throw new ForbiddenException(
        "Only the respondent or an admin can do this",
      );
    }
  }

  private assertReporterOrAdmin(
    c: Case,
    user: AuthUser,
    actorId?: string,
  ): void {
    const isAdmin = user.roles.includes("ADMIN") || user.userId === "service";
    if (isAdmin) return;
    const callerId = actorId || user.userId;
    if (c.caseReporterId !== callerId && c.caseReporterId !== user.userId) {
      throw new ForbiddenException("Only the reporter or an admin can do this");
    }
  }

  private async getEntityOrFail(id: string) {
    const entity = await this.repo.findEntityById(id);
    if (!entity) {
      throw new NotFoundException(`Case ${id} not found`);
    }
    return entity;
  }
}
