import {
  Payment,
  PaymentStatus,
  PaymentMethod,
  PaymentProps,
} from "../domain/payment.aggregate";
import { PaymentId } from "../domain/payment-id";
import { PaymentEntity } from "./payment.entity";

export class PaymentMapper {
  public static toDomain(entity: PaymentEntity): Payment {
    const props: PaymentProps = {
      orderId: entity.orderId,
      consumerId: entity.consumerId,
      merchantId: entity.merchantId,
      driverId: entity.driverId,
      amount: Number(entity.amount),
      paymentMethod: entity.paymentMethod as PaymentMethod,
      status: entity.status as PaymentStatus,
      stripePaymentIntentId: entity.stripePaymentIntentId,
      stripeTransferMerchantId: entity.stripeTransferMerchantId,
      stripeTransferDriverId: entity.stripeTransferDriverId,
      transactionId: entity.transactionId,
      failureReason: entity.failureReason,
      refundReason: entity.refundReason,
      refundedAmount: entity.refundedAmount
        ? Number(entity.refundedAmount)
        : null,
    };

    return Payment.rehydrate(PaymentId.from(entity.id), props);
  }

  public static toPersistence(payment: Payment): PaymentEntity {
    const entity = new PaymentEntity();
    entity.id = payment.id.toString();
    entity.orderId = payment.paymentOrderId;
    entity.consumerId = payment.paymentConsumerId;
    entity.merchantId = payment.paymentMerchantId;
    entity.driverId = payment.paymentDriverId;
    entity.amount = payment.paymentAmount;
    entity.paymentMethod = payment.paymentMethodType;
    entity.status = payment.paymentStatus;
    entity.stripePaymentIntentId = payment.paymentStripePaymentIntentId;
    entity.stripeTransferMerchantId = payment.paymentStripeTransferMerchantId;
    entity.stripeTransferDriverId = payment.paymentStripeTransferDriverId;
    entity.transactionId = payment.paymentTransactionId;
    entity.failureReason = payment.paymentFailureReason;
    entity.refundReason = payment.paymentRefundReason;
    entity.refundedAmount = payment.paymentRefundedAmount;
    return entity;
  }
}
