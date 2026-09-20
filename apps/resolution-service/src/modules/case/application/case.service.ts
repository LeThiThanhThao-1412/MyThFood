import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  CaseListFilters,
  CaseRepository,
} from "../infrastructure/case.repository";
import { Case } from "../domain/case.aggregate";
import {
  ActorType,
  CaseCategory,
  Severity,
  Verdict,
} from "../domain/case.enums";
import { IntegrationService } from "../../integration/integration.service";
import { AddEvidenceDto, CreateCaseDto, ResolveCaseDto } from "./dtos/case.dto";

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
    const reporterType = this.mapRoleToActorType(user.roles);
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
      reporterId: user.userId,
      reporterType,
      respondentId: dto.respondentId,
      respondentType: dto.respondentType as ActorType,
      subject: dto.subject,
      description: dto.description,
      evidence: dto.evidence ?? [],
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
    this.assertReporterOrAdmin(c, user);
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
    c.resolve(dto.verdict, dto.note ?? null, user.userId);
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
    void this.integration.notify(
      c.caseReporterId,
      "Kết quả xử lý khiếu nại",
      `Vụ việc ${c.caseNumberValue} — kết quả: ${dto.verdict}`,
    );

    return this.getEntityOrFail(id);
  }

  async withdraw(id: string, user: AuthUser) {
    const c = await this.repo.findByIdOrFail(id);
    this.assertReporterOrAdmin(c, user);
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

  private assertReporterOrAdmin(c: Case, user: AuthUser): void {
    const isAdmin = user.roles.includes("ADMIN") || user.userId === "service";
    if (c.caseReporterId !== user.userId && !isAdmin) {
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
