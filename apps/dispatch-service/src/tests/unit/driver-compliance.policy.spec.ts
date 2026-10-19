import { decideDriverComplianceEscalation } from "../../modules/dispatch/application/driver-compliance.policy";

const base = {
  total: 100,
  declined: 0,
  noResponse: 0,
  currentLevel: 0,
  minOffers: 10,
  warnRate: 0.3,
  fineRate: 0.5,
  suspendRate: 0.7,
};

describe("decideDriverComplianceEscalation", () => {
  it("returns null when total offers is below minOffers", () => {
    expect(decideDriverComplianceEscalation({ ...base, total: 5 })).toBeNull();
  });

  it("opens WARNING (level 1) at warn threshold", () => {
    const result = decideDriverComplianceEscalation({
      ...base,
      declined: 30,
    });
    expect(result).toEqual({ level: 1, type: "WARNING", badRate: 0.3 });
  });

  it("opens FINE (level 2) when already warned and above fine threshold", () => {
    const result = decideDriverComplianceEscalation({
      ...base,
      currentLevel: 1,
      declined: 50,
    });
    expect(result).toEqual({ level: 2, type: "FINE", badRate: 0.5 });
  });

  it("opens SUSPEND (level 3) when already fined and above suspend threshold", () => {
    const result = decideDriverComplianceEscalation({
      ...base,
      currentLevel: 2,
      declined: 70,
    });
    expect(result).toEqual({ level: 3, type: "SUSPEND", badRate: 0.7 });
  });

  it("only escalates one level at a time (no skipping)", () => {
    const result = decideDriverComplianceEscalation({
      ...base,
      declined: 90,
    });
    expect(result?.level).toBe(1);
  });

  it("counts no-response toward the bad rate", () => {
    const result = decideDriverComplianceEscalation({
      ...base,
      noResponse: 60,
    });
    expect(result?.level).toBe(1);
    expect(result?.badRate).toBe(0.6);
  });

  it("returns null when already at max level", () => {
    expect(
      decideDriverComplianceEscalation({
        ...base,
        currentLevel: 3,
        declined: 100,
      }),
    ).toBeNull();
  });

  it("returns null when bad rate is below warn threshold", () => {
    expect(
      decideDriverComplianceEscalation({ ...base, declined: 10 }),
    ).toBeNull();
  });
});
