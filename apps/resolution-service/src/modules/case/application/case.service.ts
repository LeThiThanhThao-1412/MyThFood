import {
  BadRequestException,
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
import {
  CaseMoneyDecision,
  decideCaseMoney,
} from "../domain/case.money-policy";
import {
  IntegrationService,
  SettlementResponse,
} from "../../integration/integration.service";
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

/**
 * Quyết định tiền theo chính sách + **số tiền thực sự đã chuyển** ở lần quyết
 * toán này.
 *
 * Vì sao tách `amount` (policy) khỏi `settledAmount` (ví): tab hình phạt chỉ
 * được ghi con số đã rời ví. Trước đây `recordReporterCompensation()` dùng
 * `policy.amount` nên khi ví trả `FAILURE_ALREADY_SETTLED` (đơn đã quyết toán)
 * vẫn sinh bút toán COMPENSATION ảo — CASE-2026-000002 ghi 93.247đ trong khi
 * không có đồng nào vào ví khách.
 */
export interface CaseSettlement extends CaseMoneyDecision {
  /** Tiền thực sự vào ví bên khiếu nại trong lần chạy này (0 nếu không chuyển). */
  settledAmount: number;
  /** Lý do không chuyển tiền / đã chuyển ở lần trước — dùng để log & hậu kiểm. */
  settlementNote: string | null;
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
      void this.integration.holdSettlement(c.caseOrderId, c.id.toString());
    }
    void this.integration.notify(
      dto.respondentId,
      "Bạn có khiếu nại mới",
      `${dto.subject} — mở mục "Khiếu nại" trong ứng dụng để phản hồi và gửi ảnh minh chứng trước hạn.`,
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

  /**
   * Bổ sung ảnh bằng chứng cho vụ việc — **cả hai bên** đều gọi được.
   *
   * Trước đây endpoint này chỉ mở cho người khiếu nại (và admin): `@Roles` loại
   * `MERCHANT_OWNER`/`DRIVER`, rồi `assertReporterOrAdmin()` chặn tiếp. Hệ quả:
   * nhà hàng **không có chỗ gửi ảnh minh chứng** — chỉ còn cách viết phản hồi
   * kèm ảnh, nhưng phản hồi chỉ mở lúc vụ việc còn `OPEN` và mỗi lần gửi lại ghi
   * đè nội dung cũ. Vì vậy AI luôn kết luận "Bên bị khiếu nại: không có ảnh".
   *
   * Nay ảnh được ghi vào đúng bên:
   * - người khiếu nại → `evidence` (bằng chứng của bên tố)
   * - bên bị khiếu nại → `respondentEvidence` (bằng chứng của bên bị tố)
   *
   * Tách trường để AI vẫn phân tích đúng "bên khiếu nại" / "bên bị khiếu nại" và
   * timeline ghi đúng người gửi (`actorType` suy ra từ role, không hard-code).
   */
  async addEvidence(id: string, dto: AddEvidenceDto, user: AuthUser) {
    if (!dto.urls?.length) {
      throw new BadRequestException("Cần ít nhất 1 ảnh bằng chứng");
    }
    const c = await this.repo.findByIdOrFail(id);
    const from = c.caseStatus;
    const isAdmin = user.roles.includes("ADMIN") || user.userId === "service";
    const callerId = dto.actorId || user.userId;
    const isRespondent =
      !isAdmin &&
      (c.caseRespondentId === callerId || c.caseRespondentId === user.userId);

    if (isRespondent) {
      c.addRespondentEvidence(dto.urls);
    } else {
      // Admin, hoặc người khiếu nại: chỉ hai nhóm này được ghi vào `evidence`.
      this.assertReporterOrAdmin(c, user, dto.actorId);
      c.addEvidence(dto.urls);
    }

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
      actorType: this.mapRoleToActorType(user.roles),
      note: isRespondent
        ? `Bên bị khiếu nại bổ sung ${dto.urls.length} ảnh minh chứng`
        : `Người khiếu nại bổ sung ${dto.urls.length} bằng chứng`,
    });

    // Bằng chứng mới ⇒ AI phân tích lại (không await: người gửi không phải chờ).
    if (this.assistant) {
      void this.assistant.triggerAutoAnalysis(id);
    }

    // Bên còn lại cần biết có bằng chứng mới để kịp phản hồi.
    if (isRespondent) {
      void this.integration.notify(
        c.caseReporterId,
        "Bên bị khiếu nại đã bổ sung ảnh minh chứng",
        `Vụ việc ${c.caseNumberValue} — vui lòng xem lại và bổ sung nếu cần.`,
      );
    } else {
      void this.integration.notify(
        c.caseRespondentId,
        "Bên khiếu nại đã bổ sung bằng chứng",
        `Vụ việc ${c.caseNumberValue} — vui lòng xem lại và phản hồi nếu cần.`,
      );
    }

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
      void this.releaseEscrow(c.caseOrderId, c);
    }
    // Quyết toán tiền theo chính sách (đơn đã giao ⇒ chỉ hoàn phí ship).
    let decision: CaseSettlement | undefined;
    if (input.verdict === Verdict.VALID && c.caseOrderId) {
      decision = await this.settleCaseMoney(c);
    }

    // Hình phạt: ưu tiên đúng hình phạt AI đề xuất (admin đã đọc & duyệt);
    // nếu AI không đề xuất gì thì dùng chính sách mặc định như luồng resolve thường.
    let penalties = 0;
    if (input.verdict === Verdict.VALID) {
      penalties =
        input.actions.length > 0
          ? await this.recordAiPenalties(c, input.actions, decision)
          : await this.recordResolutionPenalties(c, decision);
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
      void this.releaseEscrow(c.caseOrderId, c);
    }
    let decision: CaseSettlement | undefined;
    if (dto.verdict === Verdict.VALID) {
      // Đơn đã giao xong ⇒ chỉ hoàn phí ship; đơn giao thất bại ⇒ hoàn 100%.
      decision = await this.settleCaseMoney(c);
      await this.recordResolutionPenalties(c, decision);
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
      void this.releaseEscrow(c.caseOrderId, c);
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
      actorType: this.mapRoleToActorType(user.roles),
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
      actorType: this.mapRoleToActorType(user.roles),
      note: "Respondent confirmed fault",
    });
    const decision = await this.settleCaseMoney(c);
    await this.recordResolutionPenalties(c, decision);
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
      const decision = await this.settleCaseMoney(c);
      await this.recordResolutionPenalties(c, decision);
    }
    if (expired.length > 0) {
      this.logger.log(
        `Auto-resolved ${expired.length} cases due to no response`,
      );
    }
    return expired.length;
  }

  /**
   * Quyết toán tiền cho case có phán quyết `VALID`.
   *
   * Trước đây cả 4 call-site đều gọi thẳng `settleFailureMoney` (luồng của đơn
   * **giao thất bại**: hoàn 100% + huỷ escrow) nên khiếu nại "giao trễ" trên
   * đơn đã giao thành công bị xử như đơn thất bại. Nay dùng `decideCaseMoney()`:
   *
   *  - `FULL_REFUND` → order-service `settle-failure-money` (hoàn 100%).
   *  - `SHIP_COMPENSATION` → order-service `settle-compensation` (hoàn đúng
   *    phần phí ship, trừ đúng bên lỗi, không đụng tiền món).
   *  - `NONE` → không phát sinh dòng tiền.
   */
  /**
   * Quyết toán tiền cho case có phán quyết `VALID`.
   *
   * Trước đây cả 4 call-site đều gọi thẳng `settleFailureMoney` (luồng của đơn
   * **giao thất bại**: hoàn 100% + huỷ escrow) nên khiếu nại "giao trễ" trên
   * đơn đã giao thành công bị xử như đơn thất bại. Nay dùng `decideCaseMoney()`:
   *
   *  - `FULL_REFUND` → order-service `settle-failure-money` (hoàn 100%).
   *  - `SHIP_COMPENSATION` → order-service `settle-compensation` (hoàn đúng
   *    phần phí ship, trừ đúng bên lỗi, không đụng tiền món).
   *  - `NONE` → không phát sinh dòng tiền.
   *
   * Hai điều luật bất di bất dịch ở đây:
   *  1. **Đọc kết quả** route tiền (không fire-and-forget) để `settledAmount`
   *     phản ánh đúng số tiền ví đã chuyển — nhờ đó tab hình phạt không bao giờ
   *     ghi khoản tiền không tồn tại (bút toán ảo 93.247đ của CASE-2026-000002).
   *  2. **Luôn mở khoá escrow** khi phán quyết không tiêu thụ escrow. Trước đây
   *     chỉ nhánh INVALID/WITHDRAWN mới release, nên đơn `a13aae84` (giao trễ,
   *     VALID/DRIVER) bị treo 75.769đ `HELD_BY_DISPUTE` vĩnh viễn: nhà hàng và
   *     tài xế không bao giờ được quyết toán lúc 23:00.
   */
  private async settleCaseMoney(c: Case): Promise<CaseSettlement> {
    const orderId = c.caseOrderId;
    const order = orderId ? await this.integration.getOrder(orderId) : null;
    const decision = decideCaseMoney({
      verdict: c.caseVerdict,
      faultParty: c.caseFaultParty,
      category: c.caseCategory,
      reporterType: c.caseReporterType,
      order,
    });
    const status = String((order as any)?.status ?? "").toUpperCase();
    const delivered = status === "DELIVERED" || status === "COMPLETED";
    const label = `Case ${c.caseNumberValue}`;

    if (decision.mode === "NONE") {
      // Không có đồng nào rời ví ⇒ doanh thu của đơn phải về ví đúng hạn 23:00.
      // (Đơn chưa giao xong thì để escrow lại cho luồng giao thất bại xử lý.)
      if (orderId && delivered) await this.releaseEscrow(orderId, c);
      this.logger.log(`${label}: không quyết toán tiền — ${decision.reason}`);
      return { ...decision, settledAmount: 0, settlementNote: decision.reason };
    }

    if (!orderId) {
      return {
        ...decision,
        mode: "NONE",
        amount: 0,
        settledAmount: 0,
        reason: "Vụ việc không gắn đơn hàng — không thể quyết toán",
        settlementNote: "NO_ORDER",
      };
    }

    const outcome =
      decision.mode === "FULL_REFUND"
        ? await this.settleFullRefund(orderId, c)
        : await this.settleShipCompensation(orderId, c, decision.amount);

    this.logger.log(
      `${label}: ${decision.mode} policy=${decision.amount}đ, ví chuyển=${outcome.settledAmount}đ` +
        (outcome.settlementNote ? ` (${outcome.settlementNote})` : "") +
        ` — ${decision.reason}`,
    );
    return { ...decision, ...outcome };
  }

  /**
   * Hoàn 100% qua luồng chuyển tiền của ví.
   *
   * - Đơn **giao thất bại**: ví huỷ escrow + nền tảng ứng tiền trả nhà hàng/tài xế.
   * - Đơn **đã giao xong** (khiếu nại sau giao): ví GIẢI TOẢ escrow để 23:00 quyết
   *   toán bình thường và trừ đúng bên lỗi đúng số tiền khách được hoàn.
   *
   * Vì vậy ở đây KHÔNG được release tay: việc giải toả nằm trong cùng một lời gọi
   * (idempotent theo orderId), nếu release trước rồi ví chết giữa đường thì tiền
   * đã về lô 23:00 mà khách chưa được hoàn.
   */
  private async settleFullRefund(
    orderId: string,
    c: Case,
  ): Promise<Pick<CaseSettlement, "settledAmount" | "settlementNote">> {
    let res: SettlementResponse | null;
    try {
      res = await this.integration.settleFailureMoney(
        orderId,
        c.caseFaultParty ?? "",
        c.caseSeverity,
        c.id.toString(),
        c.caseResolvedAt ?? new Date(),
      );
    } catch (err: any) {
      // Lỗi mạng không được làm hỏng phán quyết (order-service/wallet-service
      // đều idempotent theo orderId nên có thể gọi lại sau).
      this.logger.warn(
        `Case ${c.caseNumberValue}: hoàn tiền đơn ${orderId.slice(0, 8)} lỗi — ${err?.message}`,
      );
      return { settledAmount: 0, settlementNote: "CALL_FAILED" };
    }
    if (!res) return { settledAmount: 0, settlementNote: "CALL_FAILED" };

    // `duplicated` ⇒ đơn đã được quyết toán (case khác hoặc lần chạy trước):
    // tiền đã vào ví từ trước, lần này không phát sinh dòng tiền mới nên tab
    // hình phạt không được ghi thêm một khoản nữa.
    if (res.duplicated) {
      return { settledAmount: 0, settlementNote: "FAILURE_ALREADY_SETTLED" };
    }

    const refunded = Math.max(0, Math.round(Number(res.refundAmount) || 0));
    return {
      settledAmount: refunded,
      settlementNote: refunded > 0 ? null : "NO_REFUND_AMOUNT",
    };
  }

  /** Bồi thường đúng phần phí ship cho khách (đơn đã giao xong). */
  private async settleShipCompensation(
    orderId: string,
    c: Case,
    amount: number,
  ): Promise<Pick<CaseSettlement, "settledAmount" | "settlementNote">> {
    let res: SettlementResponse | null;
    try {
      res = await this.integration.settleCaseCompensation({
        orderId,
        caseId: c.id.toString(),
        category: c.caseCategory,
        faultParty: c.caseFaultParty ?? "",
        amount,
      });
    } catch (err: any) {
      this.logger.warn(
        `Case ${c.caseNumberValue}: bồi thường phí ship đơn ${orderId.slice(0, 8)} lỗi — ${err?.message}`,
      );
      res = null;
    }

    // Đây chỉ là MỘT khoản bồi thường giữa hai ví — tiền món của nhà hàng và thu
    // nhập ship của tài xế vẫn phải được quyết toán lúc 23:00.
    await this.releaseEscrow(orderId, c);

    if (!res) return { settledAmount: 0, settlementNote: "CALL_FAILED" };
    // Ví bỏ qua (vd đơn đã quyết toán giao thất bại) ⇒ không có đồng nào vào ví
    // khách, nên không được ghi COMPENSATION (đây chính là bút toán ảo cũ).
    if (res.skipped) return { settledAmount: 0, settlementNote: res.skipped };

    const credited = Math.max(0, Math.round(Number(res.amount) || 0));
    // `duplicated` ⇒ ví đã chuyển khoản này ở lần trước (retry / case trùng):
    // lần này KHÔNG có đồng nào vào ví khách nên không được ghi COMPENSATION,
    // nếu không tab hình phạt lại hiện một khoản bồi thường ảo (đúng lỗi cũ của
    // nhánh `skipped`).
    if (res.duplicated) {
      return { settledAmount: 0, settlementNote: "DUPLICATED" };
    }
    return {
      settledAmount: credited,
      settlementNote: credited > 0 ? null : "NO_CREDIT",
    };
  }

  /**
   * Mở khoá doanh thu của đơn (HELD_BY_DISPUTE → PENDING) khi phán quyết không
   * tiêu thụ escrow. Idempotent: wallet chỉ đổi các dòng đang bị giữ.
   *
   * Ví nhận thêm `caseId` + `resolvedAt` để đóng dấu `settleOn` = 23:00 ngày
   * phán quyết ⇒ dòng tiền vào đúng lô quyết toán của ngày đó thay vì kẹt ngoài
   * cửa sổ `deliveredAt` cũ.
   *
   * Trước đây lỗi ở đây chỉ `warn` rồi bỏ ⇒ đơn `a13aae84` treo 75.769đ
   * HELD_BY_DISPUTE vĩnh viễn. Nay retry 1 lần, sau đó log ERROR và để cron
   * `repairHeldEscrows()` (mỗi 30 phút) gọi lại — gọi lại luôn an toàn.
   *
   * @returns `true` nếu ví đã trả lời thành công.
   */
  private async releaseEscrow(orderId: string, c: Case): Promise<boolean> {
    const caseId = c.id.toString();
    const resolvedAt = c.caseResolvedAt ?? new Date();
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await this.integration.releaseSettlement(orderId, {
          caseId,
          resolvedAt,
        });
        this.logger.log(
          `Case ${c.caseNumberValue}: mở khoá escrow đơn ${orderId.slice(0, 8)} — quyết toán ngày ${resolvedAt.toISOString()}`,
        );
        return true;
      } catch (err: any) {
        if (attempt === 2) {
          this.logger.error(
            `Case ${c.caseNumberValue}: mở khoá escrow đơn ${orderId.slice(0, 8)} thất bại sau ${attempt} lần ` +
              `— doanh thu vẫn HELD_BY_DISPUTE, cron read-repair sẽ thử lại (${err?.message})`,
          );
          return false;
        }
        this.logger.warn(
          `Case ${c.caseNumberValue}: mở khoá escrow đơn ${orderId.slice(0, 8)} lỗi (thử lại) — ${err?.message}`,
        );
      }
    }
    return false;
  }

  /**
   * Read-repair: mở khoá escrow còn treo của các case **đã kết thúc**.
   *
   * Vì sao cần: `releaseSettlement` là lời gọi HTTP sang wallet-service, có thể
   * chết đúng lúc phán quyết (deploy, timeout, mạng). Không có bước này thì
   * doanh thu của nhà hàng/tài xế nằm HELD_BY_DISPUTE vĩnh viễn và không bao giờ
   * vào lô 23:00 — đúng lỗi "case có phạt mà không được quyết toán".
   *
   * Chỉ những case mà phán quyết **không tiêu thụ escrow** (NONE /
   * SHIP_COMPENSATION) mới release tay; case FULL_REFUND phải đi qua đúng luồng
   * chuyển tiền của ví (hoàn khách + trừ bên lỗi + giải toả escrow trong MỘT lời
   * gọi idempotent). Release mù ở đây sẽ đẩy doanh thu vào lô 23:00 dù khách
   * chưa được hoàn đồng nào.
   *
   * @returns số case đã xử lý xong trong lượt chạy này.
   */
  async repairHeldEscrows(lookbackHours = 72, limit = 200): Promise<number> {
    const since = new Date(Date.now() - lookbackHours * 3600000);
    const cases = await this.repo.findResolvedWithOrderSince(since, limit);
    let repaired = 0;

    for (const c of cases) {
      const orderId = c.caseOrderId;
      if (!orderId) continue;
      try {
        const order = await this.integration.getOrder(orderId);
        if (!order) continue;

        const status = String((order as any)?.status ?? "").toUpperCase();
        if (status !== "DELIVERED" && status !== "COMPLETED") continue;

        const decision = decideCaseMoney({
          verdict: c.caseVerdict,
          faultParty: c.caseFaultParty,
          category: c.caseCategory,
          reporterType: c.caseReporterType,
          order,
        });
        if (decision.mode === "FULL_REFUND") {
          // Ví idempotent theo orderId ⇒ gọi lại an toàn: nếu lượt trước đã chạy
          // thì trả `FAILURE_ALREADY_SETTLED` (không phát sinh dòng tiền mới).
          const res = await this.settleFullRefund(orderId, c);
          if (
            res.settledAmount > 0 ||
            res.settlementNote === "FAILURE_ALREADY_SETTLED"
          ) {
            repaired++;
          }
          continue;
        }

        if (await this.releaseEscrow(orderId, c)) repaired++;
      } catch (err: any) {
        this.logger.warn(
          `Read-repair case ${c.caseNumberValue}: bỏ qua — ${err?.message}`,
        );
      }
    }

    if (repaired > 0) {
      this.logger.log(
        `Read-repair: mở khoá escrow cho ${repaired}/${cases.length} case đã kết thúc`,
      );
    }
    return repaired;
  }

  /** Ghi hình phạt đúng như AI đề xuất (admin đã duyệt), có chặn trần tiền. */
  private async recordAiPenalties(
    c: Case,
    actions: AiDecisionAction[],
    decision?: CaseSettlement,
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
    let compensationRecorded = false;
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

      // Chính sách mới: không phạt tiền khi giao thất bại ⇒ mọi đề xuất FINE
      // (mô hình cũ) được hạ thành WARNING, bỏ số tiền.
      const isLegacyFine = action.type === "FINE";

      // COMPENSATION phải ghi ĐÚNG số tiền đã thực trả (policy), không phải con
      // số AI tự đoán: đơn đã giao xong chỉ được hoàn phí ship, nên ghi 100%
      // giá trị đơn lên tab hình phạt sẽ mâu thuẫn với bút toán ví.
      if (action.type === "COMPENSATION" && targetType === c.caseReporterType) {
        const settled = decision?.settledAmount ?? 0;
        if (settled <= 0) {
          this.logger.log(
            `Bỏ COMPENSATION ${action.amount ?? "?"}đ: ví chưa chuyển tiền cho case này (${decision?.settlementNote ?? "chưa quyết toán"})`,
          );
          continue;
        }
        await this.penaltyService.recordPenalty({
          caseId: c.id.toString(),
          type: PenaltyType.COMPENSATION,
          targetId,
          targetType,
          amount: settled,
          durationDays: null,
          reason: action.reason,
        });
        compensationRecorded = true;
        created += 1;
        continue;
      }

      await this.penaltyService.recordPenalty({
        caseId: c.id.toString(),
        type: isLegacyFine ? PenaltyType.WARNING : (action.type as PenaltyType),
        targetId,
        targetType,
        amount: isLegacyFine ? null : amount,
        durationDays,
        reason: action.reason,
      });
      created += 1;
    }

    if (created === 0) {
      this.logger.warn(
        "AI không đề xuất hình phạt nào hợp lệ — dùng chính sách mặc định",
      );
      return this.recordResolutionPenalties(c, decision);
    }

    // AI có thể chỉ đề xuất WARNING (không đề xuất COMPENSATION) trong khi tiền
    // đã thực sự được quyết toán theo policy ⇒ bổ sung để tab hình phạt khớp ví.
    if (!compensationRecorded) {
      const fault = c.caseFaultParty;
      const faultTargetType = fault ? targetTypeMap[fault] : undefined;
      if (faultTargetType) {
        created += await this.recordReporterCompensation(
          c,
          faultTargetType,
          decision,
        );
      }
    }
    return created;
  }

  /**
   * Ghi hình phạt COMPENSATION cho bên khiếu nại với ĐÚNG số tiền ví đã chuyển
   * trong lần quyết toán này (`settledAmount`) — KHÔNG dùng con số policy/AI.
   *
   * Vì sao phải khớp: tab hình phạt là sổ đối chiếu với bút toán ví. Ghi theo
   * policy sẽ sinh "bút toán ảo" mỗi khi ví bỏ qua quyết toán (`FAILURE_ALREADY_SETTLED`,
   * đơn đã hoàn 100% từ case khác) — đúng lỗi của CASE-2026-000002 (93.247đ).
   *
   * @returns 1 nếu có ghi hình phạt, 0 nếu không (ví không chuyển tiền / tự nhận lỗi).
   */
  private async recordReporterCompensation(
    c: Case,
    faultTargetType: string,
    decision: CaseSettlement | undefined,
  ): Promise<number> {
    // Bên khiếu nại đồng thời là bên lỗi (vd tài xế tự nhận lỗi khi giao thất
    // bại) thì không có ai để bồi thường.
    if (c.caseReporterType === faultTargetType) return 0;
    if (!c.caseReporterId) return 0;
    // Tiền bồi thường chỉ được chuyển vào ví KHÁCH của đơn; bên khiếu nại là
    // nhà hàng/tài xế không nhận khoản này ⇒ không ghi hình phạt tiền.
    if (c.caseReporterType !== "CONSUMER") return 0;

    const compensation = Math.max(0, Math.round(decision?.settledAmount ?? 0));
    if (compensation <= 0) {
      this.logger.log(
        `Không ghi COMPENSATION cho case ${c.caseNumberValue}: ví không chuyển tiền` +
          ` (${decision?.settlementNote ?? "chưa quyết toán"})`,
      );
      return 0;
    }

    await this.penaltyService.recordPenalty({
      caseId: c.id.toString(),
      type: PenaltyType.COMPENSATION,
      targetId: c.caseReporterId,
      targetType: c.caseReporterType,
      amount: compensation,
      reason: `Bồi thường do ${c.caseFaultParty} gây lỗi`,
    });
    return 1;
  }

  /**
   * Ghi nhận hình phạt (WARNING không số tiền cho bên lỗi + COMPENSATION cho bên
   * khiếu nại) để cả hai bên thấy được trên UI (penalties tab).
   *
   * @returns số hình phạt đã ghi.
   */
  private async recordResolutionPenalties(
    c: Case,
    decision?: CaseSettlement,
  ): Promise<number> {
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

      // CHÍNH SÁCH MỚI: không phạt tiền khi đơn giao thất bại. Bên có lỗi chỉ
      // nhận hình phạt dạng WARNING (không số tiền) — app hiển thị banner vàng,
      // tiền do order-service/wallet-service route theo từng dòng nợ riêng.
      if (targetId) {
        await this.penaltyService.recordPenalty({
          caseId: c.id.toString(),
          type: PenaltyType.WARNING,
          targetId,
          targetType,
          amount: null,
          reason: `Cảnh báo lỗi ${fault} — ${c.caseCategory}`,
        });
        created += 1;
      }

      // Bồi thường: ghi nhận trên tài khoản của bên khiếu nại (bên được hưởng),
      // đúng bằng số tiền VÍ ĐÃ CHUYỂN ở lần quyết toán này (settledAmount).
      created += await this.recordReporterCompensation(c, targetType, decision);
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
