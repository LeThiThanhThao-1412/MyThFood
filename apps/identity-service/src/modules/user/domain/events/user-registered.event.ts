import { BaseDomainEvent } from "@mythfood/shared-kernel";
import { UserId } from "../user-id";

export interface UserRegisteredEventPayload {
  userId: string;
  phoneNumber: string;
  email: string | null;
  fullName: string;
  roles: string[];
  deviceId?: string;
  ipAddress?: string;
}

export const USER_REGISTERED_EVENT_TYPE =
  "com.mythfood.identity.user.registered";

export class UserRegisteredEvent extends BaseDomainEvent {
  public readonly payload: UserRegisteredEventPayload;

  constructor(
    aggregateId: UserId,
    payload: UserRegisteredEventPayload,
    correlationId?: string,
  ) {
    super(aggregateId, USER_REGISTERED_EVENT_TYPE, 1, correlationId);
    this.payload = payload;
  }

  public override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      payload: this.payload,
    };
  }
}
