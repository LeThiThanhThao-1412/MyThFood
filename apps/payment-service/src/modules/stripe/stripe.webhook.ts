import { Injectable, Logger, RawBodyRequest } from "@nestjs/common";
import { Request } from "express";
import Stripe from "stripe";
import { StripeService } from "./stripe.service";

export interface StripeWebhookEvent {
  type: string;
  paymentIntentId?: string;
  transferId?: string;
  payoutId?: string;
  amount?: number;
  metadata?: Record<string, string>;
}

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(private readonly stripeService: StripeService) {}

  /**
   * Process an incoming Stripe webhook request.
   * Verifies signature and returns parsed event data.
   */
  processWebhook(req: RawBodyRequest<Request>): StripeWebhookEvent | null {
    const signature = req.headers["stripe-signature"] as string;
    if (!signature) {
      this.logger.warn("Missing stripe-signature header");
      return null;
    }

    let event: Stripe.Event;
    try {
      event = this.stripeService.verifyWebhookSignature(
        req.rawBody!,
        signature,
      );
    } catch (err) {
      this.logger.error(`Webhook signature verification failed: ${err}`);
      return null;
    }

    this.logger.log(`Received Stripe webhook: ${event.type}`);

    switch (event.type) {
      case "payment_intent.succeeded":
        return this.handlePaymentIntentSucceeded(
          event.data.object as Stripe.PaymentIntent,
        );
      case "payment_intent.payment_failed":
        return this.handlePaymentIntentFailed(
          event.data.object as Stripe.PaymentIntent,
        );
      case "payment_intent.canceled":
        return this.handlePaymentIntentCanceled(
          event.data.object as Stripe.PaymentIntent,
        );
      case "transfer.created":
        return this.handleTransferCreated(event.data.object as Stripe.Transfer);
      case "payout.created":
        return this.handlePayoutCreated(event.data.object as Stripe.Payout);
      default:
        this.logger.log(`Unhandled webhook event type: ${event.type}`);
        return null;
    }
  }

  private handlePaymentIntentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
  ): StripeWebhookEvent {
    return {
      type: "payment_intent.succeeded",
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      metadata: paymentIntent.metadata as Record<string, string>,
    };
  }

  private handlePaymentIntentFailed(
    paymentIntent: Stripe.PaymentIntent,
  ): StripeWebhookEvent {
    return {
      type: "payment_intent.payment_failed",
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      metadata: paymentIntent.metadata as Record<string, string>,
    };
  }

  private handlePaymentIntentCanceled(
    paymentIntent: Stripe.PaymentIntent,
  ): StripeWebhookEvent {
    return {
      type: "payment_intent.canceled",
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      metadata: paymentIntent.metadata as Record<string, string>,
    };
  }

  private handleTransferCreated(transfer: Stripe.Transfer): StripeWebhookEvent {
    return {
      type: "transfer.created",
      transferId: transfer.id,
      amount: transfer.amount,
      metadata: transfer.metadata as Record<string, string>,
    };
  }

  private handlePayoutCreated(payout: Stripe.Payout): StripeWebhookEvent {
    return {
      type: "payout.created",
      payoutId: payout.id,
      amount: payout.amount,
    };
  }
}
