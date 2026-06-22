/**
 * Event emitted when a user successfully logs in.
 *
 * Topic: identity.events
 * Type: com.mythfood.identity.user.logged_in
 */
export interface UserLoggedInEventData {
  userId: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export const USER_LOGGED_IN_EVENT_TYPE = 'com.mythfood.identity.user.logged_in';