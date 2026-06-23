// CloudEvents base
export type { CloudEvent } from "./base/cloud-event";
export { CloudEventFactory } from "./base/cloud-event";

// Identity events
export type {
  UserRegisteredEventData,
  UserLoggedInEventData,
} from "./identity";
export {
  USER_REGISTERED_EVENT_TYPE,
  USER_LOGGED_IN_EVENT_TYPE,
} from "./identity";

// Merchant events
export type {
  MerchantRegisteredEventData,
  MenuUpdatedEventData,
} from "./merchant";
export {
  MERCHANT_REGISTERED_EVENT_TYPE,
  MENU_UPDATED_EVENT_TYPE,
} from "./merchant";

// Order events
export type {
  OrderPlacedEventData,
  OrderStatusChangedEventData,
  OrderEventData,
  OrderCloudEvent,
} from "./order";
export {
  ORDER_PLACED_EVENT_TYPE,
  ORDER_STATUS_CHANGED_EVENT_TYPE,
} from "./order";

// Inventory events
export type {
  InventoryReservedEventData,
  InventoryReleasedEventData,
  InventoryConsumedEventData,
} from "./inventory";
export {
  INVENTORY_RESERVED_EVENT_TYPE,
  INVENTORY_RELEASED_EVENT_TYPE,
  INVENTORY_CONSUMED_EVENT_TYPE,
} from "./inventory";

// Payment events
export type {
  PaymentCreatedPayload,
  PaymentCompletedPayload,
  PaymentFailedPayload,
  PaymentRefundedPayload,
} from "./payment";
export {
  PAYMENT_CREATED,
  PAYMENT_COMPLETED,
  PAYMENT_FAILED,
  PAYMENT_REFUNDED,
} from "./payment";

// Driver events
export type {
  DriverOnlineStatusChangedPayload,
  DriverLocationUpdatedPayload,
  DriverFatigueAlertPayload,
  DriverActivatedPayload,
  DriverDeactivatedPayload,
} from "./driver";
export {
  DRIVER_ONLINE_STATUS_CHANGED_EVENT_TYPE,
  DRIVER_LOCATION_UPDATED_EVENT_TYPE,
  DRIVER_FATIGUE_ALERT_EVENT_TYPE,
  DRIVER_ACTIVATED_EVENT_TYPE,
  DRIVER_DEACTIVATED_EVENT_TYPE,
} from "./driver";
