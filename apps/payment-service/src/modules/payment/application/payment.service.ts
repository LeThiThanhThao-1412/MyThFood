import { Injectable, Logger } from "@nestjs/common";
import { EntityNotFoundError } from "@mythfood/shared-kernel";
import { Payment, PaymentMethod } from "../domain/payment.aggregate";
import { PaymentId } from "../domain/payment-id";
import { PaymentRepository } from "../infrastructure/payment.repository";
import { StripeService } from "../../stripe/stripe.service";
import { SplitPaymentService } from "./split-payment.service";
import { WalletRepository } from "../../wallet/infrastructure/wallet.repository";
import { OwnerType } from "../../wallet/domain/wallet.aggregate";
import {
  CreatePaymentDto,
  CreateStripePaymentDto,
  PaymentResponseDto,
  WalletResponseDto,
  WalletTransactionResponseDto,
} from "./dtos/payment.dto";

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly stripeService: StripeService,
    private readonly splitPaymentService: SplitPaymentService,
    private readonly walletRepository: WalletRepository,
  ) {}

  // ===================== Payment Creation =====================

  async createStripePayment(
    dto: CreateStripePaymentDto,
  ): Promise<PaymentResponseDto & { clientSecret: string }> {
    const paymentIntent = await this.stripeService.createPaymentIntent({
      amount: dto.amount,
      currency: dto.currency,
      orderId: dto.orderId,
      consumerId: dto.consumerId,
      description: `Order ${dto.orderId} - Payment from consumer ${dto.consumerId}`,
    });

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
    payment.hold(paymentIntent.id);
    await this.paymentRepository.save(payment);

    this.logger.log(`Stripe payment created: ${payment.id.toString()} with PI ${paymentIntent.id}`);

    return {
      ...this.toResponseDto(payment),
      clientSecret: paymentIntent.client_secret || "",
    };
  }

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

  // ===================== Payment Lifecycle =====================

  async assignDriver(paymentId: string, driverId: string): Promise<PaymentResponseDto> {
    const payment = await this.findByIdOrFail(paymentId);
    payment.assignDriver(driverId);
    await this.paymentRepository.save(payment);
    return this.toResponseDto(payment);
  }

  async splitAndComplete(
    paymentId: string,
    merchantStripeAccountId: string,
    driverStripeAccountId: string,
  ): Promise<PaymentResponseDto> {
    const payment = await this.findByIdOrFail(paymentId);
    await this.splitPaymentService.executeSplitPayment(
      payment, merchantStripeAccountId, driverStripeAccountId,
    );
    await this.paymentRepository.save(payment);
    this.logger.log(`Payment ${paymentId} split and completed`);
    return this.toResponseDto(payment);
  }

  async complete(paymentId: string, transactionId: string): Promise<PaymentResponseDto> {
    const payment = await this.findByIdOrFail(paymentId);
    payment.complete(transactionId);
    await this.paymentRepository.save(payment);
    return this.toResponseDto(payment);
  }

  async fail(paymentId: string, reason: string): Promise<PaymentResponseDto> {
    const payment = await this.findByIdOrFail(paymentId);
    if (payment.isHeld() && payment.paymentStripePaymentIntentId) {
      try {
        await this.stripeService.cancelPaymentIntent(payment.paymentStripePaymentIntentId);
        this.logger.log(`Cancelled PaymentIntent ${payment.paymentStripePaymentIntentId}`);
      } catch (err) {
        this.logger.error(`Failed to cancel PaymentIntent: ${err}`);
      }
    }
    payment.fail(reason);
    await this.paymentRepository.save(payment);
    return this.toResponseDto(payment);
  }

  async refund(paymentId: string, reason: string, refundAmount?: number): Promise<PaymentResponseDto> {
    const payment = await this.findByIdOrFail(paymentId);
    const refundId = await this.splitPaymentService.executeDirectRefund(payment, reason, refundAmount);
    await this.paymentRepository.save(payment);
    this.logger.log(`Payment ${paymentId} refunded: refundId=${refundId}, reason=${reason}`);
    return this.toResponseDto(payment);
  }

  // ===================== Wallet Operations =====================

  async getWallet(ownerId: string): Promise<WalletResponseDto | null> {
    const wallet = await this.walletRepository.findByOwnerId(ownerId);
    if (!wallet) return null;
    return {
      id: wallet.id, ownerId: wallet.walletOwnerId, ownerType: wallet.walletOwnerType,
      balance: wallet.walletBalance, currency: wallet.walletCurrency,
      createdAt: new Date(), updatedAt: new Date(),
    };
  }

  async getWalletTransactions(walletId: string): Promise<WalletTransactionResponseDto[]> {
    const txs = await this.walletRepository.getTransactionsByWalletId(walletId);
    return txs.map((tx: { id: string; walletId: string; ownerId: string; ownerType: string; type: string; amount: number; balanceBefore: number; balanceAfter: number; description: string | null; orderId: string | null; stripeTransferId: string | null; stripePayoutId: string | null; createdAt: Date }) => ({
      id: tx.id, walletId: tx.walletId, ownerId: tx.ownerId, ownerType: tx.ownerType,
      type: tx.type, amount: Number(tx.amount), balanceBefore: Number(tx.balanceBefore),
      balanceAfter: Number(tx.balanceAfter), description: tx.description,
      orderId: tx.orderId, stripeTransferId: tx.stripeTransferId, stripePayoutId: tx.stripePayoutId,
      createdAt: tx.createdAt,
    }));
  }

  async withdrawFromWallet(params: {
    ownerId: string; ownerType: OwnerType; amount: number; stripeAccountId: string;
  }): Promise<{ payoutId: string; newBalance: number }> {
    return this.splitPaymentService.executeWalletWithdrawal(params);
  }

  // ===================== Stripe Account Management =====================

  async createConnectedAccount(params: {
    email: string; country?: string; type?: "standard" | "express" | "custom";
  }): Promise<{ accountId: string }> {
    const account = await this.stripeService.createConnectedAccount(params);
    return { accountId: account.id };
  }

  async createAccountLink(params: {
    accountId: string; refreshUrl: string; returnUrl: string;
  }): Promise<{ url: string }> {
    const link = await this.stripeService.createAccountLink(params);
    return { url: link.url };
  }

  // ===================== Queries =====================

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

  // ---- Stats Daily (B8) ----
  async getDailyStats(_startDate?: string, _endDate?: string): Promise<any> {
    return { dailyStats: [], summary: { totalAmount: 0, totalTransactions: 0, codPercentage: 0, stripePercentage: 0 } };
  }

  // ===================== Helpers =====================

  private async findByIdOrFail(paymentId: string): Promise<Payment> {
    const payment = await this.paymentRepository.findById(PaymentId.from(paymentId));
    if (!payment) { throw new EntityNotFoundError("Payment", paymentId); }
    return payment;
  }

  private toResponseDto(payment: Payment): PaymentResponseDto {
    return {
      id: payment.id.toString(), orderId: payment.paymentOrderId,
      consumerId: payment.paymentConsumerId, merchantId: payment.paymentMerchantId,
      driverId: payment.paymentDriverId, amount: payment.paymentAmount,
      paymentMethod: payment.paymentMethodType, status: payment.paymentStatus,
      stripePaymentIntentId: payment.paymentStripePaymentIntentId,
      stripeTransferMerchantId: payment.paymentStripeTransferMerchantId,
      stripeTransferDriverId: payment.paymentStripeTransferDriverId,
      transactionId: payment.paymentTransactionId, failureReason: payment.paymentFailureReason,
      refundReason: payment.paymentRefundReason, refundedAmount: payment.paymentRefundedAmount,
      createdAt: payment.createdAt, updatedAt: payment.updatedAt,
    };
  }
}