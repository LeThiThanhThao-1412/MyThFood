import { Penalty } from "../../modules/penalty/domain/penalty.aggregate";
import { PenaltyId } from "../../modules/penalty/domain/penalty-id";
import {
  PenaltyStatus,
  PenaltyType,
} from "../../modules/penalty/domain/penalty.enums";
import { BusinessRuleViolationError } from "@mythfood/shared-kernel";

describe("Penalty Aggregate", () => {
  const validProps = {
    caseId: "550e8400-e29b-41d4-a716-446655440099",
    type: PenaltyType.FINE,
    targetId: "driver-1",
    targetType: "DRIVER",
    amount: 100000,
    durationDays: null,
    reason: "Giả giao hàng",
  };

  describe("create", () => {
    it("should create ISSUED with a 48h deadline", () => {
      const p = Penalty.create(validProps);
      expect(p.penaltyStatus).toBe(PenaltyStatus.ISSUED);
      expect(p.penaltyDeadline).not.toBeNull();
      expect(p.penaltyAppliedBy).toBeNull();
    });
  });

  describe("execute", () => {
    it("ISSUED -> EXECUTING -> EXECUTED", () => {
      const p = Penalty.create(validProps);
      p.markExecuting();
      expect(p.penaltyStatus).toBe(PenaltyStatus.EXECUTING);
      p.markExecuted("admin-1");
      expect(p.penaltyStatus).toBe(PenaltyStatus.EXECUTED);
      expect(p.penaltyAppliedBy).toBe("admin-1");
    });

    it("markExecutionFailed", () => {
      const p = Penalty.create(validProps);
      p.markExecuting();
      p.markExecutionFailed();
      expect(p.penaltyStatus).toBe(PenaltyStatus.EXECUTION_FAILED);
    });
  });

  describe("appeal", () => {
    it("should appeal from EXECUTED", () => {
      const p = Penalty.create(validProps);
      p.markExecuting();
      p.markExecuted("admin-1");
      p.appeal();
      expect(p.penaltyStatus).toBe(PenaltyStatus.APPEALED);
    });

    it("should throw when appealing an ISSUED penalty", () => {
      const p = Penalty.create(validProps);
      expect(() => p.appeal()).toThrow(BusinessRuleViolationError);
    });

    it("should throw when deadline has passed", () => {
      const p = Penalty.rehydrate(
        PenaltyId.from("550e8400-e29b-41d4-a716-446655440099"),
        {
          caseId: validProps.caseId,
          type: PenaltyType.FINE,
          targetId: validProps.targetId,
          targetType: validProps.targetType,
          amount: validProps.amount,
          durationDays: null,
          status: PenaltyStatus.EXECUTED,
          reason: validProps.reason,
          deadline: new Date(Date.now() - 1000),
          appliedBy: "admin-1",
          appliedAt: new Date(),
        },
      );
      expect(() => p.appeal()).toThrow(BusinessRuleViolationError);
    });
  });

  describe("decideAppeal", () => {
    it("UPHELD keeps the penalty", () => {
      const p = Penalty.create(validProps);
      p.markExecuting();
      p.markExecuted("admin-1");
      p.appeal();
      p.decideAppeal(true);
      expect(p.penaltyStatus).toBe(PenaltyStatus.UPHELD);
    });

    it("OVERTURNED reverses the penalty", () => {
      const p = Penalty.create(validProps);
      p.markExecuting();
      p.markExecuted("admin-1");
      p.appeal();
      p.decideAppeal(false);
      expect(p.penaltyStatus).toBe(PenaltyStatus.OVERTURNED);
    });
  });

  describe("waive", () => {
    it("should waive a penalty", () => {
      const p = Penalty.create(validProps);
      p.waive();
      expect(p.penaltyStatus).toBe(PenaltyStatus.WAIVED);
    });
  });
});
