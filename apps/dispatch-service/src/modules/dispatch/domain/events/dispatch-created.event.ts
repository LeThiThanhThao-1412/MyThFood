import { BaseDomainEvent } from "@mythfood/shared-kernel";
import { DispatchId } from "../dispatch-id";

export const DISPATCH_CREATED_EVENT_TYPE = "com.mythfood.dispatch.created";

export interface DispatchCreatedPayload {
  dispatchId: string;
  orderId: string;
  merchantId: string;
  deliveryAddress: string;
  deliveryLatitude: number;
  deliveryLongitude: number;
}

export class DispatchCreatedEvent extends BaseDomainEvent {
  public readonly payload: DispatchCreatedPayload;

  constructor(
    aggregateId: DispatchId,
    payload: DispatchCreatedPayload,
    correlationId?: string,
  ) {
    super(aggregateId, DISPATCH_CREATED_EVENT_TYPE, 1, correlationId);
    this.payload = payload;
  }

  public override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      payload: this.payload,
    };
  }
}
