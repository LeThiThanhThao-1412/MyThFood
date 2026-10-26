import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { WalletRepository } from "../infrastructure/wallet.repository";
import { SettlementRepository } from "../infrastructure/settlement.repository";
import { SettlementEntryEntity } from "../infrastructure/settlement-entry.entity";
import { OwnerType } from "../domain/wallet.aggregate";
import {
  CaseCompensationInput,
  CaseCompensationResult,
  FailureSettlementInput,
  FailureSettlementResult,
} from "../domain/settlement.types";

/**
 * Tuỳ chọn cho `WalletService.credit`.
 */
export interface CreditOptions {
  /**
   * Bỏ qua bước thu hồi nợ tự động. Dùng khi luồng đã tự khấu trừ nợ trước khi
   * credit (vd `recoverDebts` chuyển tiền về quỹ nền tảng) để không trừ hai lần.
   */
  skipRecovery?: boolean;
}

export interface CreditResult {
  id: string;
  balance: number;
  /** Số nợ clawback đã thu hồi ngay trong lần credit này. */
  recovered?: number;
  /** Số nợ còn lại sau khi thu hồi. */
  debtRemaining?: number;
}

/** Nguồn khấu trừ nợ — ghi vào `clawback_deductions.source`. */
export type DebtRecoverySource = "AUTO_CREDIT" | "AUTO_SWEEP" | "MANUAL";

export interface DebtRecoveryResult {
  ownerId: string;
  ownerType: string;
  /** Tổng tiền đã khấu trừ khỏi ví trong lần chạy này. */
  recovered: number;
  /** Số nợ còn lại sau khi khấu trừ. */
  debtRemaining: number;
  balance: number;
  heldBalance: number;
  availableBalance: number;
  clawbacks: { id: string; amount: number; remaining: number }[];
  /** Lý do không khấu trừ (nếu có) — phục vụ log/audit. */
  skipped?:
    | "EXCLUDED"
    | "DISABLED"
    | "NO_DEBT"
    | "NOT_COVERED"
    | "NO_AVAILABLE";
}

