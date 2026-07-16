import { BaseDomainEvent } from "@mythfood/shared-kernel";
import { DispatchId } from "../dispatch-id";

export const DISPATCH_STATUS_CHANGED_EVENT_TYPE =
  "com.mythfood.dispatch.status_changed";

export interface DispatchStatusChangedPayload {
  dispatchId: string;
  orderId: string;
  previousStatus: string;
  newStatus: string;
  driverId?: string;
  reason?: string;
}

export class DispatchStatusChangedEvent extends BaseDomainEvent {
  public readonly payload: DispatchStatusChangedPayload;

  constructor(
    aggregateId: DispatchId,
    payload: DispatchStatusChangedPayload,
    correlationId?: string,
  ) {
    super(aggregateId, DISPATCH_STATUS_CHANGED_EVENT_TYPE, 1, correlationId);
    this.payload = payload;
  }

  public override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      payload: this.payload,
    };
  }
}
