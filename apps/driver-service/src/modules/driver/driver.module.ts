import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HttpModule } from "@nestjs/axios";
import { DriverService } from "./application/driver.service";
import { DriverController } from "./presentation/driver.controller";
import { DriverRepository } from "./infrastructure/driver.repository";
import { DriverMapper } from "./infrastructure/driver.mapper";
import { DriverEntity } from "./infrastructure/driver.entity";
import { DriverLocationHistoryEntity } from "./infrastructure/driver-location-history.entity";
import { DriverLocationHistoryRepository } from "./infrastructure/driver-location-history.repository";
import { GeoModule } from "../geo/geo.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([DriverEntity, DriverLocationHistoryEntity]),
    HttpModule,
    GeoModule,
  ],
  controllers: [DriverController],
  providers: [
    DriverService,
    DriverRepository,
    DriverMapper,
    DriverLocationHistoryRepository,
  ],
  exports: [DriverService],
})
export class DriverModule {}
