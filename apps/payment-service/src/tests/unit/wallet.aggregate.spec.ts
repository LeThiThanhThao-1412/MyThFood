import {
  Wallet,
  OwnerType,
} from "../../modules/wallet/domain/wallet.aggregate";
// FIX #11: Wallet events consolidated into wallet-service. Legacy events removed.

describe("Wallet Aggregate", () => {
  // ===================== create =====================

  describe("create", () => {
    it("should create a wallet with zero balance", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      });
      expect(wallet.walletBalance).toBe(0);
      expect(wallet.walletOwnerId).toBe("merchant-1");
      expect(wallet.walletOwnerType).toBe(OwnerType.MERCHANT);
      expect(wallet.walletCurrency).toBe("VND");
    });

    it("should create a wallet for DRIVER", () => {
      const wallet = Wallet.create({
        ownerId: "driver-1",
        ownerType: OwnerType.DRIVER,
      });
      expect(wallet.walletOwnerId).toBe("driver-1");
      expect(wallet.walletOwnerType).toBe(OwnerType.DRIVER);
    });

    it("should create a wallet with custom currency", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-2",
        ownerType: OwnerType.MERCHANT,
        currency: "USD",
      });
      expect(wallet.walletCurrency).toBe("USD");
    });
  });

  // ===================== credit =====================

  describe("credit", () => {
    it("should increase balance when credited", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      });
      wallet.credit(50000);
      expect(wallet.walletBalance).toBe(50000);
    });

    it("should accumulate multiple credits", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      });
      wallet.credit(50000);
      wallet.credit(30000);
      wallet.credit(20000);
      expect(wallet.walletBalance).toBe(100000);
    });

    it("should throw when amount is zero", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      });
      expect(() => wallet.credit(0)).toThrow("Credit amount must be positive");
    });

    it("should throw when amount is negative", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      });
      expect(() => wallet.credit(-100)).toThrow("Credit amount must be positive");
    });
  });

  // ===================== debit =====================

  describe("debit", () => {
    it("should decrease balance when debited", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      });
      wallet.credit(100000);
      wallet.debit(30000);
      expect(wallet.walletBalance).toBe(70000);
    });

    it("should allow debiting entire balance", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      });
      wallet.credit(50000);
      wallet.debit(50000);
      expect(wallet.walletBalance).toBe(0);
    });

    it("should throw when amount is zero", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      });
      wallet.credit(50000);
      expect(() => wallet.debit(0)).toThrow("Debit amount must be positive");
    });

    it("should throw when amount is negative", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      });
      wallet.credit(50000);
      expect(() => wallet.debit(-100)).toThrow("Debit amount must be positive");
    });

    it("should throw when insufficient balance", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      });
      wallet.credit(10000);
      expect(() => wallet.debit(20000)).toThrow("Insufficient balance");
    });

    it("should throw when debiting from empty wallet", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      });
      expect(() => wallet.debit(1000)).toThrow("Insufficient balance");
    });
  });

  // ===================== full credit/debit cycle =====================

  describe("full cycle", () => {
    it("should handle multiple credits and debits correctly", () => {
      const wallet = Wallet.create({
        ownerId: "driver-1",
        ownerType: OwnerType.DRIVER,
      });
      wallet.credit(20000);
      wallet.credit(30000);
      wallet.credit(25000);
      expect(wallet.walletBalance).toBe(75000);
      wallet.debit(50000);
      expect(wallet.walletBalance).toBe(25000);
      wallet.credit(35000);
      expect(wallet.walletBalance).toBe(60000);
      wallet.debit(60000);
      expect(wallet.walletBalance).toBe(0);
    });
  });
});