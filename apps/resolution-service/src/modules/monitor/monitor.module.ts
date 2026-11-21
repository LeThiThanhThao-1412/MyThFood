import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CaseModule } from "../case/case.module";
import { MerchantWarningEntity } from "./infrastructure/merchant-warning.entity";
import { MerchantWarningRepository } from "./infrastructure/merchant-warning.repository";
import { MerchantMonitorService } from "./application/merchant-monitor.service";
import { MerchantMonitorScheduler } from "./application/merchant-monitor.scheduler";
import { MerchantMonitorController } from "./presentation/merchant-monitor.controller";

@Module({
  imports: [TypeOrmModule.forFeature([MerchantWarningEntity]), CaseModule],
  controllers: [MerchantMonitorController],
  providers: [
    MerchantWarningRepository,
    MerchantMonitorService,
    MerchantMonitorScheduler,
  ],
  exports: [MerchantMonitorService],
})
export class MonitorModule {}
