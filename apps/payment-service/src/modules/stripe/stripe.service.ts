import { Injectable, Logger } from "@nestjs/common";
import Stripe from "stripe";

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripeService.name);

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey || secretKey === "sk_test_placeholder") {
      this.logger.warn(
        "STRIPE_SECRET_KEY is not configured. Stripe operations will fail.",
      );
    }
    this.stripe = new Stripe(secretKey || "sk_test_placeholder", {
      apiVersion: (process.env.STRIPE_API_VERSION as any) || "2023-10-16",
    });
  }

  /**
   * Create a PaymentIntent to hold funds from the customer.
   * We use capture_method=manual so the funds are authorized but not
   * captured immediately. Capture happens when the order is delivered.
   */
  async createPaymentIntent(params: {
    amount: number;
    currency?: string;
    orderId: string;
    consumerId: string;
    description?: string;
  }): Promise<Stripe.PaymentIntent> {
    const currency = params.currency || "vnd";

    return this.stripe.paymentIntents.create({
      amount: Math.round(params.amount), // Stripe uses smallest currency unit (VND already in smallest unit)
      currency,
      capture_method: "manual",
      metadata: {
        orderId: params.orderId,
        consumerId: params.consumerId,
      },
      description: params.description || `Payment for order ${params.orderId}`,
    });
  }

  /**
   * Capture a PaymentIntent that was previously authorized.
   * This is called when the order is successfully delivered.
   */
  async capturePaymentIntent(
    paymentIntentId: string,
    amount?: number,
  ): Promise<Stripe.PaymentIntent> {
    if (amount) {
      return this.stripe.paymentIntents.capture(paymentIntentId, {
        amount_to_capture: Math.round(amount),
      });
    }
    return this.stripe.paymentIntents.capture(paymentIntentId);
  }

  /**
   * Cancel a PaymentIntent (release authorized funds back to customer).
   * This is used when the order is cancelled.
   */
  async cancelPaymentIntent(
    paymentIntentId: string,
  ): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.cancel(paymentIntentId);
  }

  /**
   * Create a direct refund to the customer's payment method.
   * This refunds directly to the original payment source, NOT via wallet.
   */
  async refundPaymentIntent(
    paymentIntentId: string,
    amount?: number,
  ): Promise<Stripe.Refund> {
    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: paymentIntentId,
    };
    if (amount) {
      refundParams.amount = Math.round(amount);
    }
    return this.stripe.refunds.create(refundParams);
  }

  /**
   * Create a transfer to a connected account (merchant or driver).
   * This sends money from the platform's Stripe balance to a connected account.
   */
  async createTransfer(params: {
    amount: number;
    currency?: string;
    destinationStripeAccountId: string;
    description?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Transfer> {
    return this.stripe.transfers.create({
      amount: Math.round(params.amount),
      currency: params.currency || "vnd",
      destination: params.destinationStripeAccountId,
      description: params.description,
      metadata: params.metadata,
    });
  }

  /**
   * Create a payout to an external bank account.
   * This is used when a merchant or driver wants to withdraw from their wallet.
   */
  async createPayout(params: {
    amount: number;
    currency?: string;
    stripeAccountId: string;
    description?: string;
  }): Promise<Stripe.Payout> {
    return this.stripe.payouts.create(
      {
        amount: Math.round(params.amount),
        currency: params.currency || "vnd",
        description: params.description,
      },
      {
        stripeAccount: params.stripeAccountId,
      },
    );
  }

  /**
   * Create a connected account for a merchant or driver.
   * This is the Stripe account that will receive transfers.
   */
  async createConnectedAccount(params: {
    email: string;
    country?: string;
    type?: "standard" | "express" | "custom";
  }): Promise<Stripe.Account> {
    return this.stripe.accounts.create({
      type: params.type || "express",
      country: params.country || "VN",
      email: params.email,
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
    });
  }

  /**
   * Create an account link for onboarding a connected account.
   */
  async createAccountLink(params: {
    accountId: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<Stripe.AccountLink> {
    return this.stripe.accountLinks.create({
      account: params.accountId,
      refresh_url: params.refreshUrl,
      return_url: params.returnUrl,
      type: "account_onboarding",
    });
  }

  /**
   * Verify webhook signature to ensure the event is from Stripe.
   */
  verifyWebhookSignature(payload: Buffer, signature: string): Stripe.Event {
    const webhookSecret =
      process.env.STRIPE_WEBHOOK_SECRET || "whsec_placeholder";
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );
  }

  /**
   * Retrieve a PaymentIntent by ID.
   */
  async retrievePaymentIntent(
    paymentIntentId: string,
  ): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.retrieve(paymentIntentId);
  }
}