/**
 * FIX #8: WalletService now depends on WalletRepository which encapsulates TypeORM.
 * No direct TypeORM Repository injection - clean Domain-driven architecture.
 * FIX #9: Optimistic locking via @VersionColumn on WalletEntity prevents race conditions.
 * FIX #PHASE1-COD: COD eligibility now checks balance >= 2M AND availableBalance > orderValue.
 * Uses hold/release pattern to reserve funds for active COD orders.
 * FIX DEBT-RECOVERY: nợ clawback được thu hồi ngay khi ví đủ tiền (không đợi 23:00).
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  static readonly MIN_COD_BALANCE = 2000000;
  static readonly MIN_WITHDRAW = 50000;
  static readonly MIN_CONSUMER_WITHDRAW = 10000;
  static readonly MAX_WITHDRAWS_PER_DAY = 1;

  /**
   * Khoá tuần tự theo ví cho bước thu hồi nợ — tránh hai luồng credit đồng
   * thời cùng đọc số dư cũ rồi cùng trừ (optimistic lock sẽ chặn save, nhưng
   * khoá này giúp không phải retry và không lệch sổ).
   */
  private readonly recoveryLocks = new Map<string, Promise<unknown>>();

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
    opts?: CreditOptions,
  ): Promise<CreditResult> {
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

    // Thu hồi nợ ngay khi ví đã đủ tiền ("đủ là trừ", không đợi 23:00).
    if (opts?.skipRecovery) {
      return { id: entity.id, balance: Number(entity.balance) };
    }
    const recovery = await this.recoverDebts(ownerId, ownerType, {
      referenceType,
      referenceId,
      source: "AUTO_CREDIT",
    });
    return {
      id: entity.id,
      balance: recovery.balance,
      recovered: recovery.recovered,
      debtRemaining: recovery.debtRemaining,
    };
  }

  /**
   * Chế độ thu hồi nợ:
   *  - `FULL_WHEN_COVERED` (mặc định): chỉ trừ khi `available >= tổng nợ`
   *    ⇒ "ví đủ tiền là trừ ngay" đúng một lần, không trừ lắt nhắt.
   *  - `PARTIAL_ALWAYS`: mỗi lần có tiền vào trừ tối đa phần có thể.
   *  - `OFF`: tắt hoàn toàn (nợ chờ netting 23:00).
   */
  private getDebtRecoveryMode():
    | "FULL_WHEN_COVERED"
    | "PARTIAL_ALWAYS"
    | "OFF" {
    const raw = String(
      process.env.DEBT_RECOVERY_MODE || "FULL_WHEN_COVERED",
    ).toUpperCase();
    if (raw === "OFF" || raw === "DISABLED") return "OFF";
    if (raw === "PARTIAL" || raw === "PARTIAL_ALWAYS") return "PARTIAL_ALWAYS";
    return "FULL_WHEN_COVERED";
  }

  private async withRecoveryLock<T>(
    key: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const prev = this.recoveryLocks.get(key);
    if (prev) {
      // Chờ lượt trước kết thúc rồi mới đọc lại số dư/nợ mới nhất.
      await prev.catch(() => undefined);
    }
    const task = fn();
    this.recoveryLocks.set(key, task as unknown as Promise<unknown>);
    try {
      return await task;
    } finally {
      if (
        this.recoveryLocks.get(key) === (task as unknown as Promise<unknown>)
      ) {
        this.recoveryLocks.delete(key);
      }
    }
  }

  /**
   * Thu hồi nợ clawback từ số dư ví (FIX DEBT-RECOVERY).
   *
   * Nguyên tắc:
   *  - Chỉ dùng phần **khả dụng** = `balance - heldBalance`; tiền đang giữ cho
   *    đơn COD chưa nộp thì không được đụng vào.
   *  - `FULL_WHEN_COVERED`: khả dụng >= tổng nợ thì trừ **toàn bộ** trong một
   *    lần, FIFO khoản cũ trước; chưa đủ thì để nguyên (phần đang là nợ bị
   *    chặn rút/tiêu ở `debit()` / `pay()`).
   *  - Bút toán: DEBIT `CLAWBACK_RECOVERY` ở ví bên nợ + CREDIT `DEBT_RECOVERY`
   *    ở `PLATFORM_DEFAULT` ⇒ tiền phạt không "bốc hơi", sổ vẫn cân.
   *  - Idempotent theo `clawback_deductions (clawbackId, referenceType,
   *    referenceId)` + `UPDATE ... WHERE remainingAmount >= take`.
   */
  async recoverDebts(
    ownerId: string,
    ownerType: OwnerType,
    trigger?: {
      referenceType?: string | null;
      referenceId?: string | null;
      source?: DebtRecoverySource;
    },
  ): Promise<DebtRecoveryResult> {
    const key = `${ownerType}:${ownerId}`;
    return this.withRecoveryLock(key, () =>
      this.recoverDebtsUnlocked(ownerId, ownerType, trigger),
    );
  }

  private async recoverDebtsUnlocked(
    ownerId: string,
    ownerType: OwnerType,
    trigger?: {
      referenceType?: string | null;
      referenceId?: string | null;
      source?: DebtRecoverySource;
    },
  ): Promise<DebtRecoveryResult> {
    const source: DebtRecoverySource = trigger?.source ?? "AUTO_CREDIT";
    const wallet = await this.getOrCreateWallet(ownerId, ownerType);
    const balance = Number(wallet.balance);
    const heldBalance = Number(wallet.heldBalance || 0);
    const base: DebtRecoveryResult = {
      ownerId,
      ownerType: String(ownerType),
      recovered: 0,
      debtRemaining: 0,
      balance,
      heldBalance,
      availableBalance: balance - heldBalance,
      clawbacks: [],
    };

    // Ví nền tảng / quỹ dự phòng / ví thuế không bao giờ là bên nợ.
    if (
      ownerType === OwnerType.PLATFORM ||
      ownerType === OwnerType.TAX ||
      !ownerType
    ) {
      return { ...base, skipped: "EXCLUDED" };
    }

    const debt = await this.settlementRepo.sumOpenClawback(ownerId, ownerType);
    if (debt <= 0) return { ...base, skipped: "NO_DEBT" };

    const mode = this.getDebtRecoveryMode();
    if (mode === "OFF") {
      return { ...base, debtRemaining: debt, skipped: "DISABLED" };
    }

    const available = base.availableBalance;
    if (available <= 0) {
      return { ...base, debtRemaining: debt, skipped: "NO_AVAILABLE" };
    }
    if (mode === "FULL_WHEN_COVERED" && available < debt) {
      return { ...base, debtRemaining: debt, skipped: "NOT_COVERED" };
    }

    const budget = Math.min(available, debt);
    if (budget <= 0) {
      return { ...base, debtRemaining: debt, skipped: "NO_AVAILABLE" };
    }

    // 1) Trừ ví trước: nếu ví bị luồng khác sửa (optimistic lock) thì dừng,
    //    chưa đụng vào sổ nợ ⇒ không bao giờ "trừ nợ mà không trừ tiền".
    const balanceBefore = Number(wallet.balance);
    wallet.balance = balanceBefore - budget;
    try {
      await this.walletRepo.save(wallet);
    } catch (err: any) {
      this.logger.warn(
        `Thu hồi nợ bỏ qua ${ownerType}:${ownerId} — ví vừa thay đổi (${err.message})`,
      );
      return { ...base, debtRemaining: debt };
    }
    const balanceAfterDebit = Number(wallet.balance);

    const debitTxId = randomUUID();
    const triggerLabel = trigger?.referenceId
      ? ` (nguồn ${trigger.referenceType || "?"}:${trigger.referenceId})`
      : "";
    await this.walletRepo.recordTransaction({
      id: debitTxId,
      walletId: wallet.id,
      ownerId,
      ownerType,
      type: "DEBIT",
      amount: budget,
      balanceBefore,
      balanceAfter: balanceAfterDebit,
      description:
        (source === "AUTO_SWEEP"
          ? `Thu hồi nợ tự động (quét định kỳ) ${budget.toLocaleString("vi-VN")} VND`
          : `Thu hồi nợ tự động từ tiền vào ví ${budget.toLocaleString("vi-VN")} VND`) +
        triggerLabel,
      // Cùng `referenceId` với CREDIT `DEBT_RECOVERY` ở quỹ nền tảng để đối
      // soát 1-1 (script verify_money_invariants kiểm tra cặp này).
      referenceType: "CLAWBACK_RECOVERY",
      referenceId: debitTxId,
    });

    // 2) Phân bổ FIFO vào từng khoản nợ (khoản cũ trước).
    const openClawbacks = await this.settlementRepo.findOpenClawbacks(
      ownerId,
      ownerType,
    );
    const applied: { id: string; amount: number; remaining: number }[] = [];
    let left = budget;
    for (const c of openClawbacks) {
      if (left <= 0) break;
      const take = Math.min(Number(c.remainingAmount), left);
      if (take <= 0) continue;

      const remaining = await this.settlementRepo.reduceClawback(c.id, take);
      if (remaining === null) {
        // Khoản nợ vừa được luồng khác thu hết ⇒ bỏ qua; phần tiền tương ứng
        // sẽ được hoàn lại ví ở bước 4.
        continue;
      }
      let deductionFailed = false;
      try {
        await this.settlementRepo.recordDeduction({
          id: randomUUID(),
          clawbackId: c.id,
          settlementBatchId: null,
          amount: take,
          source,
          referenceType: trigger?.referenceType || "DEBT_RECOVERY",
          referenceId: trigger?.referenceId || debitTxId,
        });
      } catch (err: any) {
        // Trùng khoá (cùng giao dịch tiền vào đã ghi cho khoản nợ này) ⇒ vẫn
        // tính là đã thu vì nợ đã bị trừ; tiền vẫn được chuyển về nền tảng.
        deductionFailed = true;
        this.logger.warn(
          `Ghi clawback_deductions bỏ qua cho ${c.id}: ${err.message}`,
        );
      }
      applied.push({ id: c.id, amount: take, remaining });
      left -= take;
    }

    const appliedTotal = applied.reduce((s, a) => s + a.amount, 0);

    // 3) Tiền thu hồi được chuyển về quỹ nền tảng — không bốc hơi.
    if (appliedTotal > 0) {
      await this.credit(
        "PLATFORM_DEFAULT",
        OwnerType.PLATFORM,
        appliedTotal,
        `Thu hồi nợ clawback ${ownerType}:${ownerId}`,
        "DEBT_RECOVERY",
        debitTxId,
        { skipRecovery: true },
      );
    }

    // 4) Hoàn lại ví phần không phân bổ được (nợ đã bị luồng khác thu) để số
    //    dư luôn khớp sổ (invariant: balance = Σ CREDIT − Σ DEBIT).
    let balanceAfter = balanceAfterDebit;
    const unallocated = budget - appliedTotal;
    if (unallocated > 0) {
      wallet.balance = balanceAfterDebit + unallocated;
      await this.walletRepo.save(wallet);
      balanceAfter = Number(wallet.balance);
      await this.walletRepo.recordTransaction({
        id: randomUUID(),
        walletId: wallet.id,
        ownerId,
        ownerType,
        type: "CREDIT",
        amount: unallocated,
        balanceBefore: balanceAfterDebit,
        balanceAfter,
        description: `Hoàn lại phần nợ không phân bổ được ${unallocated.toLocaleString("vi-VN")} VND`,
        referenceType: "CLAWBACK_RECOVERY_REVERT",
        referenceId: debitTxId,
      });
    }

    const debtRemaining = Math.max(0, debt - appliedTotal);
    if (appliedTotal > 0) {
      this.logger.log(
        `Thu hồi nợ ${ownerType}:${ownerId} -${appliedTotal} VND (${source}), còn nợ ${debtRemaining}`,
      );
    }

    return {
      ...base,
      recovered: appliedTotal,
      debtRemaining,
      balance: balanceAfter,
      availableBalance: balanceAfter - heldBalance,
      clawbacks: applied,
    };
  }

  /**
   * Quét toàn bộ chủ ví đang có nợ và thu hồi những ví đã đủ tiền.
   *
   * Chạy bởi cron 30 phút (bắt các đường tiền vào không đi qua `credit()`) và
   * có thể gọi thủ công qua `POST /wallets/settlement/clawback/sweep`.
   */
  async recoverAllCoveredDebts(options?: {
    limit?: number;
    ownerId?: string;
    ownerType?: string;
  }): Promise<{
    scanned: number;
    recovered: number;
    wallets: DebtRecoveryResult[];
    skipped: {
      ownerId: string;
      ownerType: string;
      total: number;
      reason: string;
    }[];
  }> {
    const limit = Math.max(1, Math.round(Number(options?.limit) || 200));
    let owners: { ownerId: string; ownerType: string; total: number }[];
    if (options?.ownerId) {
      owners = [
        {
          ownerId: options.ownerId,
          ownerType: options.ownerType || String(OwnerType.DRIVER),
          total: 0,
        },
      ];
    } else {
      owners = await this.settlementRepo.listOpenDebtOwners(limit);
    }

    let recovered = 0;
    const wallets: DebtRecoveryResult[] = [];
    const skipped: {
      ownerId: string;
      ownerType: string;
      total: number;
      reason: string;
    }[] = [];

    for (const o of owners) {
      const result = await this.recoverDebts(
        o.ownerId,
        o.ownerType as OwnerType,
        { source: "AUTO_SWEEP" },
      );
      if (result.recovered > 0) {
        recovered += result.recovered;
        wallets.push(result);
      } else if (result.debtRemaining > 0) {
        skipped.push({
          ownerId: o.ownerId,
          ownerType: o.ownerType,
          total: result.debtRemaining,
          reason: result.skipped || "NOT_COVERED",
        });
      }
    }

    if (owners.length > 0) {
      this.logger.log(
        `Quét nợ clawback: ${owners.length} ví có nợ, thu hồi ${recovered} VND trên ${wallets.length} ví`,
      );
    }
    return { scanned: owners.length, recovered, wallets, skipped };
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

      const balanceAfter = Number(entity.balance) - amount;
      const heldForCod = Number(entity.heldBalance || 0);
      // FIX PHASE1: Must maintain 2M + heldBalance (for active COD orders)
      if (balanceAfter < WalletService.MIN_COD_BALANCE + heldForCod) {
        throw new Error(
          `Must maintain minimum ${WalletService.MIN_COD_BALANCE.toLocaleString("vi-VN")} VND balance` +
            (heldForCod > 0
              ? ` + ${heldForCod.toLocaleString("vi-VN")} VND held for COD orders`
              : ""),
        );
      }
    }

    const balanceBefore = Number(entity.balance);
    const heldBalance = Number(entity.heldBalance || 0);
    if (balanceBefore < amount) {
      throw new Error(
        `Số dư không đủ. Cần ${amount.toLocaleString("vi-VN")} VND, hiện có ${balanceBefore.toLocaleString("vi-VN")} VND`,
      );
    }
    // Hold clawback: không rút quá phần còn lại sau khi trừ nợ refund và tiền
    // đang giữ cho đơn COD. Nhờ vậy nợ không thể bị "rút mất" trước khi đủ
    // ngưỡng thu hồi tự động.
    const openClawback = await this.settlementRepo.sumOpenClawback(
      ownerId,
      ownerType,
    );
    if (
      openClawback > 0 &&
      balanceBefore - amount - heldBalance < openClawback
    ) {
      throw new Error(
        `Bạn còn nợ ${openClawback.toLocaleString("vi-VN")} VND (chờ thu hồi), không thể rút quá số dư còn lại`,
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

  /**
   * Phạt tiền (FINE) / trừ tiền vi phạm — bỏ qua mọi giới hạn rút tối thiểu
   * và giới hạn COD/ngày của driver. Nếu số dư không đủ, trừ phần có sẵn và
   * phần thiếu ghi thành clawback (nợ nội bộ, thu hồi dần từ quyết toán sau).
   *
   * FIX L4: tiền phạt thu được không còn "bốc hơi" — phần trừ thực tế được
   * chuyển vào ví quỹ nền tảng (PLATFORM_DEFAULT) để bút toán cân.
   *
   * Idempotent theo (ownerId, referenceType, referenceId) khi có referenceId,
   * nên order-service/resolution-service có thể retry an toàn.
   */
  async penaltyDebit(
    ownerId: string,
    ownerType: OwnerType,
    amount: number,
    description: string,
    opts?: {
      referenceType?: string;
      referenceId?: string;
      transferToPlatform?: boolean;
      /** Nhãn khoản nợ phát sinh (CUSTOMER_REFUND | DRIVER_COMPENSATION | ...). */
      clawbackCategory?: string;
      /** Diễn giải khoản nợ hiển thị cho chủ ví. */
      clawbackDescription?: string;
    },
  ): Promise<{
    id: string;
    balance: number;
    /** Tổng tiền phạt/trừ đã áp (kể cả phần chưa thu được). */
    charged: number;
    clawback: number;
    platformCredit: number;
    duplicated: boolean;
  }> {
    const amountNum = Math.max(0, Math.round(Number(amount) || 0));
    const referenceType = opts?.referenceType ?? "PENALTY";
    const referenceId = opts?.referenceId;
    const transferToPlatform = opts?.transferToPlatform !== false;

    if (referenceId) {
      const existing = await this.walletRepo.findTransactionByOwnerReference(
        ownerId,
        ownerType,
        referenceType,
        referenceId,
      );
      if (existing) {
        const wallet = await this.getOrCreateWallet(ownerId, ownerType);
        this.logger.log(
          `Penalty debit bỏ qua (đã ghi): ${ownerType}:${ownerId} ref=${referenceType}:${referenceId}`,
        );
        return {
          id: wallet.id,
          balance: Number(wallet.balance),
          charged: 0,
          clawback: 0,
          platformCredit: 0,
          duplicated: true,
        };
      }
    }

    const entity = await this.getOrCreateWallet(ownerId, ownerType);
    const balanceBefore = Number(entity.balance);
    // FIX DEBT-RECOVERY: chỉ trừ phần **khả dụng** (balance - heldBalance).
    // Trước đây dùng min(balance, amount) nên có thể "ăn" vào tiền đang giữ
    // cho đơn COD ⇒ tài xế mất tiền khách trả chưa nộp.
    const heldBalance = Number(entity.heldBalance || 0);
    const available = Math.max(0, balanceBefore - heldBalance);
    const payable = Math.max(0, Math.min(available, amountNum));
    const shortfall = amountNum - payable;

    if (payable > 0) {
      entity.balance = balanceBefore - payable;
      await this.walletRepo.save(entity);
    }

    // Ghi bút toán kể cả khi payable = 0: đây là mốc idempotency + bằng chứng
    // của khoản nợ (clawback) để không thu hai lần.
    await this.walletRepo.recordTransaction({
      id: randomUUID(),
      walletId: entity.id,
      ownerId,
      ownerType,
      type: "DEBIT",
      amount: payable,
      balanceBefore,
      balanceAfter: Number(entity.balance),
      description:
        shortfall > 0
          ? `${description} (đã trừ ${payable}, còn nợ ${shortfall})`
          : description,
      referenceType,
      referenceId,
    });

    if (shortfall > 0) {
      await this.createClawback({
        ownerId,
        ownerType,
        amount: shortfall,
        sourceOrderId: referenceId,
        category: opts?.clawbackCategory ?? null,
        description:
          opts?.clawbackDescription ??
          (referenceId
            ? `${description} (đơn ${referenceId.slice(0, 8)})`
            : description),
      });
    }

    let platformCredit = 0;
    if (transferToPlatform && payable > 0) {
      await this.credit(
        "PLATFORM_DEFAULT",
        OwnerType.PLATFORM,
        payable,
        `Thu tiền phạt/vi phạm — ${description}`,
        referenceType,
        referenceId,
      );
      platformCredit = payable;
    }

    this.logger.log(
      `Penalty debit ${ownerType}:${ownerId} -${payable} VND (clawback ${shortfall}, platform +${platformCredit}) - ${description}`,
    );
    return {
      id: entity.id,
      balance: Number(entity.balance),
      charged: amountNum,
      clawback: shortfall,
      platformCredit,
      duplicated: false,
    };
  }

  /**
   * Bồi thường / hoàn phạt vào ví bên được hưởng (bỏ qua ràng buộc rút).
   * Idempotent theo (ownerId, referenceType, referenceId) khi có referenceId.
   */
  async penaltyCredit(
    ownerId: string,
    ownerType: OwnerType,
    amount: number,
    description: string,
    opts?: { referenceType?: string; referenceId?: string },
  ): Promise<{
    id: string;
    balance: number;
    amount: number;
    duplicated: boolean;
  }> {
    const amountNum = Math.max(0, Math.round(Number(amount) || 0));
    const referenceType = opts?.referenceType ?? "PENALTY";
    const referenceId = opts?.referenceId;

    if (referenceId) {
      const existing = await this.walletRepo.findTransactionByOwnerReference(
        ownerId,
        ownerType,
        referenceType,
        referenceId,
      );
      if (existing) {
        const wallet = await this.getOrCreateWallet(ownerId, ownerType);
        return {
          id: wallet.id,
          balance: Number(wallet.balance),
          amount: Number(existing.amount),
          duplicated: true,
        };
      }
    }

    if (amountNum <= 0) {
      const wallet = await this.getOrCreateWallet(ownerId, ownerType);
      return {
        id: wallet.id,
        balance: Number(wallet.balance),
        amount: 0,
        duplicated: false,
      };
    }

    const result = await this.credit(
      ownerId,
      ownerType,
      amountNum,
      description,
      referenceType,
      referenceId,
    );
    return { ...result, amount: amountNum, duplicated: false };
  }

  /** Số dư quỹ dự phòng. */
  async getReserveBalance(): Promise<{ balance: number }> {
    const balance = await this.getBalance("RESERVE_FUND", OwnerType.PLATFORM);
    return { balance };
  }

  /**
   * Chi từ quỹ dự phòng (COD ứng + bồi thường hệ thống).
   * Quỹ được phép âm tạm (platform ứng trước) và bù lại từ serviceFee các đơn sau.
   */
  async disburseReserve(
    recipientId: string,
    recipientType: OwnerType,
    amount: number,
    description: string,
  ): Promise<{ id: string; balance: number }> {
    const amountNum = Math.round(Number(amount) || 0);
    const balance = await this.getBalance("RESERVE_FUND", OwnerType.PLATFORM);
    if (amountNum <= 0) return { id: "RESERVE_FUND", balance };
    const reserve = await this.getOrCreateWallet(
      "RESERVE_FUND",
      OwnerType.PLATFORM,
    );
    const balanceBefore = Number(reserve.balance);
    reserve.balance = balanceBefore - amountNum;
    await this.walletRepo.save(reserve);
    await this.walletRepo.recordTransaction({
      id: randomUUID(),
      walletId: reserve.id,
      ownerId: "RESERVE_FUND",
      ownerType: OwnerType.PLATFORM,
      type: "DEBIT",
      amount: amountNum,
      balanceBefore,
      balanceAfter: Number(reserve.balance),
      description: `Chi quỹ dự phòng: ${description}`,
      referenceType: "RESERVE_DISBURSE",
    });
    await this.credit(
      recipientId,
      recipientType,
      amountNum,
      description,
      "RESERVE_DISBURSE",
    );
    this.logger.log(
      `Reserve disbursed ${amountNum} to ${recipientType}:${recipientId} — ${description}`,
    );
    return { id: reserve.id, balance: Number(reserve.balance) };
  }

  /** Danh sách nợ COD quá hạn (consumer balance âm > N ngày). */
  async listOverdueDebts(days = 14): Promise<any[]> {
    const wallets = await this.walletRepo.findAllWallets();
    const cutoff = Date.now() - days * 24 * 3600 * 1000;
    const debts: any[] = [];
    for (const w of wallets) {
      if (w.ownerType !== OwnerType.CONSUMER) continue;
      const balance = Number(w.balance);
      if (balance >= 0) continue;
      const txs = await this.walletRepo.getTransactions(w.ownerId, w.ownerType);
      const oldestDebit = txs
        .filter((t) => t.type === "DEBIT")
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )[0];
      if (oldestDebit && new Date(oldestDebit.createdAt).getTime() < cutoff) {
        debts.push({
          consumerId: w.ownerId,
          balance,
          oldestDebtAt: oldestDebit.createdAt,
          daysOverdue: Math.floor(
            (Date.now() - new Date(oldestDebit.createdAt).getTime()) / 86400000,
          ),
          description: oldestDebit.description,
        });
      }
    }
    return debts;
  }

  /** Giữ doanh thu đơn hàng khi có khiếu nại (PENDING → HELD_BY_DISPUTE). */
  async holdSettlement(
    orderId: string,
  ): Promise<{ orderId: string; held: number }> {
    const held = await this.settlementRepo.holdByOrderId(orderId);
    this.logger.log(`Hold settlement cho đơn ${orderId}: ${held} dòng`);
    return { orderId, held };
  }

  /** Giải tỏa doanh thu đơn hàng (HELD_BY_DISPUTE → PENDING). */
  async releaseSettlement(
    orderId: string,
  ): Promise<{ orderId: string; released: number }> {
    const released = await this.settlementRepo.releaseByOrderId(orderId);
    this.logger.log(`Release settlement cho đơn ${orderId}: ${released} dòng`);
    return { orderId, released };
  }
  // ═══════════════════════════════════════════════════════
  // Route tiền khi đơn giao thất bại đã có phán quyết (VALID)
  // ═══════════════════════════════════════════════════════

  private static readonly SETTLEMENT_KINDS = [
    "MERCHANT_FOOD_REVENUE",
    "DRIVER_SHIPPING_FEE",
    "PLATFORM_COMMISSION",
    "RESERVE_FUND_CONTRIBUTION",
  ];

  /**
   * Route toàn bộ tiền của một đơn giao thất bại khi phán quyết là VALID.
   *
   * Nguyên tắc kế toán (thay cho chuỗi walletPost rời rạc trước đây):
   *  - Escrow của đơn (settlement_entries) là nguồn tiền thật duy nhất. Mỗi dòng
   *    escrow chỉ được quyết toán MỘT lần: PENDING → SETTLED (trả bình thường)
   *    hoặc → VOID (bị phán quyết thay thế).
   *  - Khách được hoàn 100% bằng store credit (đơn online).
   *  - Bên không có lỗi vẫn được trả đúng phần của mình.
   *  - Bên có lỗi bị trừ tiền, phần trừ được chuyển về PLATFORM_DEFAULT để bút
   *    toán không bị "bốc hơi" (FIX L4).
   *  - Idempotent tuyệt đối theo orderId (failure_settlements PK + reference của
   *    từng bút toán) nên 4 call-site fire-and-forget không thể trả tiền 2 lần.
   */
  /**
   * Gọi thu hồi nợ sau một nghiệp vụ (không được throw) — phán quyết đã xong,
   * nợ vẫn nằm trong sổ nên cron sẽ thu tiếp nếu lần này lỗi.
   */
  private async recoverDebtsQuietly(
    ownerId: string | null | undefined,
    ownerType: OwnerType,
  ): Promise<void> {
    if (!ownerId) return;
    try {
      await this.recoverDebts(ownerId, ownerType, { source: "AUTO_CREDIT" });
    } catch (err: any) {
      this.logger.warn(
        `Thu hồi nợ sau nghiệp vụ bỏ qua (${ownerType}:${ownerId}): ${err.message}`,
      );
    }
  }

  async settleFailure(
    input: FailureSettlementInput,
  ): Promise<FailureSettlementResult> {
    const orderId = String(input.orderId || "");
    if (!orderId) throw new BadRequestException("orderId is required");

    const faultParty = String(input.faultParty || "SYSTEM").toUpperCase();
    const severity = String(input.severity || "LOW").toUpperCase();
    const isOnline = input.isOnline !== false;

    const claimed = await this.settlementRepo.claimFailureSettlement({
      orderId,
      faultParty,
      severity,
      status: "COMPLETED",
      isOnline,
      refundAmount: 0,
      driverCompensation: 0,
      merchantDebit: 0,
      merchantClawback: 0,
      driverDebit: 0,
      driverClawback: 0,
      fine: 0,
      reserveDisbursed: 0,
      platformFunding: 0,
      detail: null,
    });

    if (!claimed) {
      const stored = await this.settlementRepo.findFailureSettlement(orderId);
      this.logger.warn(
        `settleFailure bỏ qua: đơn ${orderId} đã được settle trước đó (${stored?.faultParty ?? "?"})`,
      );
      return {
        orderId,
        faultParty: stored?.faultParty ?? faultParty,
        severity: stored?.severity ?? severity,
        duplicated: true,
        isOnline: stored?.isOnline ?? isOnline,
        refundAmount: Number(stored?.refundAmount ?? 0),
        driverCompensation: Number(stored?.driverCompensation ?? 0),
        merchantDebit: Number(stored?.merchantDebit ?? 0),
        merchantClawback: Number(stored?.merchantClawback ?? 0),
        driverDebit: Number(stored?.driverDebit ?? 0),
        driverClawback: Number(stored?.driverClawback ?? 0),
        fine: Number(stored?.fine ?? 0),
        reserveDisbursed: Number(stored?.reserveDisbursed ?? 0),
        platformFunding: Number(stored?.platformFunding ?? 0),
        escrowReleased: 0,
        escrowVoided: 0,
        detail: {},
      };
    }

    try {
      const result = await this.routeFailureMoney({
        orderId,
        faultParty,
        severity,
        isOnline,
        total: Math.max(0, Math.round(Number(input.total) || 0)),
        foodTotal: Math.max(0, Math.round(Number(input.foodTotal) || 0)),
        shippingFee: Math.max(0, Math.round(Number(input.shippingFee) || 0)),
        consumerId: input.consumerId || null,
        merchantId: input.merchantId || null,
        driverId: input.driverId || null,
      });

      await this.settlementRepo.completeFailureSettlement(orderId, {
        status: "COMPLETED",
        refundAmount: result.refundAmount,
        driverCompensation: result.driverCompensation,
        merchantDebit: result.merchantDebit,
        merchantClawback: result.merchantClawback,
        driverDebit: result.driverDebit,
        driverClawback: result.driverClawback,
        fine: result.fine,
        reserveDisbursed: result.reserveDisbursed,
        platformFunding: result.platformFunding,
        detail: {
          ...result.detail,
          escrowReleased: result.escrowReleased,
          escrowVoided: result.escrowVoided,
        },
      });

      this.logger.log(
        `settleFailure ${orderId} (${faultParty}/${severity}): refund=${result.refundAmount}, ` +
          `driverComp=${result.driverCompensation}, merchantDebit=${result.merchantDebit}` +
          ` (clawback ${result.merchantClawback}), driverDebit=${result.driverDebit}, ` +
          `fine=${result.fine}, escrow released/voided=${result.escrowReleased}/${result.escrowVoided}`,
      );

      // Ví bên nợ đã đủ tiền ⇒ thu hồi NGAY (không chờ 23:00). Lỗi ở bước này
      // không được làm hỏng phán quyết: nợ vẫn nằm trong clawback_liabilities
      // và cron 30 phút sẽ thu tiếp.
      await this.recoverDebtsQuietly(input.merchantId, OwnerType.MERCHANT);
      await this.recoverDebtsQuietly(input.driverId, OwnerType.DRIVER);
      await this.recoverDebtsQuietly(input.consumerId, OwnerType.CONSUMER);

      return result;
    } catch (err: any) {
      // Giải phóng claim để có thể retry (không để đơn kẹt ở trạng thái nửa vời).
      await this.settlementRepo
        .releaseFailureSettlementClaim(orderId, err?.message ?? "unknown")
        .catch(() => undefined);
      throw err;
    }
  }

  /**
   * Số tiền khách đã nhận qua luồng bồi thường CASE cho đơn này
   * (`settleCaseCompensation` ghi credit `CASE_COMPENSATION`).
   *
   * Dùng để netting khi sau đó đơn được hoàn 100%: khách chỉ nhận phần còn
   * thiếu và bên lỗi chỉ bị trừ phần còn thiếu. Trước đây hai luồng cộng dồn
   * nên khách nhận hai lần còn tài xế bị trừ hai lần.
   */
  private async findPriorCaseCompensation(
    consumerId: string | null,
    orderId: string,
  ): Promise<number> {
    if (!consumerId) return 0;
    const tx = await this.walletRepo.findTransactionByOwnerReference(
      consumerId,
      OwnerType.CONSUMER,
      "CASE_COMPENSATION",
      orderId,
    );
    return Math.max(0, Math.round(Number(tx?.amount) || 0));
  }

  private async routeFailureMoney(ctx: {
    orderId: string;
    faultParty: string;
    severity: string;
    isOnline: boolean;
    total: number;
    foodTotal: number;
    shippingFee: number;
    consumerId: string | null;
    merchantId: string | null;
    driverId: string | null;
  }): Promise<FailureSettlementResult> {
    const {
      orderId,
      faultParty,
      severity,
      isOnline,
      total,
      foodTotal,
      shippingFee,
      consumerId,
      merchantId,
      driverId,
    } = ctx;
    const short = orderId.slice(0, 8);
    const kinds = WalletService.SETTLEMENT_KINDS;

    // Snapshot escrow TRƯỚC khi void/giải tỏa: đây là phần các bên đã được
    // earmark, dùng làm số tiền "công bằng" khi phải trả trực tiếp qua ví.
    const entries = await this.settlementRepo.findEntriesByOrderId(orderId);
    // Số tiền của dòng escrow — đọc TẤT CẢ trạng thái (kể cả SETTLED) vì đó là
    // số thật đã/đang chuyển cho chủ ví; `active` chỉ dùng để biết có dòng
    // tương ứng hay chưa (quyết định có dùng công thức ước tính không).
    const amountOf = (kind: string) =>
      entries
        .filter((e) => e.kind === kind)
        .reduce((s, e) => s + Number(e.amount), 0);
    const hasKind = (kind: string) => entries.some((e) => e.kind === kind);

    // Trạng thái quyết toán 23:00: dòng SETTLED là tiền ĐÃ vào ví chủ sở hữu.
    // Dùng để không trả lần hai và chỉ thu lại phần thực sự đã chuyển.
    const settledKinds = new Set(
      entries.filter((e) => e.status === "SETTLED").map((e) => e.kind),
    );
    const merchantRevenueSettled = settledKinds.has("MERCHANT_FOOD_REVENUE");
    const driverIncomeSettled = settledKinds.has("DRIVER_SHIPPING_FEE");
    // COD: tài xế đã nộp tiền món cho nền tảng lúc giao (`COD_SETTLEMENT`) và
    // giữ tiền mặt phí ship ⇒ chỉ còn nợ đúng phần thu nhập ship.
    const isCod = !isOnline;

    const { merchantCommissionPct, driverCommissionPct } =
      this.getCommissionRates();
    // Chỉ dùng công thức ước tính khi escrow KHÔNG có dòng tương ứng (đơn cũ
    // chưa accrue). Có dòng rồi thì tôn trọng số thật của escrow, kể cả 0.
    const merchantShare = hasKind("MERCHANT_FOOD_REVENUE")
      ? amountOf("MERCHANT_FOOD_REVENUE")
      : Math.max(
          0,
          foodTotal - Math.round((foodTotal * merchantCommissionPct) / 100),
        );
    const driverIncome = hasKind("DRIVER_SHIPPING_FEE")
      ? amountOf("DRIVER_SHIPPING_FEE")
      : Math.max(
          0,
          shippingFee - Math.round((shippingFee * driverCommissionPct) / 100),
        );

    // Khách đã được bồi thường qua luồng case (`settleCaseCompensation`) cho đơn
    // này chưa? Nếu có thì phần hoàn tiếp theo phải TRỪ đi khoản đã nhận, và bên
    // lỗi cũng chỉ bị trừ phần còn thiếu — trước đây hai luồng cộng dồn nên
    // khách nhận hai lần còn tài xế bị trừ hai lần.
    const priorCompensation = await this.findPriorCaseCompensation(
      consumerId,
      orderId,
    );
    const refundDue = Math.max(0, total - priorCompensation);

    const result: FailureSettlementResult = {
      orderId,
      faultParty,
      severity,
      duplicated: false,
      isOnline,
      refundAmount: 0,
      driverCompensation: 0,
      merchantDebit: 0,
      merchantClawback: 0,
      driverDebit: 0,
      driverClawback: 0,
      fine: 0,
      reserveDisbursed: 0,
      platformFunding: 0,
      escrowReleased: 0,
      escrowVoided: 0,
      detail: {},
    };

    /** Tiền thực thu được ngay (không tính phần ghi nợ clawback). */
    let collected = 0;
    /** Phần ghi nợ của bên không phải nhà hàng/tài xế (vd nợ của khách). */
    let otherClawback = 0;
    /** Số tiền THỰC trả nhà hàng trong lần settle này (0 nếu 23:00 đã trả). */
    let merchantPayout = 0;

    switch (faultParty) {
      case "CUSTOMER": {
        if (isOnline) {
          // Khách chịu lỗi: escrow giữ nguyên hiệu lực, mọi bên được trả đúng phần.
          result.escrowReleased +=
            await this.settlementRepo.releaseEntriesByOrderId(orderId, kinds);
        } else {
          // COD: khách chưa trả đồng nào → ứng quỹ dự phòng trả nhà hàng/tài xế,
          // đồng thời ghi nợ khách để thu hồi sau.
          if (driverId && driverIncome > 0) {
            await this.disburseReserve(
              driverId,
              OwnerType.DRIVER,
              driverIncome,
              `Ứng trả phí ship do khách lỗi #${short}`,
            );
            result.reserveDisbursed += driverIncome;
          }
          if (merchantId && merchantShare > 0) {
            await this.disburseReserve(
              merchantId,
              OwnerType.MERCHANT,
              merchantShare,
              `Ứng trả tiền món do khách lỗi #${short}`,
            );
            result.reserveDisbursed += merchantShare;
          }
          const debt = foodTotal + shippingFee;
          if (consumerId && debt > 0) {
            const d = await this.penaltyDebit(
              consumerId,
              OwnerType.CONSUMER,
              debt,
              `Nợ giao thất bại do khách lỗi #${short}`,
              {
                referenceType: "FAILURE_CUSTOMER_DEBT",
                referenceId: orderId,
              },
            );
            otherClawback += d.clawback;
            collected += d.platformCredit;
          }
        }
        // Không còn "phạt lỗi khách": khách đã chịu phần nợ ở trên là đủ.
        break;
      }

      case "DRIVER": {
        // Khách hoàn 100% cho CẢ đơn COD: tiền món COD nền tảng đã thu từ tài xế
        // lúc giao (`COD_SETTLEMENT`) nên có đủ tiền hoàn. Trước đây chặn bằng
        // `isOnline` khiến khách không nhận được đồng nào dù phán quyết ghi
        // "hoàn 100%" — và tiền vẫn bị thu ở tài xế.
        if (consumerId && refundDue > 0) {
          const r = await this.refundCredit(
            consumerId,
            OwnerType.CONSUMER,
            refundDue,
            orderId,
          );
          result.refundAmount += r.amount;
        }
        // Nhà hàng không có lỗi → vẫn được trả tiền món (net hoa hồng), TRỪ KHI
        // escrow đã được quyết toán 23:00 (đã trả rồi thì không trả lần hai).
        if (merchantId && merchantShare > 0 && !merchantRevenueSettled) {
          await this.penaltyCredit(
            merchantId,
            OwnerType.MERCHANT,
            merchantShare,
            `Nền tảng trả tiền món đơn #${short} (lỗi tài xế)`,
            { referenceType: "FAILURE_MERCHANT_PAYOUT", referenceId: orderId },
          );
          merchantPayout = merchantShare;
        }
        // Escrow bị đảo: khách đã được hoàn 100% tiền của đơn.
        result.escrowVoided += await this.settlementRepo.voidEntriesByOrderId(
          orderId,
          kinds,
        );
        // Tài xế chịu ĐÚNG phần tiền đã/đang chuyển cho người khác:
        //  - Tiền món: COD đã bị trừ lúc giao nên không thu lại (nếu thu nữa là
        //    tài xế trả tiền món hai lần); đơn online thì thu để hoàn lại khoản
        //    vừa trả nhà hàng (hoặc khoản 23:00 đã trả).
        //  - Thu nhập ship: chỉ thu khi tài xế ĐÃ nhận (dòng ship SETTLED) hoặc
        //    đã giữ tiền mặt (COD). Đơn online còn PENDING thì dòng ship bị VOID
        //    ⇒ tài xế không nhận được đồng nào, trừ nữa là phạt hai lần.
        if (driverId) {
          const driverCharge = Math.max(
            0,
            (isCod ? 0 : merchantShare) +
              (isCod || driverIncomeSettled ? driverIncome : 0) -
              priorCompensation,
          );
          if (driverCharge > 0) {
            const d = await this.penaltyDebit(
              driverId,
              OwnerType.DRIVER,
              driverCharge,
              `Tài xế bồi thường đơn giao thất bại #${short}`,
              {
                referenceType: "FAILURE_DRIVER_LIABILITY",
                referenceId: orderId,
                clawbackCategory: "CUSTOMER_REFUND",
                clawbackDescription: `Hoàn tiền đơn giao thất bại #${short} (lỗi tài xế)`,
              },
            );
            result.driverDebit += d.platformCredit;
            result.driverClawback += d.clawback;
            collected += d.platformCredit;
          }
        }
        break;
      }

      case "MERCHANT": {
        // Hoàn 100% cho khách kể cả đơn COD (nền tảng đang giữ tiền mặt COD).
        if (consumerId && refundDue > 0) {
          const r = await this.refundCredit(
            consumerId,
            OwnerType.CONSUMER,
            refundDue,
            orderId,
          );
          result.refundAmount += r.amount;
        }
        // Tài xế vẫn được bồi thường phần net họ đã làm (không phải full phí ship).
        if (driverId && driverIncome > 0) {
          const c = await this.compensateDriver(driverId, orderId, shippingFee);
          result.driverCompensation += c.amount;
        }
        // Escrow: CHỈ huỷ phần phí ship của tài xế (đơn không có người giao
        // thành công). Tiền món của nhà hàng + hoa hồng + trích quỹ được GIẢI
        // TOẢ (HELD_BY_DISPUTE → PENDING) để quyết toán 23:00 trả đúng doanh
        // thu như thu nhập bình thường. Doanh thu và nợ là hai luồng riêng,
        // KHÔNG netting.
        result.escrowReleased +=
          await this.settlementRepo.releaseEntriesByOrderId(orderId, [
            "MERCHANT_FOOD_REVENUE",
            "PLATFORM_COMMISSION",
            "RESERVE_FUND_CONTRIBUTION",
          ]);
        result.escrowVoided += await this.settlementRepo.voidEntriesByOrderId(
          orderId,
          ["DRIVER_SHIPPING_FEE"],
        );

        // Nợ của nhà hàng tách thành 2 dòng có nhãn để nhà hàng thấy rõ:
        //  1) hoàn tiền cho khách  2) bồi thường tài xế
        // Mỗi dòng là một bút toán DEBIT riêng (idempotent theo referenceType +
        // referenceId) và một khoản clawback riêng có category.
        const refundLiability = result.refundAmount;
        if (merchantId && refundLiability > 0) {
          const d = await this.penaltyDebit(
            merchantId,
            OwnerType.MERCHANT,
            refundLiability,
            `Hoàn tiền cho khách đơn #${short} (lỗi nhà hàng)`,
            {
              referenceType: "FAILURE_MERCHANT_REFUND",
              referenceId: orderId,
              clawbackCategory: "CUSTOMER_REFUND",
              clawbackDescription: `Hoàn tiền cho khách đơn #${short}`,
            },
          );
          result.merchantDebit += d.platformCredit;
          result.merchantClawback += d.clawback;
          collected += d.platformCredit;
        }
        const compensationLiability = result.driverCompensation;
        if (merchantId && compensationLiability > 0) {
          const d = await this.penaltyDebit(
            merchantId,
            OwnerType.MERCHANT,
            compensationLiability,
            `Bồi thường tài xế đơn #${short} (lỗi nhà hàng)`,
            {
              referenceType: "FAILURE_MERCHANT_LIABILITY",
              referenceId: orderId,
              clawbackCategory: "DRIVER_COMPENSATION",
              clawbackDescription: `Bồi thường tài xế đơn #${short}`,
            },
          );
          result.merchantDebit += d.platformCredit;
          result.merchantClawback += d.clawback;
          collected += d.platformCredit;
        }
        break;
      }

      default: {
        // SYSTEM: nền tảng tự chịu — hoàn khách, trả nhà hàng/tài xế từ quỹ dự phòng.
        if (consumerId && refundDue > 0) {
          const r = await this.refundCredit(
            consumerId,
            OwnerType.CONSUMER,
            refundDue,
            orderId,
          );
          result.refundAmount += r.amount;
        }
        result.escrowVoided += await this.settlementRepo.voidEntriesByOrderId(
          orderId,
          kinds,
        );
        if (merchantId && merchantShare > 0) {
          await this.disburseReserve(
            merchantId,
            OwnerType.MERCHANT,
            merchantShare,
            `Nền tảng bồi thường tiền món #${short}`,
          );
          result.reserveDisbursed += merchantShare;
        }
        if (driverId && driverIncome > 0) {
          await this.disburseReserve(
            driverId,
            OwnerType.DRIVER,
            driverIncome,
            `Nền tảng bồi thường phí ship #${short}`,
          );
          result.reserveDisbursed += driverIncome;
        }
        break;
      }
    }

    // Lỗ thực tế của nền tảng = tiền chi ra mà không thu lại được (kể cả phần
    // đã ghi nợ clawback — khoản đó vẫn là tài sản có thể thu hồi).
    const cashOut =
      result.driverCompensation + result.reserveDisbursed + merchantPayout;
    const recovered =
      collected +
      result.merchantClawback +
      result.driverClawback +
      otherClawback;
    result.platformFunding = Math.max(0, cashOut - recovered);
    if (otherClawback > 0) result.detail.otherClawback = otherClawback;

    return result;
  }

  /**
   * Bồi thường một khoản DUY NHẤT từ ví bên lỗi sang ví bên bị hại khi đơn đã
   * giao xong (giao trễ, thái độ...).
   *
   * Khác `settleFailure()` (chỉ dùng cho đơn giao thất bại: hoàn 100% + huỷ
   * escrow). Ở đây không đụng escrow: nhà hàng vẫn nhận tiền món, tài xế vẫn
   * nhận thu nhập ship lúc 23:00; chỉ khoản bồi thường được chuyển ví.
   *
   * Bất biến: `số khách nhận === số bên lỗi bị trừ (kể cả phần ghi nợ)`, nên
   * hai con số trên app luôn khớp. Ví bên lỗi không đủ ⇒ trừ phần khả dụng và
   * phần thiếu thành clawback có nhãn `CUSTOMER_COMPENSATION` (nền tảng ứng
   * trước cho khách, thu hồi dần từ thu nhập các đơn sau).
   *
   * Idempotent theo orderId: mỗi đơn chỉ bồi thường một lần cho một cặp ví.
   */
  async settleCaseCompensation(
    input: CaseCompensationInput,
  ): Promise<CaseCompensationResult> {
    const orderId = String(input.orderId || "");
    if (!orderId) throw new BadRequestException("orderId is required");

    const amount = Math.max(0, Math.round(Number(input.amount) || 0));
    const creditorId = String(input.creditorId || "");
    const debtorId = String(input.debtorId || "");
    const creditorType = String(input.creditorType || "CONSUMER").toUpperCase();
    const debtorType = String(input.debtorType || "").toUpperCase();
    const short = orderId.slice(0, 8);
    const label = input.category ? `${input.category} ` : "";

    const skip = (reason: string): CaseCompensationResult => {
      this.logger.warn(
        `settleCaseCompensation bỏ qua đơn ${short} (${reason}) — amount=${amount}`,
      );
      return {
        orderId,
        amount: 0,
        charged: 0,
        clawback: 0,
        duplicated: true,
        skipped: reason,
      };
    };

    if (amount <= 0) return skip("AMOUNT_ZERO");
    if (!creditorId || !debtorId || creditorId === debtorId) {
      return skip("INVALID_PARTIES");
    }
    if (!(debtorType in OwnerType) || !(creditorType in OwnerType)) {
      return skip("INVALID_OWNER_TYPE");
    }

    // Đơn đã quyết toán theo luồng giao thất bại (hoàn 100% + huỷ escrow) thì
    // không được bồi thêm — nếu không khách nhận hai lần.
    const settledFailure =
      await this.settlementRepo.findFailureSettlement(orderId);
    if (settledFailure) return skip("FAILURE_ALREADY_SETTLED");

    // Chiều ngược lại: đơn đã được hoàn 100% qua ví (REFUND) mà không có
    // `failure_settlements` (đơn cũ / hoàn tay) — bồi thêm phí ship nữa là trả
    // hai lần cho cùng một đơn và trừ bên lỗi hai lần.
    const alreadyRefunded =
      await this.walletRepo.findTransactionByOwnerReference(
        creditorId,
        creditorType as OwnerType,
        "REFUND",
        orderId,
      );
    if (alreadyRefunded) return skip("REFUND_ALREADY_ISSUED");

    // 1) Trừ bên lỗi trước (ví thiếu ⇒ ghi nợ), rồi mới cộng cho khách. Thứ tự
    //    này khiến lần retry không thể cộng tiền hai lần.
    const debit = await this.penaltyDebit(
      debtorId,
      debtorType as OwnerType,
      amount,
      `Bồi thường khách đơn #${short} (${label.trim() || "khiếu nại"})`,
      {
        referenceType: "CASE_COMPENSATION_DEBT",
        referenceId: orderId,
        clawbackCategory: "CUSTOMER_COMPENSATION",
        clawbackDescription: `Bồi thường khách đơn #${short}`,
      },
    );

    const credit = await this.penaltyCredit(
      creditorId,
      creditorType as OwnerType,
      amount,
      `Bồi thường ${label}— đơn #${short} (${debtorType} chịu chi phí)`,
      { referenceType: "CASE_COMPENSATION", referenceId: orderId },
    );

    await this.recoverDebtsQuietly(debtorId, debtorType as OwnerType);

    this.logger.log(
      `settleCaseCompensation ${short}: ${creditorType}:${creditorId} +${credit.amount}, ` +
        `${debtorType}:${debtorId} -${debit.platformCredit} (clawback ${debit.clawback})`,
    );

    return {
      orderId,
      amount: credit.amount,
      charged: debit.platformCredit,
      clawback: debit.clawback,
      duplicated: debit.duplicated && credit.duplicated,
      skipped: null,
    };
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

    // FIX DEBT-RECOVERY: không được tiêu phần tiền đang là nợ clawback hoặc
    // đang giữ cho đơn COD — nếu không, người nợ có thể "tiêu sạch" ví để né
    // cơ chế thu hồi tự động.
    const openClawback = await this.settlementRepo.sumOpenClawback(
      ownerId,
      ownerType,
    );
    const heldBalance = Number(entity.heldBalance || 0);
    if (
      openClawback > 0 &&
      balanceBefore - amount - heldBalance < openClawback
    ) {
      throw new Error(
        `Bạn còn nợ ${openClawback.toLocaleString("vi-VN")} VND, không thể dùng phần tiền này để thanh toán`,
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
   *
   * FIX L2: idempotent theo (owner, referenceType, referenceId) — gọi lại
   * (retry từ order-service / phán quyết lại) không sinh thêm tiền.
   */
  async refundCredit(
    ownerId: string,
    ownerType: OwnerType,
    amount: number,
    orderId: string,
    opts?: { referenceType?: string; referenceId?: string },
  ): Promise<{
    id: string;
    balance: number;
    amount: number;
    duplicated: boolean;
  }> {
    const amountNum = Math.max(0, Math.round(Number(amount) || 0));
    const referenceType = opts?.referenceType ?? "REFUND";
    const referenceId = opts?.referenceId ?? orderId;

    const existing = await this.walletRepo.findTransactionByOwnerReference(
      ownerId,
      ownerType,
      referenceType,
      referenceId,
    );
    if (existing) {
      const wallet = await this.getOrCreateWallet(ownerId, ownerType);
      this.logger.warn(
        `Refund bỏ qua (đã hoàn trước đó): ${ownerType}:${ownerId} đơn ${orderId}`,
      );
      return {
        id: wallet.id,
        balance: Number(wallet.balance),
        amount: Number(existing.amount),
        duplicated: true,
      };
    }

    if (amountNum <= 0) {
      const wallet = await this.getOrCreateWallet(ownerId, ownerType);
      return {
        id: wallet.id,
        balance: Number(wallet.balance),
        amount: 0,
        duplicated: false,
      };
    }

    const result = await this.credit(
      ownerId,
      ownerType,
      amountNum,
      `Hoàn tiền đơn #${orderId.slice(0, 8)}`,
      referenceType,
      referenceId,
    );
    return { ...result, amount: amountNum, duplicated: false };
  }

  /**
   * Thu nhập phí ship ròng của tài xế cho một đơn.
   *
   * FIX L6: bồi thường phải trả phần NET (đã trừ hoa hồng nền tảng), không phải
   * toàn bộ phí ship khách trả — trước đây compensate-driver trả full
   * shippingFee nên nền tảng lỗ phần hoa hồng tài xế.
   */
  private async driverShippingIncome(
    orderId: string,
    fallbackShippingFee: number,
  ): Promise<number> {
    const entries = await this.settlementRepo.findEntriesByOrderId(orderId);
    const entry = entries.find((e) => e.kind === "DRIVER_SHIPPING_FEE");
    if (entry) return Math.max(0, Number(entry.amount));
    const fee = Math.max(0, Number(fallbackShippingFee) || 0);
    const { driverCommissionPct } = this.getCommissionRates();
    return Math.max(0, fee - Math.round((fee * driverCommissionPct) / 100));
  }

  /**
   * Bồi thường phí ship cho tài xế khi giao thất bại không do lỗi tài xế.
   * Idempotent theo (driver, DELIVERY_FAILED_COMPENSATION, orderId).
   */
  async compensateDriver(
    driverId: string,
    orderId: string,
    fallbackShippingFee = 0,
  ): Promise<{
    id: string;
    balance: number;
    amount: number;
    duplicated: boolean;
  }> {
    const referenceType = "DELIVERY_FAILED_COMPENSATION";
    const existing = await this.walletRepo.findTransactionByOwnerReference(
      driverId,
      OwnerType.DRIVER,
      referenceType,
      orderId,
    );
    if (existing) {
      const wallet = await this.getOrCreateWallet(driverId, OwnerType.DRIVER);
      this.logger.warn(
        `Bồi thường tài xế bỏ qua (đã trả): driver=${driverId} đơn ${orderId}`,
      );
      return {
        id: wallet.id,
        balance: Number(wallet.balance),
        amount: Number(existing.amount),
        duplicated: true,
      };
    }

    const amount = await this.driverShippingIncome(
      orderId,
      fallbackShippingFee,
    );
    if (amount <= 0) {
      const wallet = await this.getOrCreateWallet(driverId, OwnerType.DRIVER);
      return {
        id: wallet.id,
        balance: Number(wallet.balance),
        amount: 0,
        duplicated: false,
      };
    }

    const result = await this.credit(
      driverId,
      OwnerType.DRIVER,
      amount,
      `Bồi thường phí ship đơn giao thất bại #${orderId.slice(0, 8)}`,
      referenceType,
      orderId,
    );
    return { ...result, amount, duplicated: false };
  }

  /**
   * Thu thêm / hoàn lại phần chênh lệch khi nhà hàng chỉnh sửa đơn.
   *
   * Idempotent theo `adjustmentId` + direction (referenceType
   * ORDER_ADJUSTMENT_CHARGE / ORDER_ADJUSTMENT_REFUND) để order-service có thể
   * retry an toàn mà không trừ/cộng tiền hai lần.
   */
  async adjustOrderAmount(input: {
    adjustmentId: string;
    ownerId: string;
    ownerType: OwnerType;
    direction: "CHARGE" | "REFUND";
    amount: number;
    orderId: string;
    description?: string;
  }): Promise<{
    id: string;
    balance: number;
    duplicated: boolean;
    direction: "CHARGE" | "REFUND";
  }> {
    const amount = Math.round(Number(input.amount));
    if (!input.adjustmentId) {
      throw new BadRequestException("adjustmentId is required");
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("Adjustment amount must be positive");
    }

    const direction = input.direction === "REFUND" ? "REFUND" : "CHARGE";
    const referenceType =
      direction === "CHARGE"
        ? "ORDER_ADJUSTMENT_CHARGE"
        : "ORDER_ADJUSTMENT_REFUND";

    const existing = await this.walletRepo.findTransactionByReference(
      referenceType,
      input.adjustmentId,
    );
    if (existing) {
      const current = await this.getOrCreateWallet(
        input.ownerId,
        input.ownerType,
      );
      return {
        id: current.id,
        balance: Number(current.balance),
        duplicated: true,
        direction,
      };
    }

    const entity = await this.getOrCreateWallet(input.ownerId, input.ownerType);
    const balanceBefore = Number(entity.balance);

    if (direction === "CHARGE") {
      if (balanceBefore < amount) {
        throw new BadRequestException(
          `Số dư ví không đủ. Cần ${amount.toLocaleString("vi-VN")} VND, hiện có ${balanceBefore.toLocaleString("vi-VN")} VND`,
        );
      }
      // Không cho trừ phần tiền đang là nợ clawback / đang giữ cho COD.
      const openClawback = await this.settlementRepo.sumOpenClawback(
        input.ownerId,
        input.ownerType,
      );
      const heldBalance = Number(entity.heldBalance || 0);
      if (
        openClawback > 0 &&
        balanceBefore - amount - heldBalance < openClawback
      ) {
        throw new BadRequestException(
          `Ví còn nợ ${openClawback.toLocaleString("vi-VN")} VND, không thể trừ thêm phần tiền này`,
        );
      }
    }

    entity.balance =
      direction === "CHARGE" ? balanceBefore - amount : balanceBefore + amount;
    await this.walletRepo.save(entity);

    const orderShort = input.orderId.slice(0, 8);
    const description =
      input.description ??
      (direction === "CHARGE"
        ? `Thu thêm chênh lệch chỉnh sửa đơn #${orderShort}`
        : `Hoàn chênh lệch chỉnh sửa đơn #${orderShort}`);

    await this.walletRepo.recordTransaction({
      id: randomUUID(),
      walletId: entity.id,
      ownerId: input.ownerId,
      ownerType: input.ownerType,
      type: direction === "CHARGE" ? "DEBIT" : "CREDIT",
      amount,
      balanceBefore,
      balanceAfter: Number(entity.balance),
      description,
      referenceType,
      referenceId: input.adjustmentId,
    });

    this.logger.log(
      `${direction} order adjustment ${input.adjustmentId}: ${input.ownerType}:${input.ownerId} ${direction === "CHARGE" ? "-" : "+"}${amount} VND`,
    );

    return {
      id: entity.id,
      balance: Number(entity.balance),
      duplicated: false,
      direction,
    };
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
    // Quỹ dự phòng: trích 30% serviceFee từ phần nền tảng.
    const reserveContribution = Math.round(serviceFee * 0.3);
    const platformNetShare = Math.max(0, platformShare - reserveContribution);

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
        platformNetShare,
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
        platformNetShare,
        "PLATFORM_COMMISSION",
      );
    }

    if (platformShare < 0) {
      this.logger.warn(
        `Platform share âm ${platformShare} cho đơn ${orderId}: khuyến mãi nền tảng vượt hoa hồng, cần xem xét`,
      );
    }

    if (reserveContribution > 0) {
      push(
        "RESERVE_FUND",
        OwnerType.PLATFORM,
        reserveContribution,
        "RESERVE_FUND_CONTRIBUTION",
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
      // Cron 23:00 (không có period tùy chỉnh) quyết toán TẤT CẢ dòng PENDING,
      // kể cả dòng vừa được giải tỏa (INVALID/rút đơn) có deliveredAt cũ — tránh
      // bị kẹt ngoài cửa sổ quyết toán. Chạy thủ công có period tùy chỉnh thì vẫn
      // chỉ quyết toán đúng cửa sổ đó (phục vụ recover batch ngày X).
      const entries =
        opts.periodStart && opts.periodEnd
          ? await this.settlementRepo.findPendingByPeriod(
              window.periodStart,
              window.periodEnd,
            )
          : await this.settlementRepo.findAllPending();

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
      let totalRecovered = 0;
      let totalCredit = 0;

      for (const g of groups.values()) {
        totalGross += g.gross;
        const already = await this.settlementRepo.hasSettlementCredit(
          g.ownerId,
          g.ownerType,
          batchId,
        );
        let recovered = 0;
        if (!already && g.gross > 0) {
          // Quyết toán THU NHẬP đầy đủ — KHÔNG netting nợ trong lô 23:00.
          // Nhà hàng/tài xế nhận đúng doanh thu của mình; nợ clawback được thu
          // hồi ở bút toán riêng (DEBIT CLAWBACK_RECOVERY) qua credit()/cron
          // 30 phút ⇒ sổ doanh thu và sổ nợ độc lập, ai cũng đối soát được.
          const credited = await this.credit(
            g.ownerId,
            g.ownerType as OwnerType,
            g.gross,
            `Quyết toán ngày ${window.periodStart.toISOString().slice(0, 10)}`,
            "SETTLEMENT",
            batchId,
          );
          recovered = credited.recovered ?? 0;
        }
        totalRecovered += recovered;
        totalCredit += g.gross;
        groupResults.push({
          ownerId: g.ownerId,
          ownerType: g.ownerType,
          gross: g.gross,
          clawback: 0,
          netCredit: g.gross,
          recovered,
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

      const reconciled = totalCredit === totalGross;
      const finalStatus = reconciled ? "SUCCESS" : "NEEDS_REVIEW";
      await this.settlementRepo.saveBatch({
        id: batchId,
        status: finalStatus,
        totalDriverPayout: sumBy("DRIVER"),
        totalMerchantPayout: sumBy("MERCHANT"),
        totalPlatformPayout: sumBy("PLATFORM"),
      });

      this.logger.log(
        `Quyết toán ${window.periodStart.toISOString()} hoàn tất: credit=${totalCredit}, recovered=${totalRecovered}, reconciled=${reconciled}`,
      );

      return {
        batchId,
        status: finalStatus,
        periodStart: window.periodStart,
        periodEnd: window.periodEnd,
        groups: groupResults,
        summary: {
          totalGross,
          totalCredit,
          /** Không còn khấu trừ trong lô; giữ field để client cũ không vỡ. */
          totalClawback: 0,
          /** Số nợ đã thu hồi ngay sau khi credit (bút toán riêng). */
          totalRecovered,
          reconciled,
        },
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
    let totalCredit = 0;
    for (const g of groups.values()) {
      totalGross += g.gross;
      // Dry-run phản ánh luật mới: quyết toán trả ĐỦ doanh thu, nợ thu hồi ở
      // bút toán riêng ⇒ chỉ hiển thị nợ đang mở để admin biết sẽ thu tiếp.
      const openDebt = await this.settlementRepo.sumOpenClawback(
        g.ownerId,
        g.ownerType,
      );
      totalCredit += g.gross;
      groupResults.push({
        ownerId: g.ownerId,
        ownerType: g.ownerType,
        gross: g.gross,
        clawback: 0,
        netCredit: g.gross,
        openDebt,
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
        totalCredit,
        totalClawback: 0,
        totalRecovered: 0,
        reconciled: totalCredit === totalGross,
        recoveryMode: this.getDebtRecoveryMode(),
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
    /** Nhãn khoản nợ: CUSTOMER_REFUND | DRIVER_COMPENSATION | PLATFORM_FUND. */
    category?: string | null;
    /** Diễn giải hiển thị cho chủ ví. */
    description?: string | null;
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
      category: input.category ?? null,
      description:
        input.description ??
        (input.sourceOrderId
          ? `Khoản nợ phát sinh từ đơn #${input.sourceOrderId.slice(0, 8)}`
          : null),
    });
    this.logger.log(
      `Tạo clawback ${id}: ${input.ownerType}:${input.ownerId} nợ ${amount}` +
        (input.category ? ` [${input.category}]` : ""),
    );
    return {
      id,
      ownerId: input.ownerId,
      ownerType: input.ownerType,
      amount,
      category: input.category ?? null,
      description: input.description ?? null,
    };
  }

  async getOpenClawback(ownerId: string, ownerType: string) {
    const total = await this.settlementRepo.sumOpenClawback(ownerId, ownerType);
    const items = await this.settlementRepo.findOpenClawbacks(
      ownerId,
      ownerType,
    );
    const wallet = await this.walletRepo.findByOwner(ownerId, ownerType);
    const balance = Number(wallet?.balance ?? 0);
    const heldBalance = Number(wallet?.heldBalance ?? 0);
    const availableBalance = balance - heldBalance;

    // Kê nợ theo nhãn (hoàn tiền khách / bồi thường tài xế / khác) để nhà hàng
    // và admin thấy từng dòng thay vì một cục nợ không giải thích được.
    const byCategoryMap = new Map<string, number>();
    for (const c of items) {
      const key = c.category || "UNCATEGORIZED";
      byCategoryMap.set(
        key,
        (byCategoryMap.get(key) ?? 0) + Number(c.remainingAmount),
      );
    }

    return {
      ownerId,
      ownerType,
      totalOpenClawback: total,
      balance,
      heldBalance,
      availableBalance,
      /** Ví đã đủ tiền để thu hồi toàn bộ nợ ngay (theo luật "đủ là trừ"). */
      canRecoverNow: total > 0 && availableBalance >= total,
      recoveryMode: this.getDebtRecoveryMode(),
      byCategory: [...byCategoryMap.entries()].map(([category, amount]) => ({
        category,
        amount,
      })),
      items: items.map((c) => ({
        id: c.id,
        sourceOrderId: c.sourceOrderId,
        sourceBatchId: c.sourceBatchId,
        refundId: c.refundId,
        originalAmount: Number(c.originalAmount),
        remainingAmount: Number(c.remainingAmount),
        category: c.category ?? null,
        description: c.description ?? null,
        status: c.status,
        createdAt: c.createdAt,
        settledAt: c.settledAt ?? null,
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
    const summary = await this.walletRepo.getStatsSummary(
      params.startDate,
      params.endDate,
    );
    return {
      items,
      total,
      summary,
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
