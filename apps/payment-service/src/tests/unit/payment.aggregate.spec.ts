import {
  Payment,
  PaymentStatus,
  PaymentMethod,
} from "../../modules/payment/domain/payment.aggregate";
import { PaymentCreatedEvent } from "../../modules/payment/domain/events/payment-created.event";
import { PaymentCompletedEvent } from "../../modules/payment/domain/events/payment-completed.event";
import { PaymentFailedEvent } from "../../modules/payment/domain/events/payment-failed.event";
import { PaymentRefundedEvent } from "../../modules/payment/domain/events/payment-refunded.event";

describe("Payment Aggregate", () => {
  const validPaymentProps = {
    orderId: "order-123",
    consumerId: "consumer-123",
    merchantId: "merchant-123",
    amount: 150000,
    paymentMethod: PaymentMethod.CREDIT_CARD,
  };

  /** Helper to check last domain event type and payload */
  function getLastEvent(payment: Payment) {
    const events = payment.getDomainEvents();
    return events[events.length - 1];
  }

  // ===================== create =====================

  describe("create", () => {
    it("should create a payment with PENDING status", () => {
      const result = Payment.create(validPaymentProps);
      expect(result.isSuccess).toBe(true);
      const payment = result.value;
      expect(payment.paymentStatus).toBe(PaymentStatus.PENDING);
      expect(payment.paymentOrderId).toBe("order-123");
      expect(payment.paymentConsumerId).toBe("consumer-123");
      expect(payment.paymentMerchantId).toBe("merchant-123");
      expect(payment.paymentAmount).toBe(150000);
      expect(payment.paymentMethodType).toBe(PaymentMethod.CREDIT_CARD);
    });

    it("should emit PaymentCreatedEvent on create", () => {
      const result = Payment.create(validPaymentProps);
      expect(result.isSuccess).toBe(true);
      const payment = result.value;
      const events = payment.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(PaymentCreatedEvent);
      const e = events[0] as PaymentCreatedEvent;
      expect(e.payload.orderId).toBe("order-123");
      expect(e.payload.amount).toBe(150000);
    });

    it("should have null driverId, stripe IDs, and transactionId on creation", () => {
      const result = Payment.create(validPaymentProps);
      expect(result.isSuccess).toBe(true);
      const payment = result.value;
      expect(payment.paymentDriverId).toBeNull();
      expect(payment.paymentStripePaymentIntentId).toBeNull();
      expect(payment.paymentStripeTransferMerchantId).toBeNull();
      expect(payment.paymentStripeTransferDriverId).toBeNull();
      expect(payment.paymentTransactionId).toBeNull();
      expect(payment.paymentFailureReason).toBeNull();
      expect(payment.paymentRefundReason).toBeNull();
      expect(payment.paymentRefundedAmount).toBeNull();
    });

    it("should fail when orderId is empty", () => {
      const result = Payment.create({ ...validPaymentProps, orderId: "" });
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe("Order ID is required");
    });

    it("should fail when consumerId is empty", () => {
      const result = Payment.create({ ...validPaymentProps, consumerId: "" });
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe("Consumer ID is required");
    });

    it("should fail when merchantId is empty", () => {
      const result = Payment.create({ ...validPaymentProps, merchantId: "" });
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe("Merchant ID is required");
    });

    it("should fail when amount is zero", () => {
      const result = Payment.create({ ...validPaymentProps, amount: 0 });
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe("Amount must be positive");
    });

    it("should fail when amount is negative", () => {
      const result = Payment.create({ ...validPaymentProps, amount: -100 });
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe("Amount must be positive");
    });

    it("should support all payment methods", () => {
      const methods = [
        PaymentMethod.CREDIT_CARD,
        PaymentMethod.DEBIT_CARD,
        PaymentMethod.BANK_TRANSFER,
        PaymentMethod.E_WALLET,
        PaymentMethod.CASH,
      ];
      methods.forEach((method) => {
        const result = Payment.create({
          ...validPaymentProps,
          paymentMethod: method,
        });
        expect(result.isSuccess).toBe(true);
        expect(result.value.paymentMethodType).toBe(method);
      });
    });
  });

  // ===================== assignDriver =====================

  describe("assignDriver", () => {
    it("should assign a driver to the payment", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.assignDriver("driver-456");
      expect(payment.paymentDriverId).toBe("driver-456");
    });

    it("should throw when driverId is empty", () => {
      const payment = Payment.create(validPaymentProps).value;
      expect(() => payment.assignDriver("")).toThrow("Driver ID is required");
    });
  });

  // ===================== hold (Stripe PaymentIntent) =====================

  describe("hold", () => {
    it("should hold a PENDING payment with Stripe PaymentIntent ID", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.hold("pi_test_123");
      expect(payment.paymentStatus).toBe(PaymentStatus.HELD);
      expect(payment.paymentStripePaymentIntentId).toBe("pi_test_123");
      expect(payment.isHeld()).toBe(true);
    });

    it("should throw when not in PENDING status", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.hold("pi_test_123");
      expect(() => payment.hold("pi_test_456")).toThrow(
        "Cannot hold payment in status HELD",
      );
    });

    it("should throw when Stripe PaymentIntent ID is empty", () => {
      const payment = Payment.create(validPaymentProps).value;
      expect(() => payment.hold("")).toThrow(
        "Stripe PaymentIntent ID is required",
      );
    });
  });

  // ===================== complete (non-Stripe) =====================

  describe("complete", () => {
    it("should complete a PENDING payment with transaction ID", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.complete("txn-789");
      expect(payment.paymentStatus).toBe(PaymentStatus.COMPLETED);
      expect(payment.paymentTransactionId).toBe("txn-789");
      expect(payment.isCompleted()).toBe(true);
    });

    it("should emit PaymentCompletedEvent after create", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.complete("txn-789");
      const events = payment.getDomainEvents();
      // create event + complete event = 2
      expect(events).toHaveLength(2);
      expect(events[1]).toBeInstanceOf(PaymentCompletedEvent);
      const e = events[1] as PaymentCompletedEvent;
      expect(e.payload.orderId).toBe("order-123");
      expect(e.payload.transactionId).toBe("txn-789");
    });

    it("should throw when not in PENDING status", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.hold("pi_test_123");
      expect(() => payment.complete("txn-789")).toThrow(
        "Cannot complete payment in status HELD",
      );
    });

    it("should throw when transaction ID is empty", () => {
      const payment = Payment.create(validPaymentProps).value;
      expect(() => payment.complete("")).toThrow("Transaction ID is required");
    });
  });

  // ===================== splitAndComplete (Stripe flow) =====================

  describe("splitAndComplete", () => {
    it("should complete from HELD with transfer IDs", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.hold("pi_test_123");
      payment.splitAndComplete("tr_merchant_1", "tr_driver_1");
      expect(payment.paymentStatus).toBe(PaymentStatus.COMPLETED);
      expect(payment.paymentStripeTransferMerchantId).toBe("tr_merchant_1");
      expect(payment.paymentStripeTransferDriverId).toBe("tr_driver_1");
      expect(payment.paymentTransactionId).toBe("pi_test_123");
      expect(payment.isCompleted()).toBe(true);
    });

    it("should emit PaymentCompletedEvent after create + hold", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.hold("pi_test_123");
      payment.splitAndComplete("tr_merchant_1", "tr_driver_1");
      const events = payment.getDomainEvents();
      // create + completed = 2
      expect(events).toHaveLength(2);
      expect(events[1]).toBeInstanceOf(PaymentCompletedEvent);
    });

    it("should throw when not in HELD status", () => {
      const payment = Payment.create(validPaymentProps).value;
      expect(() =>
        payment.splitAndComplete("tr_merchant_1", "tr_driver_1"),
      ).toThrow("Cannot complete payment in status PENDING");
    });
  });

  // ===================== fail =====================

  describe("fail", () => {
    it("should fail a PENDING payment", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.fail("Insufficient funds");
      expect(payment.paymentStatus).toBe(PaymentStatus.FAILED);
      expect(payment.paymentFailureReason).toBe("Insufficient funds");
      expect(payment.isFailed()).toBe(true);
    });

    it("should fail a HELD payment", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.hold("pi_test_123");
      payment.fail("Authorization expired");
      expect(payment.paymentStatus).toBe(PaymentStatus.FAILED);
      expect(payment.paymentFailureReason).toBe("Authorization expired");
    });

    it("should emit PaymentFailedEvent after create", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.fail("Card declined");
      const events = payment.getDomainEvents();
      // create + failed = 2
      expect(events).toHaveLength(2);
      expect(events[1]).toBeInstanceOf(PaymentFailedEvent);
      expect((events[1] as PaymentFailedEvent).payload.reason).toBe(
        "Card declined",
      );
    });

    it("should throw when not in PENDING or HELD", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.complete("txn-789");
      expect(() => payment.fail("reason")).toThrow(
        "Cannot fail payment in status COMPLETED",
      );
    });

    it("should throw when not in PENDING or HELD (REFUNDED)", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.complete("txn-789");
      payment.refund("Customer request");
      expect(() => payment.fail("reason")).toThrow(
        "Cannot fail payment in status REFUNDED",
      );
    });

    it("should throw when reason is empty", () => {
      const payment = Payment.create(validPaymentProps).value;
      expect(() => payment.fail("")).toThrow("Failure reason is required");
    });
  });

  // ===================== refund =====================

  describe("refund", () => {
    it("should refund a COMPLETED payment", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.complete("txn-789");
      payment.refund("Customer requested refund");
      expect(payment.paymentStatus).toBe(PaymentStatus.REFUNDED);
      expect(payment.paymentRefundReason).toBe("Customer requested refund");
      expect(payment.paymentRefundedAmount).toBe(150000);
      expect(payment.isRefunded()).toBe(true);
    });

    it("should refund a HELD payment", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.hold("pi_test_123");
      payment.refund("Order cancelled");
      expect(payment.paymentStatus).toBe(PaymentStatus.REFUNDED);
      expect(payment.paymentRefundReason).toBe("Order cancelled");
    });

    it("should emit PaymentRefundedEvent after create + complete", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.complete("txn-789");
      payment.refund("Customer request");
      const events = payment.getDomainEvents();
      // create + completed + refunded = 3
      expect(events).toHaveLength(3);
      expect(events[2]).toBeInstanceOf(PaymentRefundedEvent);
      const e = events[2] as PaymentRefundedEvent;
      expect(e.payload.reason).toBe("Customer request");
      expect(e.payload.refundedAmount).toBe(150000);
    });

    it("should throw when payment is PENDING", () => {
      const payment = Payment.create(validPaymentProps).value;
      expect(() => payment.refund("reason")).toThrow(
        "Cannot refund payment in status PENDING",
      );
    });

    it("should throw when payment is FAILED", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.fail("Card error");
      expect(() => payment.refund("reason")).toThrow(
        "Cannot refund payment in status FAILED",
      );
    });

    it("should throw when payment is already REFUNDED", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.complete("txn-789");
      payment.refund("First refund");
      expect(() => payment.refund("Second refund")).toThrow(
        "Cannot refund payment in status REFUNDED",
      );
    });

    it("should throw when reason is empty", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.complete("txn-789");
      expect(() => payment.refund("")).toThrow("Refund reason is required");
    });
  });

  // ===================== Queries =====================

  describe("queries", () => {
    it("should report isPending correctly", () => {
      const payment = Payment.create(validPaymentProps).value;
      expect(payment.isPending()).toBe(true);
      expect(payment.isCompleted()).toBe(false);
      expect(payment.isFailed()).toBe(false);
      expect(payment.isRefunded()).toBe(false);
      expect(payment.isHeld()).toBe(false);
    });

    it("should report canBeRefunded correctly", () => {
      const payment = Payment.create(validPaymentProps).value;
      expect(payment.canBeRefunded()).toBe(false); // PENDING
      payment.hold("pi_123");
      expect(payment.canBeRefunded()).toBe(true); // HELD
      payment.splitAndComplete("tr_m", "tr_d");
      expect(payment.canBeRefunded()).toBe(true); // COMPLETED
      payment.refund("reason");
      expect(payment.canBeRefunded()).toBe(false); // REFUNDED
    });
  });

  // ===================== rehydrate =====================

  describe("rehydrate", () => {
    it("should rehydrate without emitting events", () => {
      const payment = Payment.rehydrate(
        { equals: () => false, toString: () => "id-1" } as any,
        {
          orderId: "order-1",
          consumerId: "consumer-1",
          merchantId: "merchant-1",
          driverId: null,
          amount: 100000,
          paymentMethod: PaymentMethod.CASH,
          status: PaymentStatus.COMPLETED,
          stripePaymentIntentId: null,
          stripeTransferMerchantId: null,
          stripeTransferDriverId: null,
          transactionId: "txn-1",
          failureReason: null,
          refundReason: null,
          refundedAmount: null,
        },
      );
      expect(payment.getDomainEvents()).toHaveLength(0);
      expect(payment.paymentStatus).toBe(PaymentStatus.COMPLETED);
      expect(payment.paymentOrderId).toBe("order-1");
      expect(payment.paymentAmount).toBe(100000);
      expect(payment.paymentMethodType).toBe(PaymentMethod.CASH);
    });
  });

  // ===================== Full lifecycle =====================

  describe("lifecycle - full flow", () => {
    it("PENDING -> HELD -> COMPLETED (Stripe flow)", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.hold("pi_full_flow");
      expect(payment.paymentStatus).toBe(PaymentStatus.HELD);
      payment.splitAndComplete("tr_m", "tr_d");
      expect(payment.paymentStatus).toBe(PaymentStatus.COMPLETED);
    });

    it("PENDING -> COMPLETED (CASH flow)", () => {
      const payment = Payment.create({
        ...validPaymentProps,
        paymentMethod: PaymentMethod.CASH,
      }).value;
      payment.complete("txn-cash-1");
      expect(payment.paymentStatus).toBe(PaymentStatus.COMPLETED);
    });

    it("PENDING -> FAILED", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.fail("Card declined");
      expect(payment.paymentStatus).toBe(PaymentStatus.FAILED);
    });

    it("PENDING -> HELD -> FAILED", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.hold("pi_123");
      payment.fail("Fraud detected");
      expect(payment.paymentStatus).toBe(PaymentStatus.FAILED);
    });

    it("PENDING -> HELD -> COMPLETED -> REFUNDED", () => {
      const payment = Payment.create(validPaymentProps).value;
      payment.hold("pi_123");
      payment.splitAndComplete("tr_m", "tr_d");
      payment.refund("Customer unhappy");
      expect(payment.paymentStatus).toBe(PaymentStatus.REFUNDED);
      expect(payment.paymentRefundedAmount).toBe(150000);
    });
  });
});
