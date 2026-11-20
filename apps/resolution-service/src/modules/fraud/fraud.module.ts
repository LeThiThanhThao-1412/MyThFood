import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FraudRuleEntity } from "./fraud-rule.entity";
import { FraudRuleRepository } from "./fraud-rule.repository";
import { FraudRuleService } from "./fraud-rule.service";
import { FraudRuleController } from "./fraud-rule.controller";
import { CaseModule } from "../case/case.module";

@Module({
  imports: [TypeOrmModule.forFeature([FraudRuleEntity]), CaseModule],
  controllers: [FraudRuleController],
  providers: [FraudRuleRepository, FraudRuleService],
  exports: [FraudRuleService],
})
export class FraudModule {}
