import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import databaseConfig from "./config/database.config";
import { AuthModule } from "./modules/auth/auth.module";
import { StripeModule } from "./modules/stripe/stripe.module";
import { PaymentModule } from "./modules/payment/payment.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(databaseConfig),
    AuthModule,
    StripeModule,
    PaymentModule,
  ],
})
export class AppModule {}
