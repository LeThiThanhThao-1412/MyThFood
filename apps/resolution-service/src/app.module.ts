import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScheduleModule } from "@nestjs/schedule";
import { getDatabaseConfig } from "./config/database.config";
import { IntegrationModule } from "./modules/integration/integration.module";
import { CaseModule } from "./modules/case/case.module";
import { PenaltyModule } from "./modules/penalty/penalty.module";
import { FraudModule } from "./modules/fraud/fraud.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", ".env.local"],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    ScheduleModule.forRoot(),
    IntegrationModule,
    CaseModule,
    PenaltyModule,
    FraudModule,
  ],
})
export class AppModule {}
