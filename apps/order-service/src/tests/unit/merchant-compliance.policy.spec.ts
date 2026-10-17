import { decideComplianceEscalation } from "../../modules/order/application/merchant-compliance.policy";

const base = {
  total: 100,
  rejected: 0,
  noResponse: 0,
  currentLevel: 0,
  minOrders: 10,
  warnRate: 0.3,
  fineRate: 0.5,
  suspendRate: 0.7,
};

describe("decideComplianceEscalation", () => {
  it("returns null when total is below minOrders", () => {
    expect(decideComplianceEscalation({ ...base, total: 5 })).toBeNull();
  });

  it("escalates to WARNING (level 1) at warn threshold", () => {
    const r = decideComplianceEscalation({ ...base, rejected: 30 });
    expect(r).toEqual({ level: 1, type: "WARNING", badRate: 0.3 });
  });

  it("escalates to FINE (level 2) when already warned and above fine threshold", () => {
    const r = decideComplianceEscalation({
      ...base,
      currentLevel: 1,
      rejected: 50,
    });
    expect(r).toEqual({ level: 2, type: "FINE", badRate: 0.5 });
  });

  it("escalates to SUSPEND (level 3) when already fined and above suspend threshold", () => {
    const r = decideComplianceEscalation({
      ...base,
      currentLevel: 2,
      rejected: 70,
    });
    expect(r).toEqual({ level: 3, type: "SUSPEND", badRate: 0.7 });
  });

  it("only escalates one level at a time (no skipping)", () => {
    const r = decideComplianceEscalation({ ...base, rejected: 90 });
    expect(r?.level).toBe(1);
  });

  it("counts noResponse toward the bad rate", () => {
    const r = decideComplianceEscalation({ ...base, noResponse: 60 });
    expect(r?.level).toBe(1);
    expect(r?.badRate).toBe(0.6);
  });

  it("returns null when already at max level", () => {
    expect(
      decideComplianceEscalation({ ...base, currentLevel: 3, rejected: 100 }),
    ).toBeNull();
  });

  it("returns null when bad rate is below warn threshold", () => {
    expect(decideComplianceEscalation({ ...base, rejected: 10 })).toBeNull();
  });
});
