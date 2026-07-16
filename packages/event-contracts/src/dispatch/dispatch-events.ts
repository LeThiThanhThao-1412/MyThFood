export interface DispatchCreatedPayload {
  dispatchId: string;
  orderId: string;
  merchantId: string;
  deliveryAddress: string;
  deliveryLatitude: number;
  deliveryLongitude: number;
}

export interface DispatchStatusChangedPayload {
  dispatchId: string;
  orderId: string;
  previousStatus: string;
  newStatus: string;
  driverId?: string;
  reason?: string;
}

export const DISPATCH_CREATED = "com.mythfood.dispatch.created";
export const DISPATCH_STATUS_CHANGED = "com.mythfood.dispatch.status_changed";
