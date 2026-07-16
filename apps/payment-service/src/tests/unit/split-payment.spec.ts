import {
  calculateSplitFromEnv,
  SplitPercentages,
} from "../../modules/payment/application/split-payment.service";

describe("Split Payment - calculateSplitFromEnv", () => {
  // Save original env variables
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear env variables before each test
    delete process.env.PAYMENT_SPLIT_MERCHANT_PERCENT;
    delete process.env.PAYMENT_SPLIT_DRIVER_PERCENT;
    delete process.env.PAYMENT_SPLIT_PLATFORM_PERCENT;
  });

  afterAll(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  // ===================== Default split (no env vars) =====================

  describe("default split", () => {
    it("should return 70/20/10 as default split", () => {
      const split = calculateSplitFromEnv();

      expect(split.merchantPercent).toBe(70);
      expect(split.driverPercent).toBe(20);
      expect(split.platformPercent).toBe(10);
      expect(
        split.merchantPercent + split.driverPercent + split.platformPercent,
      ).toBe(100);
    });
  });

  // ===================== Custom env vars =====================

  describe("custom split", () => {
    it("should use custom environment values", () => {
      process.env.PAYMENT_SPLIT_MERCHANT_PERCENT = "80";
      process.env.PAYMENT_SPLIT_DRIVER_PERCENT = "15";
      process.env.PAYMENT_SPLIT_PLATFORM_PERCENT = "5";

      const split = calculateSplitFromEnv();

      expect(split.merchantPercent).toBe(80);
      expect(split.driverPercent).toBe(15);
      expect(split.platformPercent).toBe(5);
    });

    it("should use custom split 75/15/10", () => {
      process.env.PAYMENT_SPLIT_MERCHANT_PERCENT = "75";
      process.env.PAYMENT_SPLIT_DRIVER_PERCENT = "15";
      process.env.PAYMENT_SPLIT_PLATFORM_PERCENT = "10";

      const split = calculateSplitFromEnv();

      expect(split.merchantPercent).toBe(75);
      expect(split.driverPercent).toBe(15);
      expect(split.platformPercent).toBe(10);
    });

    it("should use custom split 60/30/10", () => {
      process.env.PAYMENT_SPLIT_MERCHANT_PERCENT = "60";
      process.env.PAYMENT_SPLIT_DRIVER_PERCENT = "30";
      process.env.PAYMENT_SPLIT_PLATFORM_PERCENT = "10";

      const split = calculateSplitFromEnv();

      expect(split.merchantPercent).toBe(60);
      expect(split.driverPercent).toBe(30);
      expect(split.platformPercent).toBe(10);
    });
  });

  // ===================== Invalid splits (fallback to default) =====================

  describe("fallback to default when invalid", () => {
    it("should fallback when percentages don't sum to 100", () => {
      process.env.PAYMENT_SPLIT_MERCHANT_PERCENT = "50";
      process.env.PAYMENT_SPLIT_DRIVER_PERCENT = "30";
      process.env.PAYMENT_SPLIT_PLATFORM_PERCENT = "10"; // sum = 90

      const logger = { warn: jest.fn() };
      const split = calculateSplitFromEnv(logger);

      expect(split.merchantPercent).toBe(70);
      expect(split.driverPercent).toBe(20);
      expect(split.platformPercent).toBe(10);
      expect(logger.warn).toHaveBeenCalled();
    });

    it("should fallback when sum exceeds 100", () => {
      process.env.PAYMENT_SPLIT_MERCHANT_PERCENT = "60";
      process.env.PAYMENT_SPLIT_DRIVER_PERCENT = "40";
      process.env.PAYMENT_SPLIT_PLATFORM_PERCENT = "30"; // sum = 130

      const split = calculateSplitFromEnv();

      expect(split.merchantPercent).toBe(70);
      expect(split.driverPercent).toBe(20);
      expect(split.platformPercent).toBe(10);
    });
  });

  // ===================== Split calculation with real amounts =====================

  describe("split amount calculation", () => {
    it("should calculate correct merchant/driver/platform amounts for 100K order", () => {
      const totalAmount = 100000;
      const split = calculateSplitFromEnv();
      const stripeFee = Math.round(totalAmount * 0.035); // 3500
      const netAmount = totalAmount - stripeFee; // 96500
      const merchantAmount = Math.round(
        netAmount * (split.merchantPercent / 100),
      ); // ~67550
      const driverAmount = Math.round(netAmount * (split.driverPercent / 100)); // ~19300
      const platformAmount = netAmount - merchantAmount - driverAmount;

      expect(split.merchantPercent).toBe(70);
      expect(split.driverPercent).toBe(20);
      expect(split.platformPercent).toBe(10);
      expect(stripeFee).toBe(3500);
      expect(netAmount).toBe(96500);
      expect(merchantAmount).toBe(67550);
      expect(driverAmount).toBe(19300);
      expect(platformAmount).toBe(9650);
      expect(merchantAmount + driverAmount + platformAmount).toBe(netAmount);
    });

    it("should calculate correct amounts for 500K order with custom split 80/15/5", () => {
      process.env.PAYMENT_SPLIT_MERCHANT_PERCENT = "80";
      process.env.PAYMENT_SPLIT_DRIVER_PERCENT = "15";
      process.env.PAYMENT_SPLIT_PLATFORM_PERCENT = "5";

      const totalAmount = 500000;
      const split = calculateSplitFromEnv();
      const stripeFee = Math.round(totalAmount * 0.035); // 17500
      const netAmount = totalAmount - stripeFee; // 482500
      const merchantAmount = Math.round(netAmount * 0.8); // 386000
      const driverAmount = Math.round(netAmount * 0.15); // 72375
      const platformAmount = netAmount - merchantAmount - driverAmount;

      expect(split.merchantPercent).toBe(80);
      expect(split.driverPercent).toBe(15);
      expect(split.platformPercent).toBe(5);
      expect(netAmount).toBe(482500);
      expect(merchantAmount).toBe(386000);
      expect(driverAmount).toBe(72375);
      expect(platformAmount).toBe(24125);
    });

    it("should allocate remainder to platform when rounding causes discrepancy", () => {
      process.env.PAYMENT_SPLIT_MERCHANT_PERCENT = "50";
      process.env.PAYMENT_SPLIT_DRIVER_PERCENT = "40";
      process.env.PAYMENT_SPLIT_PLATFORM_PERCENT = "10";

      const totalAmount = 100000;
      const split = calculateSplitFromEnv();
      const stripeFee = Math.round(totalAmount * 0.035);
      const netAmount = totalAmount - stripeFee;
      const merchantAmount = Math.round(
        netAmount * (split.merchantPercent / 100),
      );
      const driverAmount = Math.round(netAmount * (split.driverPercent / 100));
      const platformAmount = netAmount - merchantAmount - driverAmount;

      expect(merchantAmount + driverAmount + platformAmount).toBe(netAmount);
    });
  });
});
