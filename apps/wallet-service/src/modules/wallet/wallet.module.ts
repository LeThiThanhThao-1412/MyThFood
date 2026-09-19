import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WalletController } from "./presentation/wallet.controller";
import { WalletService } from "./application/wallet.service";
import { WalletScheduler } from "./application/wallet.scheduler";
import { WalletRepository } from "./infrastructure/wallet.repository";
import { SettlementRepository } from "./infrastructure/settlement.repository";
import { WalletEntity } from "./infrastructure/wallet.entity";
import { WalletTransactionEntity } from "./infrastructure/wallet-transaction.entity";
import { SettlementEntryEntity } from "./infrastructure/settlement-entry.entity";
import { SettlementBatchEntity } from "./infrastructure/settlement-batch.entity";
import { ClawbackLiabilityEntity } from "./infrastructure/clawback-liability.entity";
import { ClawbackDeductionEntity } from "./infrastructure/clawback-deduction.entity";

/**
 * FIX #8: Now using WalletRepository (encapsulates TypeORM) instead of injecting
 * TypeORM Repositories directly into WalletService.
 * FIX #9: @VersionColumn on WalletEntity enables optimistic locking on balance ops.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WalletEntity,
      WalletTransactionEntity,
      SettlementEntryEntity,
      SettlementBatchEntity,
      ClawbackLiabilityEntity,
      ClawbackDeductionEntity,
    ]),
  ],
  controllers: [WalletController],
  providers: [
    WalletService,
    WalletRepository,
    SettlementRepository,
    WalletScheduler,
  ],
  exports: [WalletService, WalletRepository],
})
export class WalletModule {}
