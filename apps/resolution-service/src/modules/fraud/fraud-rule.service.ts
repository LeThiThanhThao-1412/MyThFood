import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { v4 as uuid } from "uuid";
import { FraudRuleEntity } from "./fraud-rule.entity";
import { FraudRuleRepository } from "./fraud-rule.repository";
import { CreateFraudRuleDto, UpdateFraudRuleDto } from "./fraud-rule.dto";
import { Case } from "../case/domain/case.aggregate";
import { CaseRepository } from "../case/infrastructure/case.repository";
import {
  CaseCategory,
  CaseType,
  Severity,
} from "../case/domain/case.enums";

@Injectable()
export class FraudRuleService {
  private readonly logger = new Logger(FraudRuleService.name);

  constructor(
    private readonly ruleRepo: FraudRuleRepository,
    private readonly caseRepo: CaseRepository,
  ) {}

  async list(): Promise<FraudRuleEntity[]> {
    return this.ruleRepo.findAll();
  }

  async create(dto: CreateFraudRuleDto): Promise<FraudRuleEntity> {
    const rule = new FraudRuleEntity();
    rule.id = uuid();
    rule.name = dto.name;
    rule.category = dto.category;
    rule.description = dto.description ?? null;
    rule.severity = dto.severity ?? "MEDIUM";
    rule.enabled = true;
    rule.config = dto.config ?? null;
    return this.ruleRepo.save(rule);
  }

  async update(id: string, dto: UpdateFraudRuleDto): Promise<FraudRuleEntity> {
    const rule = await this.ruleRepo.findById(id);
    if (!rule) {
      throw new NotFoundException(`Fraud rule ${id} not found`);
    }
    if (dto.name !== undefined) rule.name = dto.name;
    if (dto.description !== undefined) rule.description = dto.description;
    if (dto.severity !== undefined) rule.severity = dto.severity;
    if (dto.enabled !== undefined) rule.enabled = dto.enabled;
    if (dto.config !== undefined) rule.config = dto.config;
    return this.ruleRepo.save(rule);
  }

  async delete(id: string): Promise<void> {
    await this.ruleRepo.remove(id);
  }

  /**
   * Simple fraud heuristic: any respondent with >= minCases cases in the last
   * `days` days gets an auto-created FRAUD_REPORT case (SYSTEM reporter).
   */
  async detectAnomalies(minCases = 3, days = 30) {
    const heavy = await this.caseRepo.findHeavyRespondents(minCases, days);
    let created = 0;

    for (const h of heavy) {
      if (await this.caseRepo.hasOpenFraudByRespondent(h.respondentId)) {
        continue;
      }

      const c = Case.create({
        caseNumber: await this.nextCaseNumber(),
        type: CaseType.FRAUD_REPORT,
        category: CaseCategory.REFUND_ABUSE,
        severity: Severity.HIGH,
        orderId: null,
        reporterId: "system",
        reporterType: "SYSTEM",
        respondentId: h.respondentId,
        respondentType: "CONSUMER",
        subject: "Phát hiện gian lận tự động",
        description: `Đối tượng có ${h.count} vụ việc trong ${days} ngày gần nhất, cần điều tra.`,
        evidence: [],
      });

      await this.caseRepo.save(c);
      await this.caseRepo.addTimeline({
        caseId: c.id.toString(),
        fromStatus: null,
        toStatus: c.caseStatus,
        actorId: "system",
        actorType: "SYSTEM",
        note: "Auto-flagged by fraud engine",
      });
      created++;
    }

    if (created > 0) {
      this.logger.log(`Fraud engine auto-flagged ${created} respondents`);
    }
    return { flagged: heavy.length, created };
  }

  private async nextCaseNumber(): Promise<string> {
    const seq = (await this.caseRepo.countAll()) + 1;
    const year = new Date().getFullYear();
    return `CASE-${year}-${String(seq).padStart(6, "0")}`;
  }
}
