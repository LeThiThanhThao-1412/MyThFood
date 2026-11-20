import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DriverModule } from "../driver/driver.module";
import { TrackingGateway } from "./tracking.gateway";

/**
 * Module realtime GPS: gateway `/tracking` + fan-out `tracking:update`.
 * Phụ thuộc DriverModule (đọc/lưu vị trí) và AuthModule (xác thực JWT handshake).
 */
@Module({
  imports: [AuthModule, DriverModule],
  providers: [TrackingGateway],
})
export class TrackingModule {}
