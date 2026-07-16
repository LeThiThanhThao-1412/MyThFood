export const PAYMENT_CREATED = "com.mythfood.payment.created";
export const PAYMENT_COMPLETED = "com.mythfood.payment.completed";
export const PAYMENT_FAILED = "com.mythfood.payment.failed";
export const PAYMENT_REFUNDED = "com.mythfood.payment.refunded";
export const PAYMENT_HELD = "com.mythfood.payment.held";

export const WALLET_CREDITED = "com.mythfood.wallet.credited";
export const WALLET_DEBITED = "com.mythfood.wallet.debited";

export interface PaymentCreatedPayload {
  paymentId: string;
  orderId: string;
  consumerId: string;
  merchantId: string;
  amount: number;
  paymentMethod: string;
  createdAt: Date;
}

export interface PaymentHeldPayload {
  paymentId: string;
  orderId: string;
  stripePaymentIntentId: string;
  amount: number;
  heldAt: Date;
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

export interface WalletCreditedPayload {
  walletId: string;
  ownerId: string;
  ownerType: string;
  amount: number;
  orderId: string;
  stripeTransferId: string;
  creditedAt: Date;
}

export interface WalletDebitedPayload {
  walletId: string;
  ownerId: string;
  ownerType: string;
  amount: number;
  stripePayoutId: string;
  debitedAt: Date;
}
