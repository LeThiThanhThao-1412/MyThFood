import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { Wallet, OwnerType } from "../domain/wallet.aggregate";
import { WalletEntity } from "../infrastructure/wallet.entity";
import { WalletTransactionEntity } from "../infrastructure/wallet-transaction.entity";
import { WalletMapper } from "../infrastructure/wallet.mapper";

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  // Business rules
  private readonly MIN_WITHDRAW_DRIVER = 50000; // 50k VND
  private readonly MIN_WITHDRAW_MERCHANT = 100000; // 100k VND
  private readonly MAX_WITHDRAWS_PER_DAY = 3;

  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(WalletTransactionEntity)
    private readonly txRepo: Repository<WalletTransactionEntity>,
  ) {}

  // ─── Get or Create ──────────────────────────────────────
  async getOrCreateWallet(ownerId: string, ownerType: OwnerType): Promise<Wallet> {
    const existing = await this.walletRepo.findOne({ where: { ownerId, ownerType } });
    if (existing) {
      return WalletMapper.toDomain(existing);
    }
    const wallet = Wallet.create({ ownerId, ownerType });
    const entity = WalletMapper.toPersistence(wallet);
    await this.walletRepo.save(entity);
    this.logger.log(`Created wallet for ${ownerType}:${ownerId}`);
    return wallet;
  }

  async getBalance(ownerId: string, ownerType: OwnerType): Promise<number> {
    const wallet = await this.getOrCreateWallet(ownerId, ownerType);
    return wallet.walletBalance;
  }

  // ─── Credit (top-up / settlement) ───────────────────────
  async credit(
    ownerId: string,
    ownerType: OwnerType,
    amount: number,
    description: string,
    orderId?: string,
  ): Promise<Wallet> {
    const wallet = await this.getOrCreateWallet(ownerId, ownerType);
    wallet.credit(amount);

    const entity = WalletMapper.toPersistence(wallet);
    await this.walletRepo.save(entity);

    // Record transaction
    await this.txRepo.save({
      id: randomUUID(),
      walletId: wallet.id.toString(),
      ownerId,
      ownerType,
      type: "CREDIT",
      amount,
      balanceBefore: wallet.walletBalance - amount,
      balanceAfter: wallet.walletBalance,
      description,
      orderId: orderId || null,
      createdAt: new Date(),
    } as any);

    this.logger.log(`Credit ${ownerType}:${ownerId} +${amount} VND - ${description}`);
    return wallet;
  }

  // ─── Debit (withdraw) ───────────────────────────────────
  async debit(
    ownerId: string,
    ownerType: OwnerType,
    amount: number,
    description: string,
  ): Promise<Wallet> {
    const wallet = await this.getOrCreateWallet(ownerId, ownerType);

    // Business rule checks
    const minWithdraw = ownerType === OwnerType.MERCHANT ? this.MIN_WITHDRAW_MERCHANT : this.MIN_WITHDRAW_DRIVER;
    if (amount < minWithdraw) {
      throw new Error(`Minimum withdraw: ${minWithdraw.toLocaleString("vi-VN")} VND`);
    }

    if (ownerType === OwnerType.DRIVER) {
      // Check daily withdraw limit
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayWithdraws = await this.txRepo.count({
        where: {
          ownerId,
          type: "DEBIT",
          createdAt: { $gte: today } as any,
        },
      });
      if (todayWithdraws >= this.MAX_WITHDRAWS_PER_DAY) {
        throw new Error(`Max ${this.MAX_WITHDRAWS_PER_DAY} withdraws per day`);
      }
    }

    wallet.debit(amount);
    const entity = WalletMapper.toPersistence(wallet);
    await this.walletRepo.save(entity);

    await this.txRepo.save({
      id: randomUUID(),
      walletId: wallet.id.toString(),
      ownerId,
      ownerType,
      type: "DEBIT",
      amount,
      balanceBefore: wallet.walletBalance + amount,
      balanceAfter: wallet.walletBalance,
      description,
      createdAt: new Date(),
    } as any);

    this.logger.log(`Debit ${ownerType}:${ownerId} -${amount} VND - ${description}`);
    return wallet;
  }

  // ─── Transactions ───────────────────────────────────────
  async getTransactions(ownerId: string, ownerType: OwnerType) {
    return this.txRepo.find({
      where: { ownerId, ownerType },
      order: { createdAt: "DESC" },
      take: 50,
    });
  }

  // ─── Settlement ──────────────────────────────────────────
  async settleOrder(
    merchantId: string,
    driverId: string,
    orderId: string,
    foodTotal: number,
    shippingFee: number,
  ): Promise<void> {
    // Merchant: food x 70% - 10% VAT
    const merchantShare = Math.round(foodTotal * 0.7 * 0.9);
    // Driver: shipping fee x 75%
    const driverShare = Math.round(shippingFee * 0.75);

    await this.credit(merchantId, OwnerType.MERCHANT, merchantShare, `Doanh thu đơn #${orderId.slice(0, 8)}`, orderId);
    await this.credit(driverId, OwnerType.DRIVER, driverShare, `Phí ship đơn #${orderId.slice(0, 8)}`, orderId);

    this.logger.log(
      `Settlement #${orderId.slice(0, 8)}: Merchant +${merchantShare} VND, Driver +${driverShare} VND`,
    );
  }
}