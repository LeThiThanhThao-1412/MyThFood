import { Injectable, Logger } from "@nestjs/common";
import { EntityNotFoundError } from "@mythfood/shared-kernel";
import { Payment, PaymentMethod } from "../domain/payment.aggregate";
import { PaymentId } from "../domain/payment-id";
import { PaymentRepository } from "../infrastructure/payment.repository";
import { StripeService } from "../../stripe/stripe.service";
import { SplitPaymentService } from "./split-payment.service";
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
  private readonly walletServiceUrl = process.env.WALLET_SERVICE_URL || "http://localhost:3009";

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly stripeService: StripeService,
    private readonly splitPaymentService: SplitPaymentService,
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

  // ===================== Wallet Operations (delegated to wallet-service) =====================

  async getWallet(ownerId: string): Promise<WalletResponseDto | null> {
    try {
      const res = await fetch(
        `${this.walletServiceUrl}/api/v1/wallets/${ownerId}`,
      );
      if (!res.ok) return null;
      const data: any = await res.json();
      const wallet = data.data || data;
      return {
        id: wallet.id,
        ownerId: wallet.ownerId,
        ownerType: wallet.ownerType,
        balance: wallet.balance,
        currency: wallet.currency || "VND",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (err) {
      this.logger.error(`Failed to get wallet from wallet-service: ${err}`);
      return null;
    }
  }

  async getWalletTransactions(walletId: string): Promise<WalletTransactionResponseDto[]> {
    try {
      const res = await fetch(
        `${this.walletServiceUrl}/api/v1/wallets/${walletId}/transactions`,
      );
      if (!res.ok) return [];
      const data: any = await res.json();
      const txs = data.data || data || [];
      return txs.map((tx: any) => ({
        id: tx.id,
        walletId: tx.walletId,
        ownerId: tx.ownerId,
        ownerType: tx.ownerType,
        type: tx.type,
        amount: Number(tx.amount),
        balanceBefore: Number(tx.balanceBefore),
        balanceAfter: Number(tx.balanceAfter),
        description: tx.description || null,
        orderId: tx.orderId || tx.referenceId || null,
        stripeTransferId: null,
        stripePayoutId: null,
        createdAt: tx.createdAt,
      }));
    } catch (err) {
      this.logger.error(`Failed to get wallet transactions from wallet-service: ${err}`);
      return [];
    }
  }

  async withdrawFromWallet(params: {
    ownerId: string; ownerType: string; amount: number; stripeAccountId: string;
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