import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WalletController } from "./presentation/wallet.controller";
import { WalletService } from "./application/wallet.service";
import { WalletRepository } from "./infrastructure/wallet.repository";
import { WalletEntity } from "./infrastructure/wallet.entity";
import { WalletTransactionEntity } from "./infrastructure/wallet-transaction.entity";

/**
 * FIX #8: Now using WalletRepository (encapsulates TypeORM) instead of injecting
 * TypeORM Repositories directly into WalletService.
 * FIX #9: @VersionColumn on WalletEntity enables optimistic locking on balance ops.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([WalletEntity, WalletTransactionEntity]),
  ],
  controllers: [WalletController],
  providers: [WalletService, WalletRepository],
  exports: [WalletService, WalletRepository],
})
export class WalletModule {}
