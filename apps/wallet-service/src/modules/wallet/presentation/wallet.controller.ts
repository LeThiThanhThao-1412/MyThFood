import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles, RolesGuard } from "@mythfood/common";
import { ServiceKeyOrJwtGuard } from "../../auth/service-key-or-jwt.guard";
import { Request } from "express";
import { WalletService } from "../application/wallet.service";
import { OwnerType } from "../domain/owner-type.enum";
import { StripeService } from "../../stripe/stripe.service";

@Controller("wallets")
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly stripeService: StripeService,
  ) {}

  // ═══════════════════════════════════════════════════════
  // Stripe Webhook (no auth)
  // ═══════════════════════════════════════════════════════
  @Post("webhooks/stripe")
  @HttpCode(HttpStatus.OK)
  async stripeWebhook(@Req() req: Request) {
    const sig = req.headers["stripe-signature"] as string;
    try {
      const event = this.stripeService.verifyWebhookSignature(
        req.body as any,
        sig,
      );
      if (event.type === "payment_intent.succeeded") {
        const pi = event.data.object as any;
        const ownerId = pi.metadata?.ownerId;
        const ownerType =
          (pi.metadata?.ownerType as OwnerType) || OwnerType.CONSUMER;
        const amount = pi.amount;
        if (ownerId) {
          await this.walletService.handleStripeTopup(
            ownerId,
            ownerType,
            amount,
          );
        }
      }
    } catch (err: any) {
      throw new Error(`Webhook Error: ${err.message}`);
    }
    return { received: true };
  }

  // ═══════════════════════════════════════════════════════
  // Create Wallet
  // ═══════════════════════════════════════════════════════
  @Post()
  @UseGuards(AuthGuard("jwt"))
  async createWallet(@Body() body: { ownerId: string; ownerType: OwnerType }) {
    const wallet = await this.walletService.getOrCreateWallet(
      body.ownerId,
      body.ownerType,
    );
    return {
      id: wallet.id,
      ownerId: wallet.ownerId,
      ownerType: wallet.ownerType,
      balance: Number(wallet.balance),
      currency: wallet.currency,
    };
  }

  // ═══════════════════════════════════════════════════════
  // Get Wallet
  // ═══════════════════════════════════════════════════════
  @Get()
  @UseGuards(AuthGuard("jwt"))
  async getWallet(
    @Query("ownerId") ownerId: string,
    @Query("ownerType") ownerType: string,
  ) {
    const wallet = await this.walletService.getOrCreateWallet(
      ownerId,
      ownerType as OwnerType,
    );
    const transactions = await this.walletService.getTransactions(
      ownerId,
      ownerType as OwnerType,
    );
    return {
      id: wallet.id,
      ownerId: wallet.ownerId,
      ownerType: wallet.ownerType,
      balance: Number(wallet.balance),
      currency: wallet.currency,
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        balanceBefore: Number(t.balanceBefore),
        balanceAfter: Number(t.balanceAfter),
        description: t.description,
        referenceType: t.referenceType,
        referenceId: t.referenceId,
        createdAt: t.createdAt,
      })),
    };
  }

  // ═══════════════════════════════════════════════════════
  // Get Balance
  // ═══════════════════════════════════════════════════════
  @Get("balance")
  @UseGuards(AuthGuard("jwt"))
  async getBalance(
    @Query("ownerId") ownerId: string,
    @Query("ownerType") ownerType: string,
  ) {
    const balance = await this.walletService.getBalance(
      ownerId,
      ownerType as OwnerType,
    );
    return { ownerId, ownerType, balance };
  }

  // ═══════════════════════════════════════════════════════
  // COD Eligibility Check (with optional orderValue)
  // ═══════════════════════════════════════════════════════
  @Get("check-cod-eligibility/:driverId")
  @UseGuards(AuthGuard("jwt"))
  async checkCodEligibility(
    @Param("driverId") driverId: string,
    @Query("orderValue") orderValue?: string,
  ) {
    return this.walletService.canAcceptCOD(
      driverId,
      orderValue ? parseInt(orderValue, 10) : undefined,
    );
  }

  // ═══════════════════════════════════════════════════════
  // Hold funds for COD order
  // ═══════════════════════════════════════════════════════
  @Post("hold-cod")
  @UseGuards(AuthGuard("jwt"))
  async holdForCOD(
    @Body() body: { driverId: string; orderValue: number; orderId: string },
  ) {
    return this.walletService.holdForCOD(
      body.driverId,
      body.orderValue,
      body.orderId,
    );
  }

  // ═══════════════════════════════════════════════════════
  // Release held funds for COD order
  // ═══════════════════════════════════════════════════════
  @Post("release-cod")
  @UseGuards(AuthGuard("jwt"))
  async releaseHoldCOD(
    @Body() body: { driverId: string; orderValue: number; orderId: string },
  ) {
    return this.walletService.releaseHoldCOD(
      body.driverId,
      body.orderValue,
      body.orderId,
    );
  }

  // ═══════════════════════════════════════════════════════
  // Top-up via Stripe (create PaymentIntent)
  // ═══════════════════════════════════════════════════════
  @Post("topup/stripe")
  @UseGuards(AuthGuard("jwt"))
  async topupStripe(
    @Body()
    body: {
      ownerId: string;
      ownerType?: OwnerType;
      amount: number;
    },
  ) {
    const ownerType = body.ownerType || OwnerType.CONSUMER;
    const pi = await this.stripeService.createPaymentIntent({
      amount: body.amount,
      ownerId: body.ownerId,
      ownerType,
    });
    return { clientSecret: pi.client_secret, paymentIntentId: pi.id };
  }

  // ═══════════════════════════════════════════════════════
  // Direct Top-up (internal/testing)
  // ═══════════════════════════════════════════════════════
  @Post("topup")
  @UseGuards(AuthGuard("jwt"))
  async topup(
    @Body() body: { ownerId: string; ownerType: string; amount: number },
  ) {
    return this.walletService.credit(
      body.ownerId,
      body.ownerType as OwnerType,
      body.amount,
      "Nạp tiền",
      "TOPUP",
    );
  }

  // ═══════════════════════════════════════════════════════
  // Pay order with wallet
  // ═══════════════════════════════════════════════════════
  @Post("pay")
  @UseGuards(AuthGuard("jwt"))
  async pay(
    @Body()
    body: {
      ownerId: string;
      ownerType?: OwnerType;
      amount: number;
      orderId: string;
    },
  ) {
    return this.walletService.pay(
      body.ownerId,
      (body.ownerType as OwnerType) || OwnerType.CONSUMER,
      body.amount,
      body.orderId,
    );
  }

  // ═══════════════════════════════════════════════════════
  // Refund to wallet (store credit) for cancelled online orders
  // ═══════════════════════════════════════════════════════
  @Post("refund")
  @UseGuards(ServiceKeyOrJwtGuard)
  async refund(
    @Body()
    body: {
      ownerId: string;
      ownerType?: OwnerType;
      amount: number;
      orderId: string;
    },
  ) {
    return this.walletService.refundCredit(
      body.ownerId,
      (body.ownerType as OwnerType) || OwnerType.CONSUMER,
      body.amount,
      body.orderId,
    );
  }

  // ═══════════════════════════════════════════════════════
  // Withdraw
  // ═══════════════════════════════════════════════════════
  @Post("withdraw")
  @UseGuards(AuthGuard("jwt"))
  async withdraw(
    @Body() body: { ownerId: string; ownerType: string; amount: number },
  ) {
    return this.walletService.debit(
      body.ownerId,
      body.ownerType as OwnerType,
      body.amount,
      `Rút ${body.amount.toLocaleString("vi-VN")} VND về ngân hàng`,
    );
  }

  // ═══════════════════════════════════════════════════════
  // Settlement - COD
  // ═══════════════════════════════════════════════════════
  @Post("settle/cod")
  async settleCOD(
    @Body()
    body: {
      merchantId: string;
      driverId: string;
      orderId: string;
      foodTotal: number;
      shippingFee: number;
      discount?: number;
      discountFundedBy?: string;
      serviceFee?: number;
    },
    @Req() req: Request,
  ) {
    // Allow both JWT auth and service-to-service key
    const serviceKey = req.headers["x-service-key"] as string;
    const expectedKey = process.env.SERVICE_API_KEY || "mythfood-service-key";
    const isServiceCall = serviceKey === expectedKey;

    if (!isServiceCall) {
      // Fall through to JWT guard check for regular API calls
      // (handled by global guard)
    }

    await this.walletService.settleCOD(
      body.merchantId,
      body.driverId,
      body.orderId,
      body.foodTotal,
      body.shippingFee,
      body.discount ?? 0,
      body.discountFundedBy ?? "MERCHANT",
      body.serviceFee ?? 0,
    );
    return { message: "COD Settlement completed" };
  }

  // ═══════════════════════════════════════════════════════
  // Settlement - Regular
  // ═══════════════════════════════════════════════════════
  @Post("settle/regular")
  @UseGuards(AuthGuard("jwt"))
  async settleRegular(
    @Body()
    body: {
      driverId: string;
      orderId: string;
      shippingFee: number;
    },
  ) {
    await this.walletService.settleRegular(
      body.driverId,
      body.orderId,
      body.shippingFee,
    );
    return { message: "Regular Settlement completed" };
  }

  // ═══════════════════════════════════════════════════════
  // Settlement - Online (card/Stripe payments)
  // ═══════════════════════════════════════════════════════
  @Post("settle/online")
  async settleOnline(
    @Body()
    body: {
      merchantId: string;
      driverId: string;
      orderId: string;
      foodTotal: number;
      shippingFee: number;
      discount?: number;
      discountFundedBy?: string;
      serviceFee?: number;
    },
  ) {
    await this.walletService.settleOnline(
      body.merchantId,
      body.driverId,
      body.orderId,
      body.foodTotal,
      body.shippingFee,
      body.discount ?? 0,
      body.discountFundedBy ?? "MERCHANT",
      body.serviceFee ?? 0,
    );
    return { message: "Online Settlement completed" };
  }

  // ═══════════════════════════════════════════════════════
  // Admin: All Transactions (must come BEFORE :ownerId wildcard)
  // ═══════════════════════════════════════════════════════
  @Get("transactions/admin")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  async getAdminTransactions(
    @Query("skip") skip?: string,
    @Query("take") take?: string,
    @Query("type") type?: string,
    @Query("ownerType") ownerType?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("search") search?: string,
  ) {
    return this.walletService.getAdminTransactions({
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 50,
      type: type || undefined,
      ownerType: ownerType || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      search: search || undefined,
    });
  }

  // ═══════════════════════════════════════════════════════
  // Transaction History (wildcard - must come AFTER static routes)
  // ═══════════════════════════════════════════════════════
  @Get(":ownerId/transactions")
  @UseGuards(AuthGuard("jwt"))
  async getTransactions(
    @Param("ownerId") ownerId: string,
    @Query("ownerType") ownerType: string,
  ) {
    return this.walletService.getTransactions(
      ownerId,
      (ownerType || "DRIVER") as OwnerType,
    );
  }

  // ═══════════════════════════════════════════════════════
  // Earnings (driver income from settlements)
  // ═══════════════════════════════════════════════════════
  @Get("earnings")
  @UseGuards(ServiceKeyOrJwtGuard, RolesGuard)
  @Roles("DRIVER", "ADMIN")
  async getEarnings(
    @Query("ownerId") ownerId: string,
    @Query("ownerType") ownerType: string,
    @Query("period") period?: string,
  ) {
    return this.walletService.getEarnings(
      ownerId,
      (ownerType || "DRIVER") as OwnerType,
      period || "today",
    );
  }

  // ═══════════════════════════════════════════════════════
  // Admin: Wallet Stats
  // ═══════════════════════════════════════════════════════
  @Get("stats")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  async getWalletStats() {
    return this.walletService.getWalletStats();
  }
}
