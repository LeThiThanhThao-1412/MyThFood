import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Request } from "express";
import { PaymentService } from "../application/payment.service";
import { StripeWebhookService } from "../../stripe/stripe.webhook";
import {
  CreatePaymentDto,
  CreateStripePaymentDto,
  AssignDriverDto,
  SplitAndCompletePaymentDto,
  RefundPaymentDto,
  CreateConnectedAccountDto,
  PaymentResponseDto,
  PaymentQueryDto,
} from "../application/dtos/payment.dto";

@Controller("payments")
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly stripeWebhookService: StripeWebhookService,
  ) {}

  // ===================== Stripe Webhook (no auth) =====================

  @Post("webhooks/stripe")
  @HttpCode(HttpStatus.OK)
  async stripeWebhook(@Req() req: Request): Promise<{ received: boolean }> {
    const event = this.stripeWebhookService.processWebhook(req as any);
    if (event) {
      // Handle webhook events asynchronously
    }
    return { received: true };
  }

  // ===================== Payment Creation =====================

  @Post()
  @UseGuards(AuthGuard("jwt"))
  async create(@Body() dto: CreatePaymentDto): Promise<PaymentResponseDto> {
    return this.paymentService.create(dto);
  }

  @Post("stripe")
  @UseGuards(AuthGuard("jwt"))
  async createStripe(
    @Body() dto: CreateStripePaymentDto,
  ): Promise<PaymentResponseDto & { clientSecret: string }> {
    return this.paymentService.createStripePayment(dto);
  }

  // ===================== Payment Lifecycle Commands =====================

  @Patch(":id/assign-driver")
  @UseGuards(AuthGuard("jwt"))
  async assignDriver(
    @Param("id") id: string,
    @Body() dto: AssignDriverDto,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.assignDriver(id, dto.driverId);
  }

  @Patch(":id/split-and-complete")
  @UseGuards(AuthGuard("jwt"))
  async splitAndComplete(
    @Param("id") id: string,
    @Body() dto: SplitAndCompletePaymentDto,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.splitAndComplete(
      id,
      dto.merchantStripeAccountId,
      dto.driverStripeAccountId,
    );
  }

  @Patch(":id/complete")
  @UseGuards(AuthGuard("jwt"))
  async complete(
    @Param("id") id: string,
    @Body() body: { transactionId: string },
  ): Promise<PaymentResponseDto> {
    return this.paymentService.complete(id, body.transactionId ?? "manual");
  }

  @Patch(":id/fail")
  @UseGuards(AuthGuard("jwt"))
  async fail(
    @Param("id") id: string,
    @Body() body: { reason: string },
  ): Promise<PaymentResponseDto> {
    return this.paymentService.fail(id, body.reason ?? "No reason provided");
  }

  @Patch(":id/refund")
  @UseGuards(AuthGuard("jwt"))
  async refund(
    @Param("id") id: string,
    @Body() dto: RefundPaymentDto,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.refund(id, dto.reason, dto.refundAmount);
  }

  // ===================== Stripe Connected Accounts =====================

  @Post("stripe/connected-account")
  @UseGuards(AuthGuard("jwt"))
  async createConnectedAccount(
    @Body() dto: CreateConnectedAccountDto,
  ): Promise<{ accountId: string }> {
    return this.paymentService.createConnectedAccount({
      email: dto.email,
      country: dto.country,
      type: dto.type as "standard" | "express" | "custom",
    });
  }

  @Post("stripe/account-link")
  @UseGuards(AuthGuard("jwt"))
  async createAccountLink(
    @Body() dto: { accountId: string; refreshUrl: string; returnUrl: string },
  ): Promise<{ url: string }> {
    return this.paymentService.createAccountLink({
      accountId: dto.accountId,
      refreshUrl: dto.refreshUrl,
      returnUrl: dto.returnUrl,
    });
  }

  // ===================== Queries =====================

  @Get()
  @UseGuards(AuthGuard("jwt"))
  async findAll(
    @Query() query: PaymentQueryDto,
  ): Promise<PaymentResponseDto[]> {
    if (query.consumerId) {
      return this.paymentService.findByConsumerId(query.consumerId);
    }
    if (query.merchantId) {
      return this.paymentService.findByMerchantId(query.merchantId);
    }
    if (query.orderId) {
      const payment = await this.paymentService.findByOrderId(query.orderId);
      return payment ? [payment] : [];
    }
    return this.paymentService.findAll();
  }

  @Get("order/:orderId")
  @UseGuards(AuthGuard("jwt"))
  async findByOrderId(
    @Param("orderId") orderId: string,
  ): Promise<PaymentResponseDto | null> {
    return this.paymentService.findByOrderId(orderId);
  }

  @Get("consumer/:consumerId")
  @UseGuards(AuthGuard("jwt"))
  async findByConsumerId(
    @Param("consumerId") consumerId: string,
  ): Promise<PaymentResponseDto[]> {
    return this.paymentService.findByConsumerId(consumerId);
  }

  @Get("merchant/:merchantId")
  @UseGuards(AuthGuard("jwt"))
  async findByMerchantId(
    @Param("merchantId") merchantId: string,
  ): Promise<PaymentResponseDto[]> {
    return this.paymentService.findByMerchantId(merchantId);
  }

  @Get(":id")
  @UseGuards(AuthGuard("jwt"))
  async findById(@Param("id") id: string): Promise<PaymentResponseDto> {
    return this.paymentService.findById(id);
  }

  // ===================== Stats Daily (B8) =====================

  @Get("stats/daily")
  @UseGuards(AuthGuard("jwt"))
  async getDailyStats(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.paymentService.getDailyStats(startDate, endDate);
  }

  // ===================== Delete =====================

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard("jwt"))
  async delete(@Param("id") id: string): Promise<void> {
    return this.paymentService.delete(id);
  }
}
