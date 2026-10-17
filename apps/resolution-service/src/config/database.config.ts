import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { CaseEntity } from "../modules/case/infrastructure/case.entity";
import { CaseTimelineEntity } from "../modules/case/infrastructure/case-timeline.entity";
import { PenaltyEntity } from "../modules/penalty/infrastructure/penalty.entity";
import { AppealEntity } from "../modules/penalty/infrastructure/appeal.entity";
import { FraudRuleEntity } from "../modules/fraud/fraud-rule.entity";
import { CaseAiAnalysisEntity } from "../modules/assistant/infrastructure/analysis.entity";

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: "postgres",
  host: configService.get<string>("DATABASE_HOST") ?? "localhost",
  port: configService.get<number>("DATABASE_PORT") ?? 5432,
  username: configService.get<string>("DATABASE_USER") ?? "mythfood",
  password: configService.get<string>("DATABASE_PASSWORD") ?? "mythfood_secret",
  database: configService.get<string>("DATABASE_NAME") ?? "mythfood_resolution",
  entities: [
    CaseEntity,
    CaseTimelineEntity,
    PenaltyEntity,
    AppealEntity,
    FraudRuleEntity,
    // Bản phân tích AI đã lưu (AI tự chạy nền khi khiếu nại được tạo).
    CaseAiAnalysisEntity,
  ],
  synchronize: configService.get<string>("NODE_ENV") === "development",
  logging: configService.get<string>("NODE_ENV") === "development",
});
