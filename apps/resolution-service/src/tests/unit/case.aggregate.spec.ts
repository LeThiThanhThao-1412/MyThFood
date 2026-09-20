import { Case } from "../../modules/case/domain/case.aggregate";
import {
  ActorType,
  CaseCategory,
  CaseStatus,
  CaseType,
  Severity,
  Verdict,
} from "../../modules/case/domain/case.enums";
import { BusinessRuleViolationError } from "@mythfood/shared-kernel";

describe("Case Aggregate", () => {
  const validProps = {
    caseNumber: "CASE-2026-000001",
    type: CaseType.COMPLAINT,
    category: CaseCategory.MISSING_ITEM,
    severity: Severity.LOW,
    orderId: "550e8400-e29b-41d4-a716-446655440099",
    reporterId: "reporter-1",
    reporterType: "CONSUMER" as ActorType,
    respondentId: "respondent-1",
    respondentType: "MERCHANT" as ActorType,
    subject: "Thiếu món",
    description: "Đặt 3 món nhưng nhận 2 món",
  };

  describe("create", () => {
    it("should create a case in OPEN status", () => {
      const c = Case.create(validProps);
      expect(c.caseStatus).toBe(CaseStatus.OPEN);
      expect(c.caseVerdict).toBeNull();
      expect(c.casePenaltyIds).toHaveLength(0);
      expect(c.caseEvidence).toHaveLength(0);
    });

    it("should throw when reporter is missing", () => {
      expect(() => Case.create({ ...validProps, reporterId: "" })).toThrow(
        BusinessRuleViolationError,
      );
    });

    it("should throw when respondent is missing", () => {
      expect(() => Case.create({ ...validProps, respondentId: "" })).toThrow(
        BusinessRuleViolationError,
      );
    });
  });

  describe("review", () => {
    it("should move to UNDER_REVIEW", () => {
      const c = Case.create(validProps);
      c.review();
      expect(c.caseStatus).toBe(CaseStatus.UNDER_REVIEW);
    });
  });

  describe("resolve", () => {
    it("VALID -> RESOLVED", () => {
      const c = Case.create(validProps);
      c.resolve(Verdict.VALID, "đúng lỗi", "admin-1");
      expect(c.caseStatus).toBe(CaseStatus.RESOLVED);
      expect(c.caseVerdict).toBe(Verdict.VALID);
      expect(c.caseResolvedBy).toBe("admin-1");
      expect(c.caseResolvedAt).not.toBeNull();
    });

    it("INVALID -> REJECTED", () => {
      const c = Case.create(validProps);
      c.resolve(Verdict.INVALID, null, "admin-1");
      expect(c.caseStatus).toBe(CaseStatus.REJECTED);
    });

    it("INCONCLUSIVE -> WAITING_EVIDENCE", () => {
      const c = Case.create(validProps);
      c.resolve(Verdict.INCONCLUSIVE, null, "admin-1");
      expect(c.caseStatus).toBe(CaseStatus.WAITING_EVIDENCE);
    });

    it("should throw when resolving twice", () => {
      const c = Case.create(validProps);
      c.resolve(Verdict.VALID, null, "admin-1");
      expect(() => c.resolve(Verdict.INVALID, null, "admin-1")).toThrow(
        BusinessRuleViolationError,
      );
    });
  });

  describe("withdraw & escalate", () => {
    it("withdraw -> WITHDRAWN", () => {
      const c = Case.create(validProps);
      c.withdraw();
      expect(c.caseStatus).toBe(CaseStatus.WITHDRAWN);
    });

    it("escalate -> ESCALATED", () => {
      const c = Case.create(validProps);
      c.escalate();
      expect(c.caseStatus).toBe(CaseStatus.ESCALATED);
    });
  });

  describe("evidence & penalties", () => {
    it("addEvidence should append urls", () => {
      const c = Case.create(validProps);
      c.addEvidence(["url-1", "url-2"]);
      expect(c.caseEvidence).toHaveLength(2);
    });

    it("addPenaltyId should dedupe", () => {
      const c = Case.create(validProps);
      c.addPenaltyId("p1");
      c.addPenaltyId("p1");
      c.addPenaltyId("p2");
      expect(c.casePenaltyIds).toEqual(["p1", "p2"]);
    });
  });

  describe("close", () => {
    it("should close a resolved case", () => {
      const c = Case.create(validProps);
      c.resolve(Verdict.VALID, null, "admin-1");
      c.close();
      expect(c.caseStatus).toBe(CaseStatus.CLOSED);
    });

    it("should throw when closing an open case", () => {
      const c = Case.create(validProps);
      expect(() => c.close()).toThrow(BusinessRuleViolationError);
    });
  });
});
