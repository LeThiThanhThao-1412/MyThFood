import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScheduleModule } from "@nestjs/schedule";
import { join } from "path";
import { getDatabaseConfig } from "./config/database.config";
import { AuthModule } from "./modules/auth/auth.module";
import { IntegrationModule } from "./modules/integration/integration.module";
import { CaseModule } from "./modules/case/case.module";
import { PenaltyModule } from "./modules/penalty/penalty.module";
import { FraudModule } from "./modules/fraud/fraud.module";
import { AssistantModule } from "./modules/assistant/assistant.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Đường dẫn tương đối tính theo CWD: chạy `nest start` trong
      // apps/resolution-service thì ".env" là apps/resolution-service/.env, KHÔNG
      // thấy file .env chung ở gốc monorepo ⇒ thêm đường dẫn tuyệt đối làm fallback
      // (nơi chứa AI_PROVIDER/GLM_API_KEY...).
      envFilePath: [
        ".env",
        ".env.local",
        join(__dirname, "..", ".env"),
        join(__dirname, "..", "..", "..", ".env"),
        join(__dirname, "..", "..", "..", ".env.local"),
      ],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    IntegrationModule,
    CaseModule,
    PenaltyModule,
    FraudModule,
    AssistantModule,
  ],
})
export class AppModule {}
