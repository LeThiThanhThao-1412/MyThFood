import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository as TypeOrmRepo } from "typeorm";
import { Penalty } from "../domain/penalty.aggregate";
import { PenaltyId } from "../domain/penalty-id";
import { PenaltyStatus, PenaltyType } from "../domain/penalty.enums";
import { PenaltyEntity } from "./penalty.entity";
import { AppealEntity } from "./appeal.entity";

export interface PenaltyListFilters {
  targetId?: string;
  targetType?: string;
  status?: PenaltyStatus;
  skip: number;
  take: number;
}

@Injectable()
export class PenaltyRepository {
  constructor(
    @InjectRepository(PenaltyEntity)
    private readonly repo: TypeOrmRepo<PenaltyEntity>,
    @InjectRepository(AppealEntity)
    private readonly appealRepo: TypeOrmRepo<AppealEntity>,
  ) {}

  async save(aggregate: Penalty): Promise<void> {
    await this.repo.save(this.toEntity(aggregate));
  }

  async findById(id: string): Promise<Penalty | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  async findByIdOrFail(id: string): Promise<Penalty> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) {
      throw new Error(`Penalty ${id} not found`);
    }
    return this.toDomain(entity);
  }

  async findEntityById(id: string): Promise<PenaltyEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findAndCount(
    filters: PenaltyListFilters,
  ): Promise<{ items: PenaltyEntity[]; total: number }> {
    const qb = this.repo.createQueryBuilder("p");
    if (filters.targetId) {
      qb.andWhere("p.targetId = :targetId", { targetId: filters.targetId });
    }
    if (filters.targetType) {
      qb.andWhere("p.targetType = :targetType", {
        targetType: filters.targetType,
      });
    }
    if (filters.status) {
      qb.andWhere("p.status = :status", { status: filters.status });
    }
    qb.orderBy("p.createdAt", "DESC").skip(filters.skip).take(filters.take);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async findAppealByPenaltyId(penaltyId: string): Promise<AppealEntity | null> {
    return this.appealRepo.findOne({ where: { penaltyId } });
  }

  async saveAppeal(appeal: AppealEntity): Promise<AppealEntity> {
    return this.appealRepo.save(appeal);
  }

  async findAppealById(id: string): Promise<AppealEntity | null> {
    return this.appealRepo.findOne({ where: { id } });
  }

  private toEntity(p: Penalty): PenaltyEntity {
    const entity = new PenaltyEntity();
    entity.id = p.id.toString();
    entity.caseId = p.penaltyCaseId;
    entity.type = p.penaltyType;
    entity.targetId = p.penaltyTargetId;
    entity.targetType = p.penaltyTargetType;
    entity.amount = p.penaltyAmount;
    entity.durationDays = p.penaltyDurationDays;
    entity.status = p.penaltyStatus;
    entity.reason = p.penaltyReason;
    entity.deadline = p.penaltyDeadline;
    entity.appliedBy = p.penaltyAppliedBy;
    entity.appliedAt = p.penaltyAppliedAt;
    return entity;
  }

  private toDomain(e: PenaltyEntity): Penalty {
    return Penalty.rehydrate(PenaltyId.from(e.id), {
      caseId: e.caseId,
      type: e.type as PenaltyType,
      targetId: e.targetId,
      targetType: e.targetType,
      amount: e.amount != null ? Number(e.amount) : null,
      durationDays: e.durationDays,
      status: e.status as PenaltyStatus,
      reason: e.reason,
      deadline: e.deadline,
      appliedBy: e.appliedBy,
      appliedAt: e.appliedAt,
    });
  }
}
