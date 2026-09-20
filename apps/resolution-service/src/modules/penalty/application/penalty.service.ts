import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v4 as uuid } from "uuid";
import { PenaltyRepository, PenaltyListFilters } from "../infrastructure/penalty.repository";
import { Penalty } from "../domain/penalty.aggregate";
import { AppealEntity } from "../infrastructure/appeal.entity";
import { AppealStatus, PenaltyType } from "../domain/penalty.enums";
import { Case } from "../../case/domain/case.aggregate";
import { CaseRepository } from "../../case/infrastructure/case.repository";
import { CaseStatus, Verdict } from "../../case/domain/case.enums";
import { IntegrationService } from "../../integration/integration.service";
import {
  AppealPenaltyDto,
  DecideAppealDto,
  IssuePenaltyDto,
} from "./dtos/penalty.dto";

export interface AuthUser {
  userId: string;
  phone?: string;
  roles: string[];
}

@Injectable()
export class PenaltyService {
  constructor(
    private readonly repo: PenaltyRepository,
    private readonly caseRepo: CaseRepository,
    private readonly integration: IntegrationService,
  ) {}

  async issue(dto: IssuePenaltyDto, user: AuthUser) {
    const c = await this.caseRepo.findByIdOrFail(dto.caseId);
    if (c.caseStatus !== CaseStatus.RESOLVED || c.caseVerdict !== Verdict.VALID) {
      throw new BadRequestException(
        "Penalties can only be issued for VALID resolved cases",
      );
    }

    const p = Penalty.create({
      caseId: dto.caseId,
      type: dto.type,
      targetId: dto.targetId,
      targetType: dto.targetType,
      amount: dto.amount ?? null,
      durationDays: dto.durationDays ?? null,
      reason: dto.reason,
    });

    const id = p.id.toString();
    await this.repo.save(p);

    c.addPenaltyId(id);
    await this.caseRepo.save(c);

    await this.execute(p, c, user.userId);

    return this.getEntityOrFail(id);
  }

  async list(filters: PenaltyListFilters) {
    return this.repo.findAndCount(filters);
  }

  async get(id: string) {
    return this.getEntityOrFail(id);
  }

  private async execute(p: Penalty, c: Case, appliedBy: string): Promise<void> {
    p.markExecuting();
    await this.repo.save(p);
    await this.applySideEffects(p, c);
    p.markExecuted(appliedBy);
    await this.repo.save(p);
  }

  private async applySideEffects(p: Penalty, c: Case): Promise<void> {
    const amount = p.penaltyAmount ?? 0;
    const targetId = p.penaltyTargetId;
    const targetType = p.penaltyTargetType;

    switch (p.penaltyType) {
      case PenaltyType.FINE:
        await this.integration.debit(
          targetId,
          targetType,
          amount,
          `PENALTY ${p.id.toString()}: ${p.penaltyReason}`,
        );
        break;
      case PenaltyType.COMPENSATION:
        await this.integration.debit(
          targetId,
          targetType,
          amount,
          `COMPENSATION ${p.id.toString()}`,
        );
        await this.integration.credit(
          c.caseReporterId,
          c.caseReporterType,
          amount,
          `COMPENSATION ${p.id.toString()}`,
        );
        break;
      case PenaltyType.SUSPEND:
        if (targetType === "DRIVER") {
          await this.integration.suspendDriver(
            targetId,
            p.penaltyDurationDays ?? 7,
          );
        } else {
          await this.integration.suspendMerchant(targetId);
        }
        break;
      case PenaltyType.BAN:
        if (targetType === "DRIVER") {
          await this.integration.suspendDriver(targetId, 36500);
        } else {
          await this.integration.suspendMerchant(targetId);
        }
        break;
      case PenaltyType.REPUTATION_DEDUCTION:
        if (targetType === "DRIVER") {
          await this.integration.deductReputation(targetId, Math.round(amount));
        }
        break;
      case PenaltyType.WARNING:
      case PenaltyType.RESTRICT_ACTIVITY:
        break;
    }

    await this.integration.notify(
      targetId,
      "Bạn bị xử phạt",
      `${p.penaltyType}: ${p.penaltyReason}`,
    );
  }

  async appeal(id: string, dto: AppealPenaltyDto, user: AuthUser) {
    const p = await this.repo.findByIdOrFail(id);
    p.appeal();
    await this.repo.save(p);

    const existing = await this.repo.findAppealByPenaltyId(id);
    if (existing) {
      throw new BadRequestException("This penalty has already been appealed");
    }

    const appeal = new AppealEntity();
    appeal.id = uuid();
    appeal.penaltyId = id;
    appeal.appealedBy = user.userId;
    appeal.appealedByType = this.mapRoleToActorType(user.roles);
    appeal.reason = dto.reason;
    appeal.evidence = dto.evidence ?? [];
    appeal.status = AppealStatus.SUBMITTED;
    appeal.deadline = p.penaltyDeadline;
    appeal.decidedBy = null;
    appeal.decidedAt = null;
    await this.repo.saveAppeal(appeal);

    return this.getEntityOrFail(id);
  }

  async decideAppeal(id: string, dto: DecideAppealDto, user: AuthUser) {
    const p = await this.repo.findByIdOrFail(id);
    p.decideAppeal(dto.upheld);
    await this.repo.save(p);

    const appeal = await this.repo.findAppealByPenaltyId(id);
    if (appeal) {
      appeal.status = dto.upheld ? AppealStatus.UPHELD : AppealStatus.OVERTURNED;
      appeal.decidedBy = user.userId;
      appeal.decidedAt = new Date();
      await this.repo.saveAppeal(appeal);
    }

    if (!dto.upheld && p.penaltyType === PenaltyType.COMPENSATION) {
      const amount = p.penaltyAmount ?? 0;
      const c = await this.caseRepo.findByIdOrFail(p.penaltyCaseId);
      await this.integration.credit(
        p.penaltyTargetId,
        p.penaltyTargetType,
        amount,
        `OVERTURNED refund ${p.id.toString()}`,
      );
      await this.integration.debit(
        c.caseReporterId,
        c.caseReporterType,
        amount,
        `OVERTURNED reversal ${p.id.toString()}`,
      );
    }

    return this.getEntityOrFail(id);
  }

  async waive(id: string, _user: AuthUser) {
    const p = await this.repo.findByIdOrFail(id);
    p.waive();
    await this.repo.save(p);
    return this.getEntityOrFail(id);
  }

  private mapRoleToActorType(roles: string[]): string {
    const r = new Set(roles);
    if (r.has("ADMIN")) return "ADMIN";
    if (r.has("DRIVER")) return "DRIVER";
    if (r.has("MERCHANT_OWNER") || r.has("MERCHANT")) return "MERCHANT";
    return "CONSUMER";
  }

  private async getEntityOrFail(id: string) {
    const entity = await this.repo.findEntityById(id);
    if (!entity) {
      throw new NotFoundException(`Penalty ${id} not found`);
    }
    return entity;
  }
}

