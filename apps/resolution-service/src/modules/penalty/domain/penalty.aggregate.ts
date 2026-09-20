import {
  AggregateRoot,
  BusinessRuleViolationError,
} from "@mythfood/shared-kernel";
import { PenaltyId } from "./penalty-id";
import { PenaltyStatus, PenaltyType } from "./penalty.enums";

export interface PenaltyProps {
  caseId: string;
  type: PenaltyType;
  targetId: string;
  targetType: string;
  amount: number | null;
  durationDays: number | null;
  status: PenaltyStatus;
  reason: string;
  deadline: Date | null;
  appliedBy: string | null;
  appliedAt: Date | null;
}

export class Penalty extends AggregateRoot<PenaltyId> {
  private caseId: string;
  private type: PenaltyType;
  private targetId: string;
  private targetType: string;
  private amount: number | null;
  private durationDays: number | null;
  private status: PenaltyStatus;
  private reason: string;
  private deadline: Date | null;
  private appliedBy: string | null;
  private appliedAt: Date | null;

  private constructor(id: PenaltyId, props: PenaltyProps) {
    super(id);
    this.caseId = props.caseId;
    this.type = props.type;
    this.targetId = props.targetId;
    this.targetType = props.targetType;
    this.amount = props.amount;
    this.durationDays = props.durationDays;
    this.status = props.status;
    this.reason = props.reason;
    this.deadline = props.deadline;
    this.appliedBy = props.appliedBy;
    this.appliedAt = props.appliedAt;
  }

  public static create(
    props: Omit<
      PenaltyProps,
      "status" | "deadline" | "appliedBy" | "appliedAt"
    >,
  ): Penalty {
    if (!props.targetId || props.targetId.trim().length === 0) {
      throw new BusinessRuleViolationError("Penalty target is required");
    }
    return new Penalty(PenaltyId.create(), {
      caseId: props.caseId,
      type: props.type,
      targetId: props.targetId,
      targetType: props.targetType,
      amount: props.amount,
      durationDays: props.durationDays,
      status: PenaltyStatus.ISSUED,
      reason: props.reason,
      deadline: new Date(Date.now() + 48 * 3600000),
      appliedBy: null,
      appliedAt: null,
    });
  }

  public static rehydrate(id: PenaltyId, props: PenaltyProps): Penalty {
    return new Penalty(id, props);
  }

  public markExecuting(): void {
    if (this.status !== PenaltyStatus.ISSUED) {
      throw new BusinessRuleViolationError(
        `Cannot execute a penalty in status ${this.status}`,
      );
    }
    this.status = PenaltyStatus.EXECUTING;
    this.markUpdated();
  }

  public markExecuted(appliedBy: string): void {
    this.status = PenaltyStatus.EXECUTED;
    this.appliedBy = appliedBy;
    this.appliedAt = new Date();
    this.markUpdated();
  }

  public markExecutionFailed(): void {
    this.status = PenaltyStatus.EXECUTION_FAILED;
    this.markUpdated();
  }

  public appeal(): void {
    if (this.status !== PenaltyStatus.EXECUTED) {
      throw new BusinessRuleViolationError(
        `Only executed penalties can be appealed, current: ${this.status}`,
      );
    }
    if (this.deadline && this.deadline.getTime() < Date.now()) {
      throw new BusinessRuleViolationError("Appeal deadline has passed");
    }
    this.status = PenaltyStatus.APPEALED;
    this.markUpdated();
  }

  public decideAppeal(upheld: boolean): void {
    if (this.status !== PenaltyStatus.APPEALED) {
      throw new BusinessRuleViolationError(
        `Cannot decide an appeal in status ${this.status}`,
      );
    }
    this.status = upheld ? PenaltyStatus.UPHELD : PenaltyStatus.OVERTURNED;
    this.markUpdated();
  }

  public waive(): void {
    this.status = PenaltyStatus.WAIVED;
    this.markUpdated();
  }

  get penaltyCaseId(): string {
    return this.caseId;
  }
  get penaltyType(): PenaltyType {
    return this.type;
  }
  get penaltyTargetId(): string {
    return this.targetId;
  }
  get penaltyTargetType(): string {
    return this.targetType;
  }
  get penaltyAmount(): number | null {
    return this.amount;
  }
  get penaltyDurationDays(): number | null {
    return this.durationDays;
  }
  get penaltyStatus(): PenaltyStatus {
    return this.status;
  }
  get penaltyReason(): string {
    return this.reason;
  }
  get penaltyDeadline(): Date | null {
    return this.deadline;
  }
  get penaltyAppliedBy(): string | null {
    return this.appliedBy;
  }
  get penaltyAppliedAt(): Date | null {
    return this.appliedAt;
  }
}
