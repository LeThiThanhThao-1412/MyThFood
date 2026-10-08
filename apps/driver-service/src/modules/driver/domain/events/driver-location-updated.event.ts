import { BaseDomainEvent } from "@mythfood/shared-kernel";
import { DriverId } from "../driver-id";

export const DRIVER_LOCATION_UPDATED = "driver.location_updated";

export class DriverLocationUpdatedEvent extends BaseDomainEvent {
  constructor(
    public readonly driverId: DriverId,
    public readonly latitude: number,
    public readonly longitude: number,
  ) {
    super(driverId, DRIVER_LOCATION_UPDATED);
  }
}
