import { BaseDomainEvent } from "@mythfood/shared-kernel";
import { MerchantId } from "../merchant-id";

export interface MenuUpdatedEventPayload {
  merchantId: string;
  menuItemId: string;
  name: string;
  price: number;
  isAvailable: boolean;
  action: "CREATED" | "UPDATED" | "DELETED" | "TOGGLED" | "PRICE_CHANGED";
  oldPrice?: number;
  newPrice?: number;
}

export const MENU_UPDATED_EVENT_TYPE = "com.mythfood.merchant.menu.updated";

export class MenuUpdatedEvent extends BaseDomainEvent {
  public readonly payload: MenuUpdatedEventPayload;

  constructor(
    aggregateId: MerchantId,
    payload: MenuUpdatedEventPayload,
    correlationId?: string,
  ) {
    super(aggregateId, MENU_UPDATED_EVENT_TYPE, 1, correlationId);
    this.payload = payload;
  }

  public override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      payload: this.payload,
    };
  }
}
