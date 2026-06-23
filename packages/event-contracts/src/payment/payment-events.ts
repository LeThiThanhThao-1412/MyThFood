export const PAYMENT_CREATED = "com.mythfood.payment.created";
export const PAYMENT_COMPLETED = "com.mythfood.payment.completed";
export const PAYMENT_FAILED = "com.mythfood.payment.failed";
export const PAYMENT_REFUNDED = "com.mythfood.payment.refunded";

export interface PaymentCreatedPayload {
  paymentId: string;
  orderId: string;
  consumerId: string;
  merchantId: string;
  amount: number;
  paymentMethod: string;
  createdAt: Date;
}

export interface PaymentCompletedPayload {
  paymentId: string;
  orderId: string;
  transactionId: string;
  completedAt: Date;
}

export interface PaymentFailedPayload {
  paymentId: string;
  orderId: string;
  reason: string;
  failedAt: Date;
}

export interface PaymentRefundedPayload {
  paymentId: string;
  orderId: string;
  reason: string;
  refundedAmount: number;
  refundedAt: Date;
}
