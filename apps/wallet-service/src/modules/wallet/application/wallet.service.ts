import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { WalletRepository } from "../infrastructure/wallet.repository";
import { SettlementRepository } from "../infrastructure/settlement.repository";
import { SettlementEntryEntity } from "../infrastructure/settlement-entry.entity";
import { OwnerType } from "../domain/wallet.aggregate";

/**
 * FIX #8: WalletService now depends on WalletRepository which encapsulates TypeORM.
 * No direct TypeORM Repository injection - clean Domain-driven architecture.
 * FIX #9: Optimistic locking via @VersionColumn on WalletEntity prevents race conditions.
 * FIX #PHASE1-COD: COD eligibility now checks balance >= 2M AND availableBalance > orderValue.
 * Uses hold/release pattern to reserve funds for active COD orders.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  static readonly MIN_COD_BALANCE = 2000000;
  static readonly MIN_WITHDRAW = 50000;
  static readonly MIN_CONSUMER_WITHDRAW = 10000;
  static readonly MAX_WITHDRAWS_PER_DAY = 1;

  constructor(
    private readonly walletRepo: WalletRepository,
    private readonly settlementRepo: SettlementRepository,
  ) {}

  async getOrCreateWallet(ownerId: string, ownerType: OwnerType) {
    const result = await this.walletRepo.findByOwnerOrCreate(
      ownerId,
      ownerType,
    );
    return result.entity;
  }

  async getBalance(ownerId: string, ownerType: OwnerType): Promise<number> {
    const wallet = await this.getOrCreateWallet(ownerId, ownerType);
    return Number(wallet.balance);
  }

  async credit(
    ownerId: string,
    ownerType: OwnerType,
    amount: number,
    description: string,
    referenceType?: string,
    referenceId?: string,
  ): Promise<{ id: string; balance: number }> {
    const entity = await this.getOrCreateWallet(ownerId, ownerType);
    const amountNum = Number(amount);
    const balanceBefore = Number(entity.balance);
    entity.balance = balanceBefore + amountNum;
    await this.walletRepo.save(entity);

    await this.walletRepo.recordTransaction({
      id: randomUUID(),
      walletId: entity.id,
      ownerId,
      ownerType,
      type: "CREDIT",
      amount: amountNum,
      balanceBefore,
      balanceAfter: Number(entity.balance),
      description,
      referenceType,
      referenceId,
    });

    this.logger.log(
      `Credit ${ownerType}:${ownerId} +${amountNum} VND - ${description}`,
    );
    return { id: entity.id, balance: Number(entity.balance) };
  }

  async debit(
    ownerId: string,
    ownerType: OwnerType,
    amount: number,
    description: string,
  ): Promise<{ id: string; balance: number }> {
    const entity = await this.getOrCreateWallet(ownerId, ownerType);

    const minWithdraw =
      ownerType === OwnerType.CONSUMER
        ? WalletService.MIN_CONSUMER_WITHDRAW
        : WalletService.MIN_WITHDRAW;
    if (amount < minWithdraw) {
      throw new Error(
        `Minimum withdraw: ${minWithdraw.toLocaleString("vi-VN")} VND`,
      );
    }

    if (ownerType === OwnerType.DRIVER) {
      const count = await this.walletRepo.countDailyWithdraws(ownerId);
      if (count >= WalletService.MAX_WITHDRAWS_PER_DAY) {
        throw new Error(
          `Max ${WalletService.MAX_WITHDRAWS_PER_DAY} withdrawal per day`,
        );
      }

      const heldBalance = Number(entity.heldBalance || 0);
      const balanceAfter = Number(entity.balance) - amount;
      // FIX PHASE1: Must maintain 2M + heldBalance (for active COD orders)
      if (balanceAfter < WalletService.MIN_COD_BALANCE + heldBalance) {
        throw new Error(
          `Must maintain minimum ${WalletService.MIN_COD_BALANCE.toLocaleString("vi-VN")} VND balance` +
            (heldBalance > 0
              ? ` + ${heldBalance.toLocaleString("vi-VN")} VND held for COD orders`
              : ""),
        );
      }
    }

    const balanceBefore = Number(entity.balance);
    if (balanceBefore < amount) {
      throw new Error(
        `Số dư không đủ. Cần ${amount.toLocaleString("vi-VN")} VND, hiện có ${balanceBefore.toLocaleString("vi-VN")} VND`,
      );
    }
    // Hold clawback: không rút quá phần còn lại sau khi trừ nợ refund.
    const openClawback = await this.settlementRepo.sumOpenClawback(
      ownerId,
      ownerType,
    );
    if (openClawback > 0 && balanceBefore - amount < openClawback) {
      throw new Error(
        `Bạn còn nợ ${openClawback.toLocaleString("vi-VN")} VND (refund chờ thu hồi), không thể rút quá số dư còn lại`,
      );
    }
    entity.balance = balanceBefore - amount;
    await this.walletRepo.save(entity);

    await this.walletRepo.recordTransaction({
      id: randomUUID(),
      walletId: entity.id,
      ownerId,
      ownerType,
      type: "DEBIT",
      amount,
      balanceBefore,
      balanceAfter: Number(entity.balance),
      description,
      referenceType: "WITHDRAW",
    });

    this.logger.log(
      `Debit ${ownerType}:${ownerId} -${amount} VND - ${description}`,
    );
    return { id: entity.id, balance: Number(entity.balance) };
  }

  /**
   * COD Eligibility check.
   * - First COD order: balance must be >= 2,000,000 VND (deposit requirement)
   * - Subsequent COD orders: availableBalance (balance - heldBalance) must be > orderValue
   */
  async canAcceptCOD(driverId: string, orderValue?: number) {
    const entity = await this.getOrCreateWallet(driverId, OwnerType.DRIVER);
    const balance = Number(entity.balance);
    const heldBalance = Number(entity.heldBalance || 0);
    const available = balance - heldBalance;

    // Check if driver has EVER completed a COD (settlement transaction exists)
    const codTxs = await this.walletRepo.findTransactionsByType(
      driverId,
      "COD_SETTLEMENT",
    );
    const hasCompletedCOD = codTxs.length > 0;

    const overMinBalance = balance >= WalletService.MIN_COD_BALANCE;
    const canCoverOrder = orderValue ? available > orderValue : true;

    // First COD: need 2M deposit. Subsequent: just need to cover
    const eligible = hasCompletedCOD
      ? canCoverOrder
      : overMinBalance && canCoverOrder;

    return {
      eligible,
      balance,
      heldBalance,
      availableBalance: available,
      minCodBalance: WalletService.MIN_COD_BALANCE,
      orderValue: orderValue || null,
      hasActiveCOD: heldBalance > 0,
      hasCompletedCOD,
      checks: {
        overMinBalance,
        canCoverOrder,
      },
    };
  }

  /**
   * FIX PHASE1-COD: Hold (reserve) funds when a driver accepts a COD order.
   * This prevents the driver from withdrawing funds needed to cover COD orders.
   */
  async holdForCOD(
    driverId: string,
    orderValue: number,
    orderId: string,
  ): Promise<{
    balance: number;
    heldBalance: number;
    availableBalance: number;
  }> {
    const entity = await this.getOrCreateWallet(driverId, OwnerType.DRIVER);
    const heldBefore = Number(entity.heldBalance || 0);

    if (heldBefore + orderValue > Number(entity.balance)) {
      throw new Error("Insufficient balance to hold for COD order");
    }

    entity.heldBalance = heldBefore + orderValue;
    await this.walletRepo.save(entity);

    await this.walletRepo.recordTransaction({
      id: randomUUID(),
      walletId: entity.id,
      ownerId: driverId,
      ownerType: OwnerType.DRIVER,
      type: "HOLD",
      amount: orderValue,
      balanceBefore: Number(entity.balance),
      balanceAfter: Number(entity.balance),
      description: `Hold for COD order #${orderId.slice(0, 8)}`,
      referenceType: "COD_HOLD",
      referenceId: orderId,
    });

    this.logger.log(
      `COD Hold: Driver ${driverId} reserved +${orderValue} VND for order #${orderId.slice(0, 8)}`,
    );
    return {
      balance: Number(entity.balance),
      heldBalance: Number(entity.heldBalance),
      availableBalance: Number(entity.balance) - Number(entity.heldBalance),
    };
  }

  /**
   * FIX PHASE1-COD: Release held funds when COD order is settled or cancelled.
   */
  async releaseHoldCOD(
    driverId: string,
    orderValue: number,
    orderId: string,
  ): Promise<{
    balance: number;
    heldBalance: number;
    availableBalance: number;
  }> {
    const entity = await this.getOrCreateWallet(driverId, OwnerType.DRIVER);
    const heldBefore = Number(entity.heldBalance || 0);

    entity.heldBalance = Math.max(0, heldBefore - orderValue);
    await this.walletRepo.save(entity);

    await this.walletRepo.recordTransaction({
      id: randomUUID(),
      walletId: entity.id,
      ownerId: driverId,
      ownerType: OwnerType.DRIVER,
      type: "RELEASE",
      amount: orderValue,
      balanceBefore: Number(entity.balance),
      balanceAfter: Number(entity.balance),
      description: `Release hold for COD order #${orderId.slice(0, 8)}`,
      referenceType: "COD_RELEASE",
      referenceId: orderId,
    });

    this.logger.log(
      `COD Release: Driver ${driverId} released ${orderValue} VND for order #${orderId.slice(0, 8)}`,
    );
    return {
      balance: Number(entity.balance),
      heldBalance: Number(entity.heldBalance),
      availableBalance: Number(entity.balance) - Number(entity.heldBalance),
    };
  }

  async getTransactions(ownerId: string, ownerType: OwnerType) {
    return this.walletRepo.getTransactions(ownerId, ownerType);
  }

  async handleStripeTopup(
    ownerId: string,
    ownerType: OwnerType,
    amount: number,
  ): Promise<void> {
    await this.credit(
      ownerId,
      ownerType,
      amount,
      "Nạp tiền qua Stripe",
      "TOPUP",
    );
  }

  /**
   * Pay an order using the owner's wallet balance.
   * Debits the wallet for the order total (referenceType ORDER).
   */
  async pay(
    ownerId: string,
    ownerType: OwnerType,
    amount: number,
    orderId: string,
  ): Promise<{ id: string; balance: number }> {
    const entity = await this.getOrCreateWallet(ownerId, ownerType);
    const balanceBefore = Number(entity.balance);

    if (balanceBefore < amount) {
      throw new Error(
        `Số dư ví không đủ. Cần ${amount.toLocaleString("vi-VN")} VND, hiện có ${balanceBefore.toLocaleString("vi-VN")} VND`,
      );
    }

    entity.balance = balanceBefore - amount;
    await this.walletRepo.save(entity);

    await this.walletRepo.recordTransaction({
      id: randomUUID(),
      walletId: entity.id,
      ownerId,
      ownerType,
      type: "DEBIT",
      amount,
      balanceBefore,
      balanceAfter: Number(entity.balance),
      description: `Thanh toán đơn #${orderId.slice(0, 8)}`,
      referenceType: "ORDER",
      referenceId: orderId,
    });

    this.logger.log(
      `Wallet payment ${ownerType}:${ownerId} -${amount} VND for order #${orderId.slice(0, 8)}`,
    );
    return { id: entity.id, balance: Number(entity.balance) };
  }

  /**
   * Refund an online-paid order back into the owner's wallet (store credit).
   * Credits the wallet for the refund amount (referenceType REFUND).
   */
  async refundCredit(
    ownerId: string,
    ownerType: OwnerType,
    amount: number,
    orderId: string,
  ): Promise<{ id: string; balance: number }> {
    return this.credit(
      ownerId,
      ownerType,
      amount,
      `Hoàn tiền đơn #${orderId.slice(0, 8)}`,
      "REFUND",
      orderId,
    );
  }

  async settleCOD(
    merchantId: string,
    driverId: string,
    orderId: string,
    foodTotal: number,
    shippingFee: number,
    discount = 0,
    discountFundedBy = "MERCHANT",
    serviceFee = 0,
  ): Promise<void> {
    foodTotal = Number(foodTotal);
    shippingFee = Number(shippingFee);
    discount = Number(discount);
    serviceFee = Number(serviceFee);
    const { merchantCommissionPct, driverCommissionPct } =
      this.getCommissionRates();
    const driverCommissionAmount = Math.round(
      (shippingFee * driverCommissionPct) / 100,
    );
    const merchantCommissionAmount = Math.round(
      (foodTotal * merchantCommissionPct) / 100,
    );
    const merchantDiscount = discountFundedBy === "MERCHANT" ? discount : 0;
    const platformDiscount = discountFundedBy === "PLATFORM" ? discount : 0;

    const driverDebitTotal =
      foodTotal - discount + driverCommissionAmount + serviceFee;
    await this.debitForCOD(
      driverId,
      OwnerType.DRIVER,
      driverDebitTotal,
      `COD: Chuyen tien mon + phi nen tang don #${orderId.slice(0, 8)}`,
      orderId,
    );
    const driverCashKept = shippingFee - driverCommissionAmount;
    const driverWallet = await this.getOrCreateWallet(
      driverId,
      OwnerType.DRIVER,
    );
    await this.walletRepo.recordTransaction({
      id: randomUUID(),
      walletId: driverWallet.id,
      ownerId: driverId,
      ownerType: OwnerType.DRIVER,
      type: "REVENUE",
      amount: driverCashKept,
      balanceBefore: Number(driverWallet.balance),
      balanceAfter: Number(driverWallet.balance),
      description: `Doanh thu phi ship COD ${driverCashKept.toLocaleString("vi-VN")}d (da tru ${driverCommissionPct}% phi) - Don #${orderId.slice(0, 8)}`,
      referenceType: "SETTLEMENT",
      referenceId: orderId,
    });
    const merchantShare =
      foodTotal - merchantCommissionAmount - merchantDiscount;
    await this.credit(
      merchantId,
      OwnerType.MERCHANT,
      merchantShare,
      `Doanh thu don #${orderId.slice(0, 8)}`,
      "SETTLEMENT",
      orderId,
    );
    const platformShare =
      merchantCommissionAmount +
      driverCommissionAmount +
      serviceFee -
      platformDiscount;
    await this.credit(
      "PLATFORM_DEFAULT",
      OwnerType.PLATFORM,
      platformShare,
      `Phi nen tang don #${orderId.slice(0, 8)}`,
      "SETTLEMENT",
      orderId,
    );
    this.logger.log(
      `COD Settlement #${orderId.slice(0, 8)}: Food=${foodTotal}, Ship=${shippingFee}, Discount=${discount} (${discountFundedBy}), ` +
        `Driver -${driverDebitTotal}, Merchant +${merchantShare} (${100 - merchantCommissionPct}%), Platform +${platformShare}`,
    );
  }

  /**
   * Internal debit for COD settlement - bypasses min withdraw/daily limits.
   * This is a system-to-system transfer, not a user withdrawal.
   */
  private async debitForCOD(
    ownerId: string,
    ownerType: OwnerType,
    amount: number,
    description: string,
    orderId: string,
  ): Promise<{ id: string; balance: number }> {
    const entity = await this.getOrCreateWallet(ownerId, ownerType);
    const balanceBefore = Number(entity.balance);
    if (balanceBefore < amount) {
      throw new Error(
        `Số dư không đủ để trừ tiền món COD. Cần ${amount.toLocaleString("vi-VN")} VND, hiện có ${balanceBefore.toLocaleString("vi-VN")} VND`,
      );
    }
    entity.balance = balanceBefore - amount;
    await this.walletRepo.save(entity);

    await this.walletRepo.recordTransaction({
      id: randomUUID(),
      walletId: entity.id,
      ownerId,
      ownerType,
      type: "DEBIT",
      amount,
      balanceBefore,
      balanceAfter: Number(entity.balance),
      description,
      referenceType: "COD_SETTLEMENT",
      referenceId: orderId,
    });

    this.logger.log(
      `COD Debit ${ownerType}:${ownerId} -${amount} VND - ${description}`,
    );
    return { id: entity.id, balance: Number(entity.balance) };
  }

  async settleRegular(
    driverId: string,
    orderId: string,
    shippingFee: number,
  ): Promise<void> {
    await this.credit(
      driverId,
      OwnerType.DRIVER,
      shippingFee,
      `Phí ship đơn #${orderId.slice(0, 8)}`,
      "SETTLEMENT",
      orderId,
    );
    this.logger.log(
      `Regular Settlement #${orderId.slice(0, 8)}: Driver +${shippingFee}`,
    );
  }

  /**
   * Settlement for online (card/Stripe) payments.
   * Customer paid via Stripe → driver did NOT collect cash.
   * Driver gets shipping x (1 - driverCommission%), merchant gets food x (1 - merchantCommission%), platform keeps all commissions.
   * NO debit from driver (money already went through Stripe).
   */
  async settleOnline(
    merchantId: string,
    driverId: string,
    orderId: string,
    foodTotal: number,
    shippingFee: number,
    discount = 0,
    discountFundedBy = "MERCHANT",
    serviceFee = 0,
  ): Promise<void> {
    foodTotal = Number(foodTotal);
    shippingFee = Number(shippingFee);
    discount = Number(discount);
    serviceFee = Number(serviceFee);
    const { merchantCommissionPct, driverCommissionPct } =
      this.getCommissionRates();
    const merchantCommissionAmount = Math.round(
      (foodTotal * merchantCommissionPct) / 100,
    );
    const driverCommissionAmount = Math.round(
      (shippingFee * driverCommissionPct) / 100,
    );
    const merchantDiscount = discountFundedBy === "MERCHANT" ? discount : 0;
    const platformDiscount = discountFundedBy === "PLATFORM" ? discount : 0;
    const driverShare = shippingFee - driverCommissionAmount;
    await this.credit(
      driverId,
      OwnerType.DRIVER,
      driverShare,
      `Phi ship don #${orderId.slice(0, 8)} (thanh toan online)`,
      "SETTLEMENT",
      orderId,
    );
    const merchantShare =
      foodTotal - merchantCommissionAmount - merchantDiscount;
    await this.credit(
      merchantId,
      OwnerType.MERCHANT,
      merchantShare,
      `Doanh thu don #${orderId.slice(0, 8)} (thanh toan online)`,
      "SETTLEMENT",
      orderId,
    );
    const platformShare =
      merchantCommissionAmount +
      driverCommissionAmount +
      serviceFee -
      platformDiscount;
    await this.credit(
      "PLATFORM_DEFAULT",
      OwnerType.PLATFORM,
      platformShare,
      `Phi nen tang don #${orderId.slice(0, 8)} (thanh toan online)`,
      "SETTLEMENT",
      orderId,
    );
    this.logger.log(
      `Online Settlement #${orderId.slice(0, 8)}: Food=${foodTotal}, Ship=${shippingFee}, Discount=${discount} (${discountFundedBy}), ` +
        `Driver +${driverShare} (${100 - driverCommissionPct}% ship), Merchant +${merchantShare} (${100 - merchantCommissionPct}%), Platform +${platformShare}`,
    );
  }

  private getCommissionRates(): {
    merchantCommissionPct: number;
    driverCommissionPct: number;
  } {
    const merchantCommissionPct = parseFloat(
      process.env.MERCHANT_COMMISSION_PERCENT || "25",
    );
    const driverCommissionPct = parseFloat(
      process.env.DRIVER_COMMISSION_PERCENT || "20",
    );
    return { merchantCommissionPct, driverCommissionPct };
  }

  // ═══════════════════════════════════════════════════════
  // Settlement: accrue (ghi nhận doanh thu chưa cộng vào ví)
  // ═══════════════════════════════════════════════════════

  async accrueRevenue(input: {
    merchantId: string;
    driverId: string;
    orderId: string;
    foodTotal: number;
    shippingFee: number;
    serviceFee?: number;
    discount?: number;
    discountFundedBy?: string;
    paymentMethod: string;
    deliveredAt?: string;
  }): Promise<{ orderId: string; entries: number; paymentMethod: string }> {
    const { merchantId, driverId, orderId, paymentMethod } = input;
    const foodTotal = Number(input.foodTotal) || 0;
    const shippingFee = Number(input.shippingFee) || 0;
    const serviceFee = Number(input.serviceFee) || 0;
    const discount = Number(input.discount) || 0;
    const discountFundedBy = input.discountFundedBy || "MERCHANT";

    // Idempotency: mỗi đơn chỉ ghi nhận doanh thu 1 lần.
    const existing = await this.settlementRepo.findEntriesByOrderId(orderId);
    if (existing.length > 0) {
      this.logger.warn(
        `Settlement entries đã tồn tại cho đơn ${orderId}, bỏ qua accrue`,
      );
      return { orderId, entries: existing.length, paymentMethod };
    }

    const { merchantCommissionPct, driverCommissionPct } =
      this.getCommissionRates();
    const merchantCommission = Math.round(
      (foodTotal * merchantCommissionPct) / 100,
    );
    const driverCommission = Math.round(
      (shippingFee * driverCommissionPct) / 100,
    );
    const merchantDiscount = discountFundedBy === "MERCHANT" ? discount : 0;
    const platformDiscount = discountFundedBy === "PLATFORM" ? discount : 0;
    const totalCustomerPaid = foodTotal + shippingFee + serviceFee - discount;
    const merchantShare = Math.max(
      0,
      foodTotal - merchantCommission - merchantDiscount,
    );
    const driverShippingIncome = Math.max(0, shippingFee - driverCommission);
    // Platform hấp thụ phần lẻ do làm tròn + khuyến mãi nền tảng tài trợ.
    const platformShare =
      totalCustomerPaid - merchantShare - driverShippingIncome;

    const isCod = paymentMethod === "CASH" || paymentMethod === "COD";
    const deliveredAt = input.deliveredAt
      ? new Date(input.deliveredAt)
      : new Date();

    const entries: Partial<SettlementEntryEntity>[] = [];
    const push = (
      ownerId: string,
      ownerType: string,
      amount: number,
      kind: string,
    ) => {
      if (amount <= 0) return;
      entries.push({
        id: randomUUID(),
        orderId,
        ownerId,
        ownerType,
        amount,
        kind,
        status: "PENDING",
        settlementBatchId: null,
        deliveredAt,
      });
    };

    if (isCod) {
      // COD: tài xế thu tiền mặt → trừ ngay tiền món phải nộp (không âm).
      const driverCodPayable =
        foodTotal - discount + driverCommission + serviceFee;
      if (driverCodPayable > 0 && driverId) {
        await this.debitForCOD(
          driverId,
          OwnerType.DRIVER,
          driverCodPayable,
          `COD: chuyển tiền món + phí nền tảng đơn #${orderId.slice(0, 8)}`,
          orderId,
        );
      }
      // Phí ship tài xế giữ tiền mặt: ghi REVENUE (không đổi balance).
      if (driverShippingIncome > 0 && driverId) {
        const driverWallet = await this.getOrCreateWallet(
          driverId,
          OwnerType.DRIVER,
        );
        await this.walletRepo.recordTransaction({
          id: randomUUID(),
          walletId: driverWallet.id,
          ownerId: driverId,
          ownerType: OwnerType.DRIVER,
          type: "REVENUE",
          amount: driverShippingIncome,
          balanceBefore: Number(driverWallet.balance),
          balanceAfter: Number(driverWallet.balance),
          description: `Doanh thu phí ship COD ${driverShippingIncome.toLocaleString("vi-VN")}đ (đã trừ ${driverCommissionPct}% phí) - Đơn #${orderId.slice(0, 8)}`,
          referenceType: "SETTLEMENT",
          referenceId: orderId,
        });
      }
      push(
        merchantId,
        OwnerType.MERCHANT,
        merchantShare,
        "MERCHANT_FOOD_REVENUE",
      );
      push(
        "PLATFORM_DEFAULT",
        OwnerType.PLATFORM,
        platformShare,
        "PLATFORM_COMMISSION",
      );
    } else {
      push(
        merchantId,
        OwnerType.MERCHANT,
        merchantShare,
        "MERCHANT_FOOD_REVENUE",
      );
      if (driverId) {
        push(
          driverId,
          OwnerType.DRIVER,
          driverShippingIncome,
          "DRIVER_SHIPPING_FEE",
        );
      }
      push(
        "PLATFORM_DEFAULT",
        OwnerType.PLATFORM,
        platformShare,
        "PLATFORM_COMMISSION",
      );
    }

    if (platformShare < 0) {
      this.logger.warn(
        `Platform share âm ${platformShare} cho đơn ${orderId}: khuyến mãi nền tảng vượt hoa hồng, cần xem xét`,
      );
    }

    await this.settlementRepo.insertEntries(entries);
    this.logger.log(
      `Accrue đơn ${orderId}: ${entries.length} entries (${paymentMethod})`,
    );
    return { orderId, entries: entries.length, paymentMethod };
  }

  async settleDaily(options?: {
    periodStart?: string | Date;
    periodEnd?: string | Date;
    triggeredBy?: string;
    dryRun?: boolean;
  }): Promise<any> {
    const opts = options || {};
    const window = this.computeSettlementWindow(
      opts.periodStart,
      opts.periodEnd,
    );

    if (opts.dryRun) {
      return this.previewSettlement(window);
    }

    let batch = await this.settlementRepo.findBatchByPeriod(
      window.periodStart,
      window.periodEnd,
    );
    if (batch && batch.status === "SUCCESS") {
      return {
        batchId: batch.id,
        status: "ALREADY_SETTLED",
        periodStart: window.periodStart,
        periodEnd: window.periodEnd,
      };
    }
    if (!batch) {
      batch = await this.settlementRepo.saveBatch({
        id: randomUUID(),
        periodStart: window.periodStart,
        periodEnd: window.periodEnd,
        status: "PROCESSING",
        triggeredBy: opts.triggeredBy || "CRON",
      });
    }
    const batchId = batch.id;

    try {
      const entries = await this.settlementRepo.findPendingByPeriod(
        window.periodStart,
        window.periodEnd,
      );

      const groups = new Map<
        string,
        { ownerId: string; ownerType: string; gross: number }
      >();
      for (const e of entries) {
        const key = `${e.ownerType}:${e.ownerId}`;
        const g = groups.get(key) ?? {
          ownerId: e.ownerId,
          ownerType: e.ownerType,
          gross: 0,
        };
        g.gross += Number(e.amount);
        groups.set(key, g);
      }

      const groupResults: any[] = [];
      let totalGross = 0;
      let totalClawback = 0;
      let totalCredit = 0;

      for (const g of groups.values()) {
        totalGross += g.gross;
        const already = await this.settlementRepo.hasSettlementCredit(
          g.ownerId,
          g.ownerType,
          batchId,
        );
        let clawbackApplied = 0;
        if (!already) {
          const openClawbacks = await this.settlementRepo.findOpenClawbacks(
            g.ownerId,
            g.ownerType,
          );
          let remainingToClaw = g.gross;
          for (const c of openClawbacks) {
            const take = Math.min(Number(c.remainingAmount), remainingToClaw);
            if (take <= 0) break;
            await this.settlementRepo.recordDeduction({
              id: randomUUID(),
              clawbackId: c.id,
              settlementBatchId: batchId,
              amount: take,
            });
            await this.settlementRepo.reduceClawback(c.id, take);
            clawbackApplied += take;
            remainingToClaw -= take;
          }
          const net = g.gross - clawbackApplied;
          if (net > 0) {
            await this.credit(
              g.ownerId,
              g.ownerType as OwnerType,
              net,
              `Quyết toán ngày ${window.periodStart.toISOString().slice(0, 10)}`,
              "SETTLEMENT",
              batchId,
            );
          }
        }
        totalClawback += clawbackApplied;
        const net = g.gross - clawbackApplied;
        if (net > 0) totalCredit += net;
        groupResults.push({
          ownerId: g.ownerId,
          ownerType: g.ownerType,
          gross: g.gross,
          clawback: clawbackApplied,
          netCredit: net,
        });
      }

      await this.settlementRepo.markEntriesSettled(
        entries.map((e) => e.id),
        batchId,
      );

      const sumBy = (t: string) =>
        groupResults
          .filter((x) => x.ownerType === t)
          .reduce((s, x) => s + x.netCredit, 0);

      const reconciled = totalCredit === totalGross - totalClawback;
      const finalStatus = reconciled ? "SUCCESS" : "NEEDS_REVIEW";
      await this.settlementRepo.saveBatch({
        id: batchId,
        status: finalStatus,
        totalDriverPayout: sumBy("DRIVER"),
        totalMerchantPayout: sumBy("MERCHANT"),
        totalPlatformPayout: sumBy("PLATFORM"),
      });

      this.logger.log(
        `Quyết toán ${window.periodStart.toISOString()} hoàn tất: credit=${totalCredit}, clawback=${totalClawback}, reconciled=${reconciled}`,
      );

      return {
        batchId,
        status: finalStatus,
        periodStart: window.periodStart,
        periodEnd: window.periodEnd,
        groups: groupResults,
        summary: { totalGross, totalClawback, totalCredit, reconciled },
        triggeredBy: opts.triggeredBy || "CRON",
      };
    } catch (err: any) {
      this.logger.error(`Quyết toán lỗi: ${err.message}`);
      await this.settlementRepo
        .saveBatch({
          id: batchId,
          status: "FAILED",
          failureReason: err.message,
        })
        .catch(() => undefined);
      throw err;
    }
  }

  private async previewSettlement(window: {
    periodStart: Date;
    periodEnd: Date;
  }): Promise<any> {
    const entries = await this.settlementRepo.findPendingByPeriod(
      window.periodStart,
      window.periodEnd,
    );
    const groups = new Map<
      string,
      { ownerId: string; ownerType: string; gross: number }
    >();
    for (const e of entries) {
      const key = `${e.ownerType}:${e.ownerId}`;
      const g = groups.get(key) ?? {
        ownerId: e.ownerId,
        ownerType: e.ownerType,
        gross: 0,
      };
      g.gross += Number(e.amount);
      groups.set(key, g);
    }
    const groupResults: any[] = [];
    let totalGross = 0;
    let totalClawback = 0;
    let totalCredit = 0;
    for (const g of groups.values()) {
      totalGross += g.gross;
      let clawbackApplied = 0;
      const openClawbacks = await this.settlementRepo.findOpenClawbacks(
        g.ownerId,
        g.ownerType,
      );
      let remainingToClaw = g.gross;
      for (const c of openClawbacks) {
        const take = Math.min(Number(c.remainingAmount), remainingToClaw);
        clawbackApplied += take;
        remainingToClaw -= take;
      }
      totalClawback += clawbackApplied;
      const net = g.gross - clawbackApplied;
      if (net > 0) totalCredit += net;
      groupResults.push({
        ownerId: g.ownerId,
        ownerType: g.ownerType,
        gross: g.gross,
        clawback: clawbackApplied,
        netCredit: net,
      });
    }
    return {
      batchId: null,
      status: "DRY_RUN",
      periodStart: window.periodStart,
      periodEnd: window.periodEnd,
      groups: groupResults,
      summary: {
        totalGross,
        totalClawback,
        totalCredit,
        reconciled: totalCredit === totalGross - totalClawback,
      },
    };
  }

  private computeSettlementWindow(
    periodStart?: string | Date,
    periodEnd?: string | Date,
  ): { periodStart: Date; periodEnd: Date } {
    if (periodStart && periodEnd) {
      return {
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
      };
    }
    // Mốc 23:00 Asia/Ho_Chi_Minh (UTC+7) = 16:00 UTC.
    const now = new Date();
    const end = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        16,
        0,
        0,
        0,
      ),
    );
    const start = new Date(end.getTime() - 24 * 3600 * 1000);
    return { periodStart: start, periodEnd: end };
  }

  async getPendingSettlement(ownerId: string, ownerType: string) {
    const entries = await this.settlementRepo.findPendingForOwner(
      ownerId,
      ownerType,
    );
    const totalPending = entries.reduce((s, e) => s + Number(e.amount), 0);
    return {
      ownerId,
      ownerType,
      totalPending,
      entries: entries.map((e) => ({
        id: e.id,
        orderId: e.orderId,
        kind: e.kind,
        amount: Number(e.amount),
        status: e.status,
        deliveredAt: e.deliveredAt,
        createdAt: e.createdAt,
      })),
    };
  }

  async getSettlementBatches(from?: string, to?: string, status?: string) {
    const batches = await this.settlementRepo.listBatches(
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
      status,
    );
    return batches.map((b) => ({
      id: b.id,
      status: b.status,
      periodStart: b.periodStart,
      periodEnd: b.periodEnd,
      totalDriverPayout: Number(b.totalDriverPayout),
      totalMerchantPayout: Number(b.totalMerchantPayout),
      totalPlatformPayout: Number(b.totalPlatformPayout),
      triggeredBy: b.triggeredBy,
      failureReason: b.failureReason,
      createdAt: b.createdAt,
    }));
  }

  async getSettlementBatchDetail(id: string) {
    const batch = await this.settlementRepo.findBatchById(id);
    if (!batch) throw new Error("Settlement batch không tồn tại");
    return {
      id: batch.id,
      status: batch.status,
      periodStart: batch.periodStart,
      periodEnd: batch.periodEnd,
      totalDriverPayout: Number(batch.totalDriverPayout),
      totalMerchantPayout: Number(batch.totalMerchantPayout),
      totalPlatformPayout: Number(batch.totalPlatformPayout),
      triggeredBy: batch.triggeredBy,
      failureReason: batch.failureReason,
      createdAt: batch.createdAt,
    };
  }

  async retryBatch(id: string) {
    const batch = await this.settlementRepo.findBatchById(id);
    if (!batch) throw new Error("Settlement batch không tồn tại");
    if (batch.status === "SUCCESS") {
      throw new Error("Batch đã SUCCESS, không cần retry");
    }
    return this.settleDaily({
      periodStart: batch.periodStart,
      periodEnd: batch.periodEnd,
      triggeredBy: "RETRY",
    });
  }

  async createClawback(input: {
    ownerId: string;
    ownerType: string;
    sourceOrderId?: string;
    sourceBatchId?: string;
    refundId?: string;
    amount: number;
  }) {
    const amount = Number(input.amount);
    if (amount <= 0) throw new Error("Số tiền clawback phải lớn hơn 0");
    const id = randomUUID();
    await this.settlementRepo.createClawback({
      id,
      ownerId: input.ownerId,
      ownerType: input.ownerType,
      sourceOrderId: input.sourceOrderId || null,
      sourceBatchId: input.sourceBatchId || null,
      refundId: input.refundId || null,
      originalAmount: amount,
      remainingAmount: amount,
      status: "OPEN",
    });
    this.logger.log(
      `Tạo clawback ${id}: ${input.ownerType}:${input.ownerId} nợ ${amount}`,
    );
    return { id, ownerId: input.ownerId, ownerType: input.ownerType, amount };
  }

  async getOpenClawback(ownerId: string, ownerType: string) {
    const total = await this.settlementRepo.sumOpenClawback(ownerId, ownerType);
    const items = await this.settlementRepo.findOpenClawbacks(
      ownerId,
      ownerType,
    );
    return {
      ownerId,
      ownerType,
      totalOpenClawback: total,
      items: items.map((c) => ({
        id: c.id,
        sourceOrderId: c.sourceOrderId,
        sourceBatchId: c.sourceBatchId,
        refundId: c.refundId,
        originalAmount: Number(c.originalAmount),
        remainingAmount: Number(c.remainingAmount),
        status: c.status,
      })),
    };
  }

  async getAdminTransactions(params: {
    skip: number;
    take: number;
    type?: string;
    ownerType?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }) {
    const { items, total } =
      await this.walletRepo.findTransactionsPaginated(params);
    const { totalTopupVolume, totalSettlementVolume } =
      await this.walletRepo.getStatsSummary(params.startDate, params.endDate);
    return {
      items,
      total,
      summary: { totalTopupVolume, totalSettlementVolume },
    };
  }

  async getWalletStats() {
    const allWallets = await this.walletRepo.findAllWallets();
    const totalBalance = allWallets.reduce(
      (sum, w) => sum + Number(w.balance),
      0,
    );
    const balanceByType: Record<string, number> = {};
    for (const w of allWallets) {
      balanceByType[w.ownerType] =
        (balanceByType[w.ownerType] || 0) + Number(w.balance);
    }
    return { totalWallets: allWallets.length, totalBalance, balanceByType };
  }

  async getEarnings(
    ownerId: string,
    ownerType: string,
    period: string,
  ): Promise<any> {
    const { startDate, endDate } = this.periodToRange(period);
    const stats = await this.walletRepo.getEarningsByOwner(
      ownerId,
      ownerType,
      startDate,
      endDate,
    );
    const totalOrders = stats.totalOrders;
    return {
      ownerId,
      ownerType,
      period,
      totalEarnings: stats.totalEarnings,
      totalOrders,
      averagePerOrder:
        totalOrders > 0
          ? Math.round((stats.totalEarnings / totalOrders) * 100) / 100
          : 0,
      earningsByDay: stats.earningsByDay,
    };
  }

  private periodToRange(period: string): {
    startDate?: string;
    endDate?: string;
  } {
    const endDate = new Date().toISOString();
    let startDate: string | undefined;
    switch (period) {
      case "week":
        startDate = new Date(Date.now() - 7 * 86400000).toISOString();
        break;
      case "month":
        startDate = new Date(Date.now() - 30 * 86400000).toISOString();
        break;
      case "today":
      default:
        startDate = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
        break;
    }
    return { startDate, endDate };
  }
}
