import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
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
  CaseType,
  FaultParty,
  Severity,
  Verdict,
} from "../domain/case.enums";
import { IntegrationService } from "../../integration/integration.service";
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

@Injectable()
export class CaseService {
  private readonly logger = new Logger(CaseService.name);

  constructor(
    private readonly repo: CaseRepository,
    private readonly integration: IntegrationService,
    @Inject(forwardRef(() => PenaltyService))
    private readonly penaltyService: PenaltyService,
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
    c.addEvidence(dto.urls);
    await this.repo.save(c);
    await this.repo.addTimeline({
      caseId: id,
      fromStatus: c.caseStatus,
      toStatus: c.caseStatus,
      actorId: user.userId,
      actorType: "CONSUMER",
      note: "Evidence added",
    });
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

  /**
   * Ghi nhận hình phạt (FINE cho bên lỗi + COMPENSATION cho bên khiếu nại)
   * để cả hai bên thấy được trên UI (penalties tab).
   */
  private async recordResolutionPenalties(c: Case): Promise<void> {
    try {
      const fault = c.caseFaultParty;
      if (!fault || fault === "SYSTEM" || fault === "INCONCLUSIVE") return;
      const targetTypeMap: Record<string, string> = {
        CUSTOMER: "CONSUMER",
        DRIVER: "DRIVER",
        MERCHANT: "MERCHANT",
      };
      const targetType = targetTypeMap[fault];
      if (!targetType) return;
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
      }

      // Bồi thường: ghi nhận trên tài khoản của bên khiếu nại (bên được hưởng).
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
      }
    } catch (err: any) {
      this.logger.warn(`Record resolution penalties failed: ${err?.message}`);
    }
  }

  private assertRespondent(
    c: Case,
    user: AuthUser,
    actorId?: string,
  ): void {
    const isAdmin = user.roles.includes("ADMIN") || user.userId === "service";
    if (isAdmin) return;
    const callerId = actorId || user.userId;
    if (
      c.caseRespondentId !== callerId &&
      c.caseRespondentId !== user.userId
    ) {
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
    if (
      c.caseReporterId !== callerId &&
      c.caseReporterId !== user.userId
    ) {
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
