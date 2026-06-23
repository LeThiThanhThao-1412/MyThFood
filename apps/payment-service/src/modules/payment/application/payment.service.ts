import { Injectable } from "@nestjs/common";
import { EntityNotFoundError } from "@mythfood/shared-kernel";
import { Payment, PaymentMethod } from "../domain/payment.aggregate";
import { PaymentId } from "../domain/payment-id";
import { PaymentRepository } from "../infrastructure/payment.repository";
import { CreatePaymentDto, PaymentResponseDto } from "./dtos/payment.dto";

@Injectable()
export class PaymentService {
  constructor(private readonly paymentRepository: PaymentRepository) {}

  async create(dto: CreatePaymentDto): Promise<PaymentResponseDto> {
    const result = Payment.create({
      orderId: dto.orderId,
      consumerId: dto.consumerId,
      merchantId: dto.merchantId,
      amount: dto.amount,
      paymentMethod: dto.paymentMethod as PaymentMethod,
    });

    if (result.isFailure) {
      throw result.error;
    }

    const payment = result.value;
    await this.paymentRepository.save(payment);
    return this.toResponseDto(payment);
  }

  async complete(
    paymentId: string,
    transactionId: string,
  ): Promise<PaymentResponseDto> {
    const payment = await this.findByIdOrFail(paymentId);
    payment.complete(transactionId);
    await this.paymentRepository.save(payment);
    return this.toResponseDto(payment);
  }

  async fail(paymentId: string, reason: string): Promise<PaymentResponseDto> {
    const payment = await this.findByIdOrFail(paymentId);
    payment.fail(reason);
    await this.paymentRepository.save(payment);
    return this.toResponseDto(payment);
  }

  async refund(paymentId: string, reason: string): Promise<PaymentResponseDto> {
    const payment = await this.findByIdOrFail(paymentId);
    payment.refund(reason);
    await this.paymentRepository.save(payment);
    return this.toResponseDto(payment);
  }

  async findById(paymentId: string): Promise<PaymentResponseDto> {
    const payment = await this.findByIdOrFail(paymentId);
    return this.toResponseDto(payment);
  }

  async findByOrderId(orderId: string): Promise<PaymentResponseDto | null> {
    const payment = await this.paymentRepository.findByOrderId(orderId);
    return payment ? this.toResponseDto(payment) : null;
  }

  async findByConsumerId(consumerId: string): Promise<PaymentResponseDto[]> {
    const payments = await this.paymentRepository.findByConsumerId(consumerId);
    return payments.map((p) => this.toResponseDto(p));
  }

  async findByMerchantId(merchantId: string): Promise<PaymentResponseDto[]> {
    const payments = await this.paymentRepository.findByMerchantId(merchantId);
    return payments.map((p) => this.toResponseDto(p));
  }

  async findAll(): Promise<PaymentResponseDto[]> {
    const payments = await this.paymentRepository.findAll();
    return payments.map((p) => this.toResponseDto(p));
  }

  async delete(paymentId: string): Promise<void> {
    await this.paymentRepository.deleteById(PaymentId.from(paymentId));
  }

  private async findByIdOrFail(paymentId: string): Promise<Payment> {
    const payment = await this.paymentRepository.findById(
      PaymentId.from(paymentId),
    );
    if (!payment) {
      throw new EntityNotFoundError("Payment", paymentId);
    }
    return payment;
  }

  private toResponseDto(payment: Payment): PaymentResponseDto {
    return {
      id: payment.id.toString(),
      orderId: payment.paymentOrderId,
      consumerId: payment.paymentConsumerId,
      merchantId: payment.paymentMerchantId,
      amount: payment.paymentAmount,
      paymentMethod: payment.paymentMethodType,
      status: payment.paymentStatus,
      transactionId: payment.paymentTransactionId,
      failureReason: payment.paymentFailureReason,
      refundReason: payment.paymentRefundReason,
      refundedAmount: payment.paymentRefundedAmount,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }
}
