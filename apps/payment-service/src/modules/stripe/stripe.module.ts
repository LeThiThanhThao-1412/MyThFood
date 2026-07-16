import { Module, Global } from "@nestjs/common";
import { StripeService } from "./stripe.service";
import { StripeWebhookService } from "./stripe.webhook";

@Global()
@Module({
  providers: [StripeService, StripeWebhookService],
  exports: [StripeService, StripeWebhookService],
})
export class StripeModule {}
