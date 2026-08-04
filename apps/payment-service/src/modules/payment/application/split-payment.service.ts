import { Injectable, Logger } from "@nestjs/common";
import { StripeService } from "../../stripe/stripe.service";
import { Payment } from "../domain/payment.aggregate";

/**
 * Wallet operations now delegated to wallet-service (port 3009).
 * This eliminates duplicate wallet code in payment-service.
 */
@Injectable()
export class SplitPaymentService {
  private readonly logger = new Logger(SplitPaymentService.name);
  private readonly walletServiceUrl = process.env.WALLET_SERVICE_URL || "http://localhost:3009";

  constructor(
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Execute the split payment flow when an order is delivered:
   * 1. Capture the Stripe PaymentIntent (funds were held)
   * 2. Split the captured amount between merchant, driver, and platform
   * 3. Transfer funds to merchant's and driver's Stripe connected accounts
   * 4. Record credits via wallet-service HTTP API
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

    // 5. Record wallet credits via wallet-service HTTP API
    // Merchant wallet credit
    try {
      await this.creditWallet(
        payment.paymentMerchantId,
        "MERCHANT",
        merchantAmount,
        `Merchant share for order ${payment.paymentOrderId}`,
        payment.paymentOrderId,
      );
    } catch (err) {
      this.logger.error(`Failed to record merchant wallet credit: ${err}`);
    }

    // Driver wallet credit
    if (payment.paymentDriverId) {
      try {
        await this.creditWallet(
          payment.paymentDriverId,
          "DRIVER",
          driverAmount,
          `Driver share for order ${payment.paymentOrderId}`,
          payment.paymentOrderId,
        );
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
   * Execute wallet withdrawal: debit from wallet via wallet-service HTTP API
   */
  async executeWalletWithdrawal(params: {
    ownerId: string;
    ownerType: string;
    amount: number;
    stripeAccountId: string;
  }): Promise<{ payoutId: string; newBalance: number }> {
    // Create payout via Stripe to the user's bank account
    const payout = await this.stripeService.createPayout({
      amount: params.amount,
      stripeAccountId: params.stripeAccountId,
      description: `Wallet withdrawal for ${params.ownerType} ${params.ownerId}`,
    });

    // Debit the wallet via wallet-service
    let newBalance = 0;
    try {
      const res = await fetch(
        `${this.walletServiceUrl}/api/v1/wallets/debit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ownerId: params.ownerId,
            ownerType: params.ownerType,
            amount: params.amount,
            description: `Wallet withdrawal to bank account`,
          }),
        },
      );
      if (res.ok) {
        const data: any = await res.json();
        newBalance = data.balance || 0;
      }
    } catch (err) {
      this.logger.error(`Failed to debit wallet via wallet-service: ${err}`);
    }

    this.logger.log(
      `Wallet withdrawal: ${params.amount} from ${params.ownerType} ${params.ownerId}, payout: ${payout.id}`,
    );

    return {
      payoutId: payout.id,
      newBalance,
    };
  }

  /**
   * Calculate the split percentages from environment config.
   */
  public calculateSplit(_totalAmount: number): SplitPercentages {
    return calculateSplitFromEnv(this.logger);
  }

  // ─── Private: HTTP calls to wallet-service ──────────────

  private async creditWallet(
    ownerId: string,
    ownerType: string,
    amount: number,
    description: string,
    orderId: string,
  ): Promise<void> {
    const res = await fetch(
      `${this.walletServiceUrl}/api/v1/wallets/credit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId,
          ownerType,
          amount,
          description,
          referenceId: orderId,
          referenceType: "SETTLEMENT",
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Wallet credit failed: ${res.status} ${text}`);
    }
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