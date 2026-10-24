import {
  DRIVER_SAMPLING_PROFILES,
  distanceMeters,
  isValidFix,
  shouldSendFix,
  type GeoFix,
} from "./location-sampling";

const HCM: GeoFix = { latitude: 10.7769, longitude: 106.7009, accuracy: 10 };
/** Cách HCM ~111m về phía bắc (0.001 độ vĩ ≈ 111m). */
const NEARBY: GeoFix = { latitude: 10.7779, longitude: 106.7009, accuracy: 10 };

describe("distanceMeters", () => {
  it("should return 0 for the same coordinate", () => {
    expect(distanceMeters(HCM, { ...HCM })).toBe(0);
  });

  it("should measure ~111m for 0.001 degree of latitude", () => {
    expect(distanceMeters(HCM, NEARBY)).toBeGreaterThan(105);
    expect(distanceMeters(HCM, NEARBY)).toBeLessThan(115);
  });

  it("should be symmetric", () => {
    expect(distanceMeters(HCM, NEARBY)).toBeCloseTo(
      distanceMeters(NEARBY, HCM),
      6,
    );
  });
});

describe("isValidFix", () => {
  it("should reject null/undefined and non-finite values", () => {
    expect(isValidFix(null)).toBe(false);
    expect(isValidFix({ latitude: Number.NaN, longitude: 106.7 })).toBe(false);
    expect(
      isValidFix({ latitude: 10.7, longitude: Number.POSITIVE_INFINITY }),
    ).toBe(false);
  });

  it("should reject out-of-range and (0,0) coordinates", () => {
    expect(isValidFix({ latitude: 91, longitude: 106.7 })).toBe(false);
    expect(isValidFix({ latitude: 10.7, longitude: 181 })).toBe(false);
    expect(isValidFix({ latitude: 0, longitude: 0 })).toBe(false);
  });

  it("should accept a normal coordinate", () => {
    expect(isValidFix(HCM)).toBe(true);
  });
});

describe("shouldSendFix", () => {
  const profile = DRIVER_SAMPLING_PROFILES.idle;
  const emptyState = { lastSentAt: null, lastSentFix: null };

  it("should send the very first fix immediately (online heartbeat)", () => {
    expect(shouldSendFix(emptyState, HCM, profile, 1_000)).toBe(true);
  });

  it("should drop fixes with poor accuracy", () => {
    expect(
      shouldSendFix(
        emptyState,
        { ...HCM, accuracy: (profile.maxAccuracyM ?? 100) + 1 },
        profile,
        1_000,
      ),
    ).toBe(false);
  });

  it("should keep a fix when accuracy is unknown", () => {
    expect(
      shouldSendFix(emptyState, { ...HCM, accuracy: null }, profile, 1_000),
    ).toBe(true);
  });

  it("should skip when the interval has not elapsed", () => {
    const state = { lastSentAt: 10_000, lastSentFix: HCM };
    expect(
      shouldSendFix(state, NEARBY, profile, 10_000 + profile.minIntervalMs - 1),
    ).toBe(false);
  });

  it("should skip when the driver has not moved enough", () => {
    const state = { lastSentAt: 10_000, lastSentFix: HCM };
    const movedLess = {
      ...HCM,
      latitude: HCM.latitude + 0.0001, // ~11m
    };
    expect(
      shouldSendFix(state, movedLess, profile, 10_000 + profile.minIntervalMs),
    ).toBe(false);
  });

  it("should send when the interval elapsed AND the driver moved enough", () => {
    const state = { lastSentAt: 10_000, lastSentFix: HCM };
    expect(
      shouldSendFix(state, NEARBY, profile, 10_000 + profile.minIntervalMs),
    ).toBe(true);
  });

  it("should send a heartbeat even when the driver is standing still", () => {
    const state = { lastSentAt: 10_000, lastSentFix: HCM };
    expect(
      shouldSendFix(state, HCM, profile, 10_000 + profile.maxSilenceMs),
    ).toBe(true);
  });

  it("should use a denser profile while delivering", () => {
    const delivering = DRIVER_SAMPLING_PROFILES.delivering;
    expect(delivering.minIntervalMs).toBeLessThan(profile.minIntervalMs);
    expect(delivering.minDistanceM).toBeLessThan(profile.minDistanceM);
    expect(delivering.maxSilenceMs).toBeLessThan(profile.maxSilenceMs);
  });
});
