import {
  Payment,
  PaymentMethod,
  PaymentStatus,
} from "../../modules/payment/domain/payment.aggregate";

describe("Payment adjustment (order item change)", () => {
  const props = {
    orderId: "order-adjust-1",
    consumerId: "consumer-1",
    merchantId: "merchant-1",
    amount: 25000,
    paymentMethod: PaymentMethod.CREDIT_CARD,
    adjustmentRequestId: "change-request-1",
  };

  it("persists adjustmentRequestId on create", () => {
    const payment = Payment.create(props).value;
    expect(payment.paymentAdjustmentRequestId).toBe("change-request-1");
    expect(payment.paymentStatus).toBe(PaymentStatus.PENDING);
  });

  it("completes a HELD adjustment payment (Stripe captured automatically)", () => {
    const payment = Payment.create(props).value;
    payment.hold("pi_adjust_1");
    expect(payment.paymentStatus).toBe(PaymentStatus.HELD);

    payment.completeAdjustment("pi_adjust_1");
    expect(payment.paymentStatus).toBe(PaymentStatus.COMPLETED);
    expect(payment.paymentTransactionId).toBe("pi_adjust_1");
  });

  it("rejects completing an adjustment twice", () => {
    const payment = Payment.create(props).value;
    payment.hold("pi_adjust_2");
    payment.completeAdjustment("pi_adjust_2");
    expect(() => payment.completeAdjustment("pi_adjust_2")).toThrow(
      /Cannot complete adjustment payment/,
    );
  });
});
