import {
  AggregateRoot,
  BusinessRuleViolationError,
} from "@mythfood/shared-kernel";
import { CaseId } from "./case-id";
import {
  ActorType,
  CaseCategory,
  CaseStatus,
  CaseType,
  Severity,
  Verdict,
} from "./case.enums";

export interface CaseProps {
  caseNumber: string;
  type: CaseType;
  category: CaseCategory;
  severity: Severity;
  orderId: string | null;
  reporterId: string;
  reporterType: ActorType;
  respondentId: string;
  respondentType: ActorType;
  subject: string;
  description: string;
  evidence: string[];
  verdict: Verdict | null;
  resolutionNote: string | null;
  status: CaseStatus;
  penaltyIds: string[];
  resolvedBy: string | null;
  resolvedAt: Date | null;
}

const ACTIVE_STATUSES: CaseStatus[] = [
  CaseStatus.OPEN,
  CaseStatus.UNDER_REVIEW,
  CaseStatus.WAITING_EVIDENCE,
];

export class Case extends AggregateRoot<CaseId> {
  private caseNumber: string;
  private type: CaseType;
  private category: CaseCategory;
  private severity: Severity;
  private orderId: string | null;
  private reporterId: string;
  private reporterType: ActorType;
  private respondentId: string;
  private respondentType: ActorType;
  private subject: string;
  private description: string;
  private evidence: string[];
  private verdict: Verdict | null;
  private resolutionNote: string | null;
  private status: CaseStatus;
  private penaltyIds: string[];
  private resolvedBy: string | null;
  private resolvedAt: Date | null;

  private constructor(id: CaseId, props: CaseProps) {
    super(id);
    this.caseNumber = props.caseNumber;
    this.type = props.type;
    this.category = props.category;
    this.severity = props.severity;
    this.orderId = props.orderId;
    this.reporterId = props.reporterId;
    this.reporterType = props.reporterType;
    this.respondentId = props.respondentId;
    this.respondentType = props.respondentType;
    this.subject = props.subject;
    this.description = props.description;
    this.evidence = props.evidence;
    this.verdict = props.verdict;
    this.resolutionNote = props.resolutionNote;
    this.status = props.status;
    this.penaltyIds = props.penaltyIds;
    this.resolvedBy = props.resolvedBy;
    this.resolvedAt = props.resolvedAt;
  }

  public static create(
    props: Omit<
      CaseProps,
      | "evidence"
      | "verdict"
      | "resolutionNote"
      | "status"
      | "penaltyIds"
      | "resolvedBy"
      | "resolvedAt"
    > & { evidence?: string[] },
  ): Case {
    if (!props.reporterId || props.reporterId.trim().length === 0) {
      throw new BusinessRuleViolationError("Reporter is required");
    }
    if (!props.respondentId || props.respondentId.trim().length === 0) {
      throw new BusinessRuleViolationError("Respondent is required");
    }
    if (!props.subject || props.subject.trim().length === 0) {
      throw new BusinessRuleViolationError("Subject is required");
    }
    return new Case(CaseId.create(), {
      caseNumber: props.caseNumber,
      type: props.type,
      category: props.category,
      severity: props.severity,
      orderId: props.orderId,
      reporterId: props.reporterId,
      reporterType: props.reporterType,
      respondentId: props.respondentId,
      respondentType: props.respondentType,
      subject: props.subject,
      description: props.description,
      evidence: props.evidence ?? [],
      verdict: null,
      resolutionNote: null,
      status: CaseStatus.OPEN,
      penaltyIds: [],
      resolvedBy: null,
      resolvedAt: null,
    });
  }

  public static rehydrate(id: CaseId, props: CaseProps): Case {
    return new Case(id, props);
  }

  public review(): void {
    this.assertActive("review");
    this.status = CaseStatus.UNDER_REVIEW;
    this.markUpdated();
  }

  public requestEvidence(): void {
    this.assertActive("request evidence");
    this.status = CaseStatus.WAITING_EVIDENCE;
    this.markUpdated();
  }

  public resolve(
    verdict: Verdict,
    note: string | null,
    resolvedBy: string,
  ): void {
    this.assertActive("resolve");
    if (verdict === Verdict.VALID) {
      this.status = CaseStatus.RESOLVED;
    } else if (verdict === Verdict.INVALID) {
      this.status = CaseStatus.REJECTED;
    } else {
      this.status = CaseStatus.WAITING_EVIDENCE;
    }
    this.verdict = verdict;
    this.resolutionNote = note ?? null;
    this.resolvedBy = resolvedBy;
    this.resolvedAt = new Date();
    this.markUpdated();
  }

  public withdraw(): void {
    this.assertActive("withdraw");
    this.status = CaseStatus.WITHDRAWN;
    this.markUpdated();
  }

  public escalate(): void {
    this.assertActive("escalate");
    this.status = CaseStatus.ESCALATED;
    this.markUpdated();
  }

  public close(): void {
    const closable: CaseStatus[] = [
      CaseStatus.RESOLVED,
      CaseStatus.REJECTED,
      CaseStatus.WITHDRAWN,
    ];
    if (!closable.includes(this.status)) {
      throw new BusinessRuleViolationError(
        `Only resolved/rejected/withdrawn cases can be closed, current: ${this.status}`,
      );
    }
    this.status = CaseStatus.CLOSED;
    this.markUpdated();
  }

  public addEvidence(urls: string[]): void {
    this.assertActive("add evidence");
    this.evidence = [...this.evidence, ...urls];
    this.markUpdated();
  }

  public addPenaltyId(penaltyId: string): void {
    if (!this.penaltyIds.includes(penaltyId)) {
      this.penaltyIds = [...this.penaltyIds, penaltyId];
      this.markUpdated();
    }
  }

  private assertActive(action: string): void {
    if (!ACTIVE_STATUSES.includes(this.status)) {
      throw new BusinessRuleViolationError(
        `Cannot ${action} a case in status ${this.status}`,
      );
    }
  }

  get caseNumberValue(): string {
    return this.caseNumber;
  }
  get caseType(): CaseType {
    return this.type;
  }
  get caseCategory(): CaseCategory {
    return this.category;
  }
  get caseSeverity(): Severity {
    return this.severity;
  }
  get caseOrderId(): string | null {
    return this.orderId;
  }
  get caseReporterId(): string {
    return this.reporterId;
  }
  get caseReporterType(): ActorType {
    return this.reporterType;
  }
  get caseRespondentId(): string {
    return this.respondentId;
  }
  get caseRespondentType(): ActorType {
    return this.respondentType;
  }
  get caseSubject(): string {
    return this.subject;
  }
  get caseDescription(): string {
    return this.description;
  }
  get caseEvidence(): string[] {
    return [...this.evidence];
  }
  get caseVerdict(): Verdict | null {
    return this.verdict;
  }
  get caseResolutionNote(): string | null {
    return this.resolutionNote;
  }
  get caseStatus(): CaseStatus {
    return this.status;
  }
  get casePenaltyIds(): string[] {
    return [...this.penaltyIds];
  }
  get caseResolvedBy(): string | null {
    return this.resolvedBy;
  }
  get caseResolvedAt(): Date | null {
    return this.resolvedAt;
  }
}
