import { Injectable, Logger } from "@nestjs/common";
import { StripeService } from "../../stripe/stripe.service";
import { WalletRepository } from "../../wallet/infrastructure/wallet.repository";
import { OwnerType } from "../../wallet/domain/wallet.aggregate";
import { Payment } from "../domain/payment.aggregate";

@Injectable()
export class SplitPaymentService {
  private readonly logger = new Logger(SplitPaymentService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly walletRepository: WalletRepository,
  ) {}

  /**
   * Execute the split payment flow when an order is delivered:
   * 1. Capture the Stripe PaymentIntent (funds were held)
   * 2. Split the captured amount between merchant, driver, and platform
   * 3. Transfer funds to merchant's and driver's Stripe connected accounts
   * 4. Record credits to merchant's and driver's wallets
   */
  async executeSplitPayment(
    payment: Payment,
    merchantStripeAccountId: string,
    driverStripeAccountId: string,
  ): Promise<{
    merchantTransferId: string;
    driverTransferId: string;
    merchantCreditAmount: number;
    driverCreditAmount: number;
    platformAmount: number;
  }> {
    const paymentIntentId = payment.paymentStripePaymentIntentId;
    if (!paymentIntentId) {
      throw new Error("Payment has no Stripe PaymentIntent ID");
    }

    // 1. Capture the PaymentIntent (move from authorized -> captured)
    this.logger.log(`Capturing PaymentIntent ${paymentIntentId}`);
    await this.stripeService.capturePaymentIntent(paymentIntentId);

    // 2. Calculate split amounts
    const totalAmount = payment.paymentAmount;
    const split = this.calculateSplit(totalAmount);

    // Deduct estimated Stripe fee (e.g., ~3.5% for platform)
    const stripeFee = Math.round(totalAmount * 0.035);
    const netAmount = totalAmount - stripeFee;

    const merchantAmount = Math.round(
      netAmount * (split.merchantPercent / 100),
    );
    const driverAmount = Math.round(netAmount * (split.driverPercent / 100));
    const platformAmount = netAmount - merchantAmount - driverAmount;

    this.logger.log(
      `Split: total=${totalAmount}, fee=${stripeFee}, net=${netAmount}, ` +
        `merchant=${merchantAmount}(${split.merchantPercent}%), ` +
        `driver=${driverAmount}(${split.driverPercent}%), ` +
        `platform=${platformAmount}(${split.platformPercent}%)`,
    );

    let merchantTransferId = "";
    let driverTransferId = "";

    // 3. Transfer to merchant's Stripe account
    if (merchantAmount > 0 && merchantStripeAccountId) {
      try {
        const merchantTransfer = await this.stripeService.createTransfer({
          amount: merchantAmount,
          destinationStripeAccountId: merchantStripeAccountId,
          description: `Payment for order ${payment.paymentOrderId} - Merchant share`,
          metadata: {
            orderId: payment.paymentOrderId,
            merchantId: payment.paymentMerchantId,
            type: "merchant_share",
          },
        });
        merchantTransferId = merchantTransfer.id;
        this.logger.log(
          `Merchant transfer created: ${merchantTransferId} for ${merchantAmount}`,
        );
      } catch (err) {
        this.logger.error(`Failed to transfer to merchant: ${err}`);
      }
    }

    // 4. Transfer to driver's Stripe account
    if (driverAmount > 0 && driverStripeAccountId) {
      try {
        const driverTransfer = await this.stripeService.createTransfer({
          amount: driverAmount,
          destinationStripeAccountId: driverStripeAccountId,
          description: `Payment for order ${payment.paymentOrderId} - Driver share`,
          metadata: {
            orderId: payment.paymentOrderId,
            driverId: payment.paymentDriverId || "",
            type: "driver_share",
          },
        });
        driverTransferId = driverTransfer.id;
        this.logger.log(
          `Driver transfer created: ${driverTransferId} for ${driverAmount}`,
        );
      } catch (err) {
        this.logger.error(`Failed to transfer to driver: ${err}`);
      }
    }

    // 5. Record wallet credits (as a ledger/debt record)
    // Merchant wallet credit
    try {
      const merchantWallet = await this.walletRepository.findByOwnerIdOrCreate(
        payment.paymentMerchantId,
        OwnerType.MERCHANT,
      );
      const balanceBefore = merchantWallet.walletBalance;
      merchantWallet.credit(merchantAmount);
      await this.walletRepository.save(merchantWallet);
      await this.walletRepository.recordTransaction({
        walletId: merchantWallet.id.toString(),
        ownerId: payment.paymentMerchantId,
        ownerType: OwnerType.MERCHANT,
        type: "CREDIT",
        amount: merchantAmount,
        balanceBefore,
        balanceAfter: merchantWallet.walletBalance,
        description: `Merchant share for order ${payment.paymentOrderId}`,
        orderId: payment.paymentOrderId,
        stripeTransferId: merchantTransferId,
      });
    } catch (err) {
      this.logger.error(`Failed to record merchant wallet credit: ${err}`);
    }

    // Driver wallet credit
    if (payment.paymentDriverId) {
      try {
        const driverWallet = await this.walletRepository.findByOwnerIdOrCreate(
          payment.paymentDriverId,
          OwnerType.DRIVER,
        );
        const balanceBefore = driverWallet.walletBalance;
      driverWallet.credit(driverAmount);
        await this.walletRepository.save(driverWallet);
        await this.walletRepository.recordTransaction({
          walletId: driverWallet.id.toString(),
          ownerId: payment.paymentDriverId,
          ownerType: OwnerType.DRIVER,
        type: "CREDIT",
        amount: driverAmount,
          balanceBefore,
          balanceAfter: driverWallet.walletBalance,
          description: `Driver share for order ${payment.paymentOrderId}`,
          orderId: payment.paymentOrderId,
          stripeTransferId: driverTransferId,
        });
      } catch (err) {
        this.logger.error(`Failed to record driver wallet credit: ${err}`);
      }
    }

    // 6. Update payment with transfer IDs
    payment.splitAndComplete(merchantTransferId, driverTransferId);

    return {
      merchantTransferId,
      driverTransferId,
      merchantCreditAmount: merchantAmount,
      driverCreditAmount: driverAmount,
      platformAmount,
    };
  }

