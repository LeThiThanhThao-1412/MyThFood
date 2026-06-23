import { BaseDomainEvent } from '@mythfood/shared-kernel';
import { MerchantId } from '../merchant-id';

export interface MerchantRegisteredEventPayload {
  merchantId: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string;
  address: string;
  status: string;
}

export const MERCHANT_REGISTERED_EVENT_TYPE = 'com.mythfood.merchant.registered';

export class MerchantRegisteredEvent extends BaseDomainEvent {
  public readonly payload: MerchantRegisteredEventPayload;

  constructor(aggregateId: MerchantId, payload: MerchantRegisteredEventPayload, correlationId?: string) {
    super(aggregateId, MERCHANT_REGISTERED_EVENT_TYPE, 1, correlationId);
    this.payload = payload;
  }

  public override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      payload: this.payload,
    };
  }
}
