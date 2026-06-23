import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DriverService } from "./application/driver.service";
import { DriverController } from "./presentation/driver.controller";
import { DriverRepository } from "./infrastructure/driver.repository";
import { DriverMapper } from "./infrastructure/driver.mapper";
import { DriverEntity } from "./infrastructure/driver.entity";

@Module({
  imports: [TypeOrmModule.forFeature([DriverEntity])],
  controllers: [DriverController],
  providers: [DriverService, DriverRepository, DriverMapper],
  exports: [DriverService],
})
export class DriverModule {}
