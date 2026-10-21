import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DispatchEntity } from "./infrastructure/dispatch.entity";
import { DispatchRepository } from "./infrastructure/dispatch.repository";
import { DispatchService } from "./application/dispatch.service";
import { MatchingEngineService } from "./application/matching-engine.service";
import { RoadDistanceService } from "./application/road-distance.service";
import { DispatchController } from "./presentation/dispatch.controller";
import { DriverDispatchOfferEntity } from "./infrastructure/driver-dispatch-offer.entity";
import { DriverComplianceStateEntity } from "./infrastructure/driver-compliance-state.entity";
import { DriverComplianceRepository } from "./infrastructure/driver-compliance.repository";
import { DriverComplianceService } from "./application/driver-compliance.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DispatchEntity,
      DriverDispatchOfferEntity,
      DriverComplianceStateEntity,
    ]),
  ],
  controllers: [DispatchController],
  providers: [
    DispatchRepository,
    DispatchService,
    MatchingEngineService,
    RoadDistanceService,
    DriverComplianceRepository,
    DriverComplianceService,
  ],
  exports: [DispatchService, MatchingEngineService, DriverComplianceService],
})
export class DispatchModule {}
