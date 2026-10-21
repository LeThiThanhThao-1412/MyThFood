import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import { In, Repository } from "typeorm";
import { CaseAiAnalysisEntity } from "./analysis.entity";
import {
  AiAnalysisSource,
  AiReviewDecision,
  CaseAiAnalysisRecord,
  CaseAiListSummary,
  CaseAiSuggestion,
} from "../domain/assistant.types";

/** Lưu trữ bản phân tích AI của vụ việc (1 bản/vụ việc, ghi đè khi phân tích lại). */
@Injectable()
export class CaseAiAnalysisRepository {
  constructor(
    @InjectRepository(CaseAiAnalysisEntity)
    private readonly repo: Repository<CaseAiAnalysisEntity>,
  ) {}

  async saveAnalysis(input: {
    caseId: string;
    caseNumber: string;
    source: AiAnalysisSource;
    suggestion: CaseAiSuggestion;
  }): Promise<CaseAiAnalysisRecord> {
    const existing = await this.repo.findOne({
      where: { caseId: input.caseId },
    });

    const entity =
      existing ??
      this.repo.create({
        id: randomUUID(),
        caseId: input.caseId,
      } as Partial<CaseAiAnalysisEntity>);

    entity.caseNumber = input.caseNumber;
    entity.source = input.source;
    entity.model = input.suggestion.model;
    entity.verdict = input.suggestion.suggestedVerdict;
    entity.confidence = String(input.suggestion.confidence);
    entity.payload = input.suggestion as unknown as Record<string, unknown>;

    // Nội dung mới ⇒ vết duyệt cũ không còn giá trị, admin phải xem lại.
    entity.reviewDecision = null;
    entity.reviewedBy = null;
    entity.reviewedAt = null;
    entity.reviewNote = null;

    return this.toRecord(await this.repo.save(entity));
  }

  async findByCaseId(caseId: string): Promise<CaseAiAnalysisRecord | null> {
    const entity = await this.repo.findOne({ where: { caseId } });
    return entity ? this.toRecord(entity) : null;
  }

  /**
   * Bản rút gọn cho NHIỀU vụ việc (badge AI trên lưới vụ việc).
   *
   * Chỉ select các cột nhẹ + `summary` trong payload, không trả cả JSONB nặng.
   */
  async findSummaries(caseIds: string[]): Promise<CaseAiListSummary[]> {
    if (caseIds.length === 0) return [];
    const rows = await this.repo.find({
      select: {
        caseId: true,
        verdict: true,
        confidence: true,
        source: true,
        reviewDecision: true,
        createdAt: true,
        payload: true,
      },
      where: { caseId: In(caseIds) },
    });

    return rows.map((row) => ({
      caseId: row.caseId,
      verdict: row.verdict as CaseAiListSummary["verdict"],
      confidence: Number(row.confidence) || 0,
      summary: String((row.payload as any)?.summary ?? ""),
      source: row.source as AiAnalysisSource,
      reviewDecision: row.reviewDecision as AiReviewDecision | null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Lưu quyết định duyệt/bỏ qua của admin. Trả `null` nếu vụ việc chưa có bản phân tích. */
  async saveReview(
    caseId: string,
    decision: AiReviewDecision,
    by: string,
    note: string | null,
  ): Promise<CaseAiAnalysisRecord | null> {
    const entity = await this.repo.findOne({ where: { caseId } });
    if (!entity) return null;

    entity.reviewDecision = decision;
    entity.reviewedBy = by;
    entity.reviewedAt = new Date();
    entity.reviewNote = note;

    return this.toRecord(await this.repo.save(entity));
  }

  private toRecord(entity: CaseAiAnalysisEntity): CaseAiAnalysisRecord {
    return {
      caseId: entity.caseId,
      caseNumber: entity.caseNumber,
      source: entity.source as AiAnalysisSource,
      createdAt: entity.createdAt.toISOString(),
      suggestion: entity.payload as unknown as CaseAiSuggestion,
      // Độ "cũ" do tầng service tính (so với phản hồi của bên bị khiếu nại).
      stale: false,
      review: entity.reviewDecision
        ? {
            decision: entity.reviewDecision as AiReviewDecision,
            by: entity.reviewedBy ?? "",
            at: (entity.reviewedAt ?? entity.updatedAt).toISOString(),
            note: entity.reviewNote ?? null,
          }
        : null,
    };
  }
}
