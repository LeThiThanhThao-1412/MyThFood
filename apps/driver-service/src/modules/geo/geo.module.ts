import { Module } from "@nestjs/common";
import { DriverGeoService } from "./driver-geo.service";

/** Module hạ tầng: cache vị trí tài xế trên Redis (dùng chung driver + tracking). */
@Module({
  providers: [DriverGeoService],
  exports: [DriverGeoService],
})
export class GeoModule {}
