import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PaymentEntity } from "./infrastructure/payment.entity";
import { PaymentRepository } from "./infrastructure/payment.repository";
import { PaymentService } from "./application/payment.service";
import { SplitPaymentService } from "./application/split-payment.service";
import { PaymentController } from "./presentation/payment.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentEntity]),
  ],
  controllers: [PaymentController],
  providers: [PaymentRepository, PaymentService, SplitPaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
