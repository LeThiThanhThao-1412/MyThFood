import { Injectable, Logger } from "@nestjs/common";
import Stripe from "stripe";

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripeService.name);

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey || secretKey === "stripe_key_not_configured") {
      this.logger.warn(
        "STRIPE_SECRET_KEY is not configured. Stripe operations will fail.",
      );
    }
    this.stripe = new Stripe(secretKey || "stripe_key_not_configured", {
      apiVersion: (process.env.STRIPE_API_VERSION as any) || "2023-10-16",
    });
  }

  /**
   * Create a PaymentIntent for top-up (capture immediately - different from payment-service)
   */
  async createPaymentIntent(params: {
    amount: number;
    ownerId: string;
    ownerType?: string;
    description?: string;
  }): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.create({
      amount: Math.round(params.amount),
      currency: "vnd",
      capture_method: "automatic",
      metadata: {
        ownerId: params.ownerId,
        ownerType: params.ownerType || "CONSUMER",
        type: "topup",
      },
      description: params.description || `Top-up for ${params.ownerId}`,
    });
  }

  /**
   * Verify Stripe webhook signature
   */
  verifyWebhookSignature(rawBody: Buffer, signature: string): Stripe.Event {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );
  }
}
