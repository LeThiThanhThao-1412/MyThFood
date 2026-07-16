import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PaymentEntity } from "./infrastructure/payment.entity";
import { PaymentRepository } from "./infrastructure/payment.repository";
import { PaymentService } from "./application/payment.service";
import { SplitPaymentService } from "./application/split-payment.service";
import { PaymentController } from "./presentation/payment.controller";
import { WalletEntity } from "../wallet/infrastructure/wallet.entity";
import { WalletTransactionEntity } from "../wallet/infrastructure/wallet-transaction.entity";
import { WalletRepository } from "../wallet/infrastructure/wallet.repository";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentEntity,
      WalletEntity,
      WalletTransactionEntity,
    ]),
  ],
  controllers: [PaymentController],
  providers: [
    PaymentRepository,
    WalletRepository,
    PaymentService,
    SplitPaymentService,
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
