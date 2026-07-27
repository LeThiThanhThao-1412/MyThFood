import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { WalletRepository } from "../infrastructure/wallet.repository";
import { OwnerType } from "../domain/wallet.aggregate";

/**
 * FIX #8: WalletService now depends on WalletRepository which encapsulates TypeORM.
 * No direct TypeORM Repository injection - clean Domain-driven architecture.
 * FIX #9: Optimistic locking via @VersionColumn on WalletEntity prevents race conditions.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  static readonly MIN_COD_BALANCE = 2000000;
  static readonly MIN_WITHDRAW = 50000;
  static readonly MAX_WITHDRAWS_PER_DAY = 1;

  constructor(private readonly walletRepo: WalletRepository) {}

  async getOrCreateWallet(ownerId: string, ownerType: OwnerType) {
    const result = await this.walletRepo.findByOwnerOrCreate(ownerId, ownerType);
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
    const balanceBefore = Number(entity.balance);
    entity.balance = balanceBefore + amount;
    await this.walletRepo.save(entity);

    await this.walletRepo.recordTransaction({
      id: randomUUID(),
      walletId: entity.id,
      ownerId,
      ownerType,
      type: "CREDIT",
      amount,
      balanceBefore,
      balanceAfter: Number(entity.balance),
      description,
      referenceType,
      referenceId,
    });

    this.logger.log(`Credit ${ownerType}:${ownerId} +${amount} VND - ${description}`);
    return { id: entity.id, balance: Number(entity.balance) };
  }

  async debit(
    ownerId: string,
    ownerType: OwnerType,
    amount: number,
    description: string,
  ): Promise<{ id: string; balance: number }> {
    const entity = await this.getOrCreateWallet(ownerId, ownerType);

    if (amount < WalletService.MIN_WITHDRAW) {
      throw new Error(`Minimum withdraw: ${WalletService.MIN_WITHDRAW.toLocaleString("vi-VN")} VND`);
    }

    if (ownerType === OwnerType.DRIVER) {
      const count = await this.walletRepo.countDailyWithdraws(ownerId);
      if (count >= WalletService.MAX_WITHDRAWS_PER_DAY) {
        throw new Error(`Max ${WalletService.MAX_WITHDRAWS_PER_DAY} withdrawal per day`);
      }

      const balanceAfter = Number(entity.balance) - amount;
      if (balanceAfter < WalletService.MIN_COD_BALANCE) {
        throw new Error(
          `Must maintain minimum ${WalletService.MIN_COD_BALANCE.toLocaleString("vi-VN")} VND balance`,
        );
      }
    }

    const balanceBefore = Number(entity.balance);
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

    this.logger.log(`Debit ${ownerType}:${ownerId} -${amount} VND - ${description}`);
    return { id: entity.id, balance: Number(entity.balance) };
  }

  async canAcceptCOD(driverId: string) {
    const balance = await this.getBalance(driverId, OwnerType.DRIVER);
    return {
      eligible: balance >= WalletService.MIN_COD_BALANCE,
      balance,
      required: WalletService.MIN_COD_BALANCE,
    };
  }

  async getTransactions(ownerId: string, ownerType: OwnerType) {
    return this.walletRepo.getTransactions(ownerId, ownerType);
  }

  async handleStripeTopup(ownerId: string, amount: number): Promise<void> {
    await this.credit(ownerId, OwnerType.DRIVER, amount, "Nạp tiền qua Stripe", "TOPUP");
  }

  async settleCOD(
    merchantId: string,
    driverId: string,
    orderId: string,
    foodTotal: number,
    shippingFee: number,
  ): Promise<void> {
    await this.credit(driverId, OwnerType.DRIVER, shippingFee, `Phí ship COD đơn #${orderId.slice(0, 8)}`, "SETTLEMENT", orderId);
    const merchantShare = Math.round(foodTotal * 0.7);
    await this.credit(merchantId, OwnerType.MERCHANT, merchantShare, `Doanh thu đơn #${orderId.slice(0, 8)}`, "SETTLEMENT", orderId);
    const platformShare = Math.round(foodTotal * 0.2);
    await this.credit("PLATFORM_DEFAULT", OwnerType.PLATFORM, platformShare, `Phí nền tảng đơn #${orderId.slice(0, 8)}`, "SETTLEMENT", orderId);
    const taxShare = Math.round(foodTotal * 0.1);
    await this.credit("TAX_DEFAULT", OwnerType.TAX, taxShare, `Thuế đơn #${orderId.slice(0, 8)}`, "SETTLEMENT", orderId);
    this.logger.log(`COD Settlement #${orderId.slice(0, 8)}: Food ${foodTotal}, Ship ${shippingFee}`);
  }

  async settleRegular(driverId: string, orderId: string, shippingFee: number): Promise<void> {
    await this.credit(driverId, OwnerType.DRIVER, shippingFee, `Phí ship đơn #${orderId.slice(0, 8)}`, "SETTLEMENT", orderId);
    this.logger.log(`Regular Settlement #${orderId.slice(0, 8)}: Driver +${shippingFee}`);
  }

  async getAdminTransactions(params: {
    skip: number; take: number;
    type?: string; ownerType?: string;
    startDate?: string; endDate?: string; search?: string;
  }) {
    const { items, total } = await this.walletRepo.findTransactionsPaginated(params);
    const { totalTopupVolume, totalSettlementVolume } = await this.walletRepo.getStatsSummary(params.startDate, params.endDate);
    return {
      items, total,
      summary: { totalTopupVolume, totalSettlementVolume },
    };
  }

  async getWalletStats() {
    const allWallets = await this.walletRepo.findAllWallets();
    const totalBalance = allWallets.reduce((sum, w) => sum + Number(w.balance), 0);
    const balanceByType: Record<string, number> = {};
    for (const w of allWallets) {
      balanceByType[w.ownerType] = (balanceByType[w.ownerType] || 0) + Number(w.balance);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return { totalWallets: allWallets.length, totalBalance, balanceByType };
  }
}