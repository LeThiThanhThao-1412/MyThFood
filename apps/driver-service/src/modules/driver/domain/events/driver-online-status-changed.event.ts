import { BaseDomainEvent } from "@mythfood/shared-kernel";
import { DriverId } from "../driver-id";

export const DRIVER_ONLINE_STATUS_CHANGED = "driver.online_status_changed";

export class DriverOnlineStatusChangedEvent extends BaseDomainEvent {
  constructor(
    public readonly driverId: DriverId,
    public readonly isOnline: boolean,
  ) {
    super(driverId, DRIVER_ONLINE_STATUS_CHANGED);
  }
}
