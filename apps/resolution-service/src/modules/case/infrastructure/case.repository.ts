import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository as TypeOrmRepo } from "typeorm";
import { v4 as uuid } from "uuid";
import { Case } from "../domain/case.aggregate";
import { CaseId } from "../domain/case-id";
import {
  ActorType,
  CaseCategory,
  CaseStatus,
  CaseType,
  Severity,
  Verdict,
} from "../domain/case.enums";
import { CaseEntity } from "./case.entity";
import { CaseTimelineEntity } from "./case-timeline.entity";

export interface CaseListFilters {
  status?: CaseStatus;
  type?: CaseType;
  category?: CaseCategory;
  severity?: Severity;
  actorId?: string;
  skip: number;
  take: number;
}

export interface TimelineInput {
  caseId: string;
  fromStatus: string | null;
  toStatus: string;
  actorId?: string | null;
  actorType?: string | null;
  note?: string | null;
}

@Injectable()
export class CaseRepository {
  constructor(
    @InjectRepository(CaseEntity)
    private readonly repo: TypeOrmRepo<CaseEntity>,
    @InjectRepository(CaseTimelineEntity)
    private readonly timelineRepo: TypeOrmRepo<CaseTimelineEntity>,
  ) {}

  async save(aggregate: Case): Promise<void> {
    const entity = this.toEntity(aggregate);
    await this.repo.save(entity);
  }

  async findById(id: string): Promise<Case | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  async findByIdOrFail(id: string): Promise<Case> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) {
      throw new Error(`Case ${id} not found`);
    }
    return this.toDomain(entity);
  }

  async findEntityById(id: string): Promise<CaseEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async countAll(): Promise<number> {
    return this.repo.count();
  }

  async findAndCount(
    filters: CaseListFilters,
  ): Promise<{ items: CaseEntity[]; total: number }> {
    const qb = this.repo.createQueryBuilder("c");

    if (filters.status) {
      qb.andWhere("c.status = :status", { status: filters.status });
    }
    if (filters.type) {
      qb.andWhere("c.type = :type", { type: filters.type });
    }
    if (filters.category) {
      qb.andWhere("c.category = :category", { category: filters.category });
    }
    if (filters.severity) {
      qb.andWhere("c.severity = :severity", { severity: filters.severity });
    }
    if (filters.actorId) {
      qb.andWhere("(c.reporterId = :actorId OR c.respondentId = :actorId)", {
        actorId: filters.actorId,
      });
    }

    qb.orderBy("c.createdAt", "DESC").skip(filters.skip).take(filters.take);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async countRecentValid(respondentId: string, days: number): Promise<number> {
    const since = new Date(Date.now() - days * 86400000);
    const qb = this.repo
      .createQueryBuilder("c")
      .where("c.respondentId = :respondentId", { respondentId })
      .andWhere("c.verdict = :verdict", { verdict: Verdict.VALID })
      .andWhere("c.resolvedAt >= :since", { since });
    return qb.getCount();
  }

  async countRecentByRespondent(
    respondentId: string,
    days: number,
  ): Promise<number> {
    const since = new Date(Date.now() - days * 86400000);
    const qb = this.repo
      .createQueryBuilder("c")
      .where("c.respondentId = :respondentId", { respondentId })
      .andWhere("c.createdAt >= :since", { since });
    return qb.getCount();
  }

  async findStaleActive(olderThanHours: number): Promise<Case[]> {
    const since = new Date(Date.now() - olderThanHours * 3600000);
    const entities = await this.repo
      .createQueryBuilder("c")
      .where("c.status IN (:...statuses)", {
        statuses: [
          CaseStatus.OPEN,
          CaseStatus.UNDER_REVIEW,
          CaseStatus.WAITING_EVIDENCE,
        ],
      })
      .andWhere("c.createdAt <= :since", { since })
      .getMany();
    return entities.map((e) => this.toDomain(e));
  }

  async findHeavyRespondents(
    minCases: number,
    days: number,
  ): Promise<{ respondentId: string; count: number }[]> {
    const since = new Date(Date.now() - days * 86400000);
    const rows = await this.repo
      .createQueryBuilder("c")
      .select("c.respondentId", "respondentId")
      .addSelect("COUNT(*)", "count")
      .where("c.createdAt >= :since", { since })
      .groupBy("c.respondentId")
      .having("COUNT(*) >= :minCases", { minCases })
      .getRawMany();
    return rows.map((r) => ({
      respondentId: r.respondentId as string,
      count: Number(r.count),
    }));
  }

  async hasOpenFraudByRespondent(respondentId: string): Promise<boolean> {
    const count = await this.repo
      .createQueryBuilder("c")
      .where("c.respondentId = :respondentId", { respondentId })
      .andWhere("c.type = :type", { type: CaseType.FRAUD_REPORT })
      .andWhere("c.status IN (:...statuses)", {
        statuses: [
          CaseStatus.OPEN,
          CaseStatus.UNDER_REVIEW,
          CaseStatus.WAITING_EVIDENCE,
          CaseStatus.ESCALATED,
        ],
      })
      .getCount();
    return count > 0;
  }

  async addTimeline(input: TimelineInput): Promise<void> {
    const entity = new CaseTimelineEntity();
    entity.id = uuid();
    entity.caseId = input.caseId;
    entity.fromStatus = input.fromStatus ?? null;
    entity.toStatus = input.toStatus;
    entity.actorId = input.actorId ?? null;
    entity.actorType = input.actorType ?? null;
    entity.note = input.note ?? null;
    await this.timelineRepo.save(entity);
  }

  async getTimeline(caseId: string): Promise<CaseTimelineEntity[]> {
    return this.timelineRepo.find({
      where: { caseId },
      order: { createdAt: "ASC" },
    });
  }

  private toEntity(c: Case): CaseEntity {
    const entity = new CaseEntity();
    entity.id = c.id.toString();
    entity.caseNumber = c.caseNumberValue;
    entity.type = c.caseType;
    entity.category = c.caseCategory;
    entity.severity = c.caseSeverity;
    entity.orderId = c.caseOrderId;
    entity.reporterId = c.caseReporterId;
    entity.reporterType = c.caseReporterType;
    entity.respondentId = c.caseRespondentId;
    entity.respondentType = c.caseRespondentType;
    entity.subject = c.caseSubject;
    entity.description = c.caseDescription;
    entity.evidence = c.caseEvidence;
    entity.verdict = c.caseVerdict;
    entity.resolutionNote = c.caseResolutionNote;
    entity.status = c.caseStatus;
    entity.penaltyIds = c.casePenaltyIds;
    entity.resolvedBy = c.caseResolvedBy;
    entity.resolvedAt = c.caseResolvedAt;
    return entity;
  }

  private toDomain(e: CaseEntity): Case {
    return Case.rehydrate(CaseId.from(e.id), {
      caseNumber: e.caseNumber,
      type: e.type as CaseType,
      category: e.category as CaseCategory,
      severity: e.severity as Severity,
      orderId: e.orderId ?? null,
      reporterId: e.reporterId,
      reporterType: e.reporterType as ActorType,
      respondentId: e.respondentId,
      respondentType: e.respondentType as ActorType,
      subject: e.subject,
      description: e.description,
      evidence: e.evidence ?? [],
      verdict: (e.verdict as Verdict) ?? null,
      resolutionNote: e.resolutionNote ?? null,
      status: e.status as CaseStatus,
      penaltyIds: e.penaltyIds ?? [],
      resolvedBy: e.resolvedBy ?? null,
      resolvedAt: e.resolvedAt ?? null,
    });
  }
}