  /**
   * Execute direct refund to customer's bank account (NOT via wallet).
   * This refunds the original payment source directly.
   */
  async executeDirectRefund(
    payment: Payment,
    reason: string,
    refundAmount?: number,
  ): Promise<string> {
    const paymentIntentId = payment.paymentStripePaymentIntentId;

    if (paymentIntentId) {
      // For HELD payments: cancel the PaymentIntent (releases authorized funds)
      if (payment.isHeld()) {
        this.logger.log(
          `Cancelling PaymentIntent ${paymentIntentId} for order ${payment.paymentOrderId}`,
        );
        await this.stripeService.cancelPaymentIntent(paymentIntentId);
      }

      // For COMPLETED payments: refund via Stripe
      if (payment.isCompleted()) {
        this.logger.log(
          `Refunding PaymentIntent ${paymentIntentId} for order ${payment.paymentOrderId}`,
        );
        const refund = await this.stripeService.refundPaymentIntent(
          paymentIntentId,
          refundAmount,
        );
        payment.refund(reason);
        return refund.id;
      }
    }

    payment.refund(reason);
    return "";
  }

  /**
   * Execute wallet withdrawal: debit from wallet and payout to bank account via Stripe.
   */
  async executeWalletWithdrawal(params: {
    ownerId: string;
    ownerType: OwnerType;
    amount: number;
    stripeAccountId: string;
  }): Promise<{ payoutId: string; newBalance: number }> {
    const wallet = await this.walletRepository.findByOwnerIdOrCreate(
      params.ownerId,
      params.ownerType,
    );

    const balanceBefore = wallet.walletBalance;

    // Create payout via Stripe to the user's bank account
    const payout = await this.stripeService.createPayout({
      amount: params.amount,
      stripeAccountId: params.stripeAccountId,
      description: `Wallet withdrawal for ${params.ownerType} ${params.ownerId}`,
    });

    // Debit the wallet
    wallet.debit(params.amount);
    await this.walletRepository.save(wallet);

    // Record transaction
    await this.walletRepository.recordTransaction({
      walletId: wallet.id.toString(),
      ownerId: params.ownerId,
      ownerType: params.ownerType,
      type: "DEBIT",
      amount: params.amount,
      balanceBefore,
      balanceAfter: wallet.walletBalance,
      description: `Wallet withdrawal to bank account`,
      stripePayoutId: payout.id,
    });

    this.logger.log(
      `Wallet withdrawal: ${params.amount} from ${params.ownerType} ${params.ownerId}, payout: ${payout.id}`,
    );

    return {
      payoutId: payout.id,
      newBalance: wallet.walletBalance,
    };
  }

  /**
   * Calculate the split percentages from environment config.
   */
  public calculateSplit(_totalAmount: number): SplitPercentages {
    return calculateSplitFromEnv(this.logger);
  }
}

// Pure function for testability
export interface SplitPercentages {
  merchantPercent: number;
  driverPercent: number;
  platformPercent: number;
}

export function calculateSplitFromEnv(logger?: {
  warn: (msg: string) => void;
}): SplitPercentages {
  const merchantPercent = parseInt(
    process.env.PAYMENT_SPLIT_MERCHANT_PERCENT || "70",
    10,
  );
  const driverPercent = parseInt(
    process.env.PAYMENT_SPLIT_DRIVER_PERCENT || "20",
    10,
  );
  const platformPercent = parseInt(
    process.env.PAYMENT_SPLIT_PLATFORM_PERCENT || "10",
    10,
  );

  // Validate total = 100
  if (merchantPercent + driverPercent + platformPercent !== 100) {
    logger?.warn(
      `Split percentages do not total 100: merchant=${merchantPercent}, ` +
        `driver=${driverPercent}, platform=${platformPercent}. Using defaults.`,
    );
    return { merchantPercent: 70, driverPercent: 20, platformPercent: 10 };
  }

  return { merchantPercent, driverPercent, platformPercent };
}
