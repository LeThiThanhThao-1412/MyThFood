import {
  Wallet,
  OwnerType,
} from "../../modules/wallet/domain/wallet.aggregate";
import { WalletCreditedEvent } from "../../modules/wallet/domain/events/wallet-credited.event";
import { WalletDebitedEvent } from "../../modules/wallet/domain/events/wallet-debited.event";

describe("Wallet Aggregate", () => {
  // ===================== create =====================

  describe("create", () => {
    it("should create a wallet with zero balance", () => {
      const result = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      });
      expect(result.isSuccess).toBe(true);
      const wallet = result.value;
      expect(wallet.walletBalance).toBe(0);
      expect(wallet.walletOwnerId).toBe("merchant-1");
      expect(wallet.walletOwnerType).toBe(OwnerType.MERCHANT);
      expect(wallet.walletCurrency).toBe("VND");
    });

    it("should create a wallet for DRIVER", () => {
      const result = Wallet.create({
        ownerId: "driver-1",
        ownerType: OwnerType.DRIVER,
      });
      expect(result.isSuccess).toBe(true);
      const wallet = result.value;
      expect(wallet.walletOwnerId).toBe("driver-1");
      expect(wallet.walletOwnerType).toBe(OwnerType.DRIVER);
    });

    it("should create a wallet with custom currency", () => {
      const result = Wallet.create({
        ownerId: "merchant-2",
        ownerType: OwnerType.MERCHANT,
        currency: "USD",
      });
      expect(result.isSuccess).toBe(true);
      const wallet = result.value;
      expect(wallet.walletCurrency).toBe("USD");
    });

    it("should fail when ownerId is empty", () => {
      const result = Wallet.create({
        ownerId: "",
        ownerType: OwnerType.MERCHANT,
      });
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe("Owner ID is required");
    });

    it("should fail when ownerType is invalid", () => {
      const result = Wallet.create({
        ownerId: "merchant-1",
        ownerType: "INVALID" as OwnerType,
      });
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe("Invalid owner type");
    });

    it("should not emit events on creation", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      }).value;
      expect(wallet.getDomainEvents()).toHaveLength(0);
    });
  });

  // ===================== credit =====================

  describe("credit", () => {
    it("should increase balance when credited", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      }).value;
      wallet.credit(50000, "order-1", "tr_stripe_1");
      expect(wallet.walletBalance).toBe(50000);
    });

    it("should accumulate multiple credits", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      }).value;
      wallet.credit(50000, "order-1", "tr_stripe_1");
      wallet.credit(30000, "order-2", "tr_stripe_2");
      wallet.credit(20000, "order-3", "tr_stripe_3");
      expect(wallet.walletBalance).toBe(100000);
    });

    it("should emit WalletCreditedEvent", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      }).value;
      wallet.credit(50000, "order-1", "tr_stripe_1");
      const events = wallet.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(WalletCreditedEvent);
      const e = events[0] as WalletCreditedEvent;
      expect(e.payload.ownerId).toBe("merchant-1");
      expect(e.payload.amount).toBe(50000);
      expect(e.payload.orderId).toBe("order-1");
      expect(e.payload.stripeTransferId).toBe("tr_stripe_1");
    });

    it("should emit event with correct ownerType", () => {
      const wallet = Wallet.create({
        ownerId: "driver-1",
        ownerType: OwnerType.DRIVER,
      }).value;
      wallet.credit(30000, "order-1", "tr_stripe_1");
      const events = wallet.getDomainEvents();
      expect(events).toHaveLength(1);
      expect((events[0] as WalletCreditedEvent).payload.ownerType).toBe(
        "DRIVER",
      );
    });

    it("should throw when amount is zero", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      }).value;
      expect(() => wallet.credit(0, "order-1", "tr_stripe_1")).toThrow(
        "Credit amount must be positive",
      );
    });

    it("should throw when amount is negative", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      }).value;
      expect(() => wallet.credit(-100, "order-1", "tr_stripe_1")).toThrow(
        "Credit amount must be positive",
      );
    });
  });

  // ===================== debit =====================

  describe("debit", () => {
    it("should decrease balance when debited", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      }).value;
      wallet.credit(100000, "order-1", "tr_stripe_1");
      wallet.debit(30000, "payout_1");
      expect(wallet.walletBalance).toBe(70000);
    });

    it("should emit WalletDebitedEvent", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      }).value;
      wallet.credit(100000, "order-1", "tr_stripe_1");
      wallet.debit(30000, "payout_1");
      const events = wallet.getDomainEvents();
      // 2 events: credited + debited
      expect(events).toHaveLength(2);
      expect(events[1]).toBeInstanceOf(WalletDebitedEvent);
      const e = events[1] as WalletDebitedEvent;
      expect(e.payload.ownerId).toBe("merchant-1");
      expect(e.payload.amount).toBe(30000);
      expect(e.payload.stripePayoutId).toBe("payout_1");
    });

    it("should allow debiting entire balance", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      }).value;
      wallet.credit(50000, "order-1", "tr_stripe_1");
      wallet.debit(50000, "payout_1");
      expect(wallet.walletBalance).toBe(0);
    });

    it("should throw when amount is zero", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      }).value;
      wallet.credit(50000, "order-1", "tr_stripe_1");
      expect(() => wallet.debit(0, "payout_1")).toThrow(
        "Debit amount must be positive",
      );
    });

    it("should throw when amount is negative", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      }).value;
      wallet.credit(50000, "order-1", "tr_stripe_1");
      expect(() => wallet.debit(-100, "payout_1")).toThrow(
        "Debit amount must be positive",
      );
    });

    it("should throw when insufficient balance", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      }).value;
      wallet.credit(10000, "order-1", "tr_stripe_1");
      expect(() => wallet.debit(20000, "payout_1")).toThrow(
        "Insufficient balance: requested 20000, available 10000",
      );
    });

    it("should throw when debiting from empty wallet", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      }).value;
      expect(() => wallet.debit(1000, "payout_1")).toThrow(
        "Insufficient balance: requested 1000, available 0",
      );
    });
  });

  // ===================== full credit/debit cycle =====================

  describe("full cycle", () => {
    it("should handle multiple credits and debits correctly", () => {
      const wallet = Wallet.create({
        ownerId: "driver-1",
        ownerType: OwnerType.DRIVER,
      }).value;
      wallet.credit(20000, "order-1", "tr_1");
      wallet.credit(30000, "order-2", "tr_2");
      wallet.credit(25000, "order-3", "tr_3");
      expect(wallet.walletBalance).toBe(75000);
      wallet.debit(50000, "payout_1");
      expect(wallet.walletBalance).toBe(25000);
      wallet.credit(35000, "order-4", "tr_4");
      expect(wallet.walletBalance).toBe(60000);
      wallet.debit(60000, "payout_2");
      expect(wallet.walletBalance).toBe(0);
    });

    it("should track events across the full cycle", () => {
      const wallet = Wallet.create({
        ownerId: "merchant-1",
        ownerType: OwnerType.MERCHANT,
      }).value;
      wallet.credit(50000, "order-1", "tr_1");
      wallet.credit(30000, "order-2", "tr_2");
      wallet.debit(20000, "payout_1");
      const events = wallet.getDomainEvents();
      expect(events).toHaveLength(3);
      expect(events[0]).toBeInstanceOf(WalletCreditedEvent);
      expect(events[1]).toBeInstanceOf(WalletCreditedEvent);
      expect(events[2]).toBeInstanceOf(WalletDebitedEvent);
    });
  });

  // ===================== rehydrate =====================

  describe("rehydrate", () => {
    it("should rehydrate without emitting events", () => {
      const wallet = Wallet.rehydrate(
        { equals: () => false, toString: () => "wallet-id-1" } as any,
        {
          ownerId: "merchant-1",
          ownerType: OwnerType.MERCHANT,
          balance: 100000,
          currency: "VND",
        },
      );
      expect(wallet.getDomainEvents()).toHaveLength(0);
      expect(wallet.walletOwnerId).toBe("merchant-1");
      expect(wallet.walletOwnerType).toBe(OwnerType.MERCHANT);
      expect(wallet.walletBalance).toBe(100000);
      expect(wallet.walletCurrency).toBe("VND");
    });
  });
});
