import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DispatchEntity } from "./infrastructure/dispatch.entity";
import { DispatchRepository } from "./infrastructure/dispatch.repository";
import { DispatchService } from "./application/dispatch.service";
import { MatchingEngineService } from "./application/matching-engine.service";
import { DispatchController } from "./presentation/dispatch.controller";

@Module({
  imports: [TypeOrmModule.forFeature([DispatchEntity])],
  controllers: [DispatchController],
  providers: [DispatchRepository, DispatchService, MatchingEngineService],
  exports: [DispatchService, MatchingEngineService],
})
export class DispatchModule {}
