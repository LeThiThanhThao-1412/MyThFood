/**
 * Driver domain event types
 */
export const DRIVER_ONLINE_STATUS_CHANGED_EVENT_TYPE =
  "com.mythfood.driver.online_status_changed";
export const DRIVER_LOCATION_UPDATED_EVENT_TYPE =
  "com.mythfood.driver.location_updated";
export const DRIVER_FATIGUE_ALERT_EVENT_TYPE =
  "com.mythfood.driver.fatigue_alert";
export const DRIVER_ACTIVATED_EVENT_TYPE = "com.mythfood.driver.activated";
export const DRIVER_DEACTIVATED_EVENT_TYPE = "com.mythfood.driver.deactivated";

/**
 * Payload types
 */
export interface DriverOnlineStatusChangedPayload {
  driverId: string;
  isOnline: boolean;
}

export interface DriverLocationUpdatedPayload {
  driverId: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

export interface DriverFatigueAlertPayload {
  driverId: string;
  fatigueLevel: "WARNING" | "CRITICAL";
  consecutiveDrivingMinutes: number;
  totalDrivingMinutesToday: number;
}

export interface DriverActivatedPayload {
  driverId: string;
  userId: string;
  fullName: string;
}

export interface DriverDeactivatedPayload {
  driverId: string;
  reason: string;
}
