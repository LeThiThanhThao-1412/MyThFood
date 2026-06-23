/**
 * Event emitted when a new user registers in the system.
 *
 * Topic: identity.events
 * Type: com.mythfood.identity.user.registered
 */
export interface UserRegisteredEventData {
  /** The new user's ID */
  userId: string;

  /** Phone number used for registration (E.164 format) */
  phoneNumber: string;

  /** Optional email */
  email?: string;

  /** Display name */
  fullName: string;

  /** Assigned roles */
  roles: string[];

  /** Device ID used during registration */
  deviceId?: string;

  /** IP address */
  ipAddress?: string;
}

export const USER_REGISTERED_EVENT_TYPE =
  "com.mythfood.identity.user.registered";
