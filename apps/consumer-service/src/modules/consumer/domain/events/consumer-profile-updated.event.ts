import { BaseDomainEvent, Identifier } from '@mythfood/shared-kernel';

export interface ConsumerProfileUpdatedEventPayload {
  consumerId: string;
  userId: string;
  fullName: string;
  avatar: string | null;
  dateOfBirth: string | null;
  gender: string | null;
}

export const CONSUMER_PROFILE_UPDATED_EVENT_TYPE = 'com.mythfood.consumer.profile_updated';

export class ConsumerProfileUpdatedEvent extends BaseDomainEvent {
  public readonly payload: ConsumerProfileUpdatedEventPayload;

  constructor(aggregateId: Identifier, payload: ConsumerProfileUpdatedEventPayload, correlationId?: string) {
    super(aggregateId, CONSUMER_PROFILE_UPDATED_EVENT_TYPE, 1, correlationId);
    this.payload = payload;
  }

  public override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      payload: this.payload,
    };
  }
}