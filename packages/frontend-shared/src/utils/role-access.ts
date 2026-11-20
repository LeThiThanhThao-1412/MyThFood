/**
 * Per-app role access matrix.
 *
 * Model: "base + silo"
 * - Everyone can access the CONSUMER app (it is the base level).
 * - DRIVER app: only DRIVER (and ADMIN).
 * - MERCHANT app: only MERCHANT_OWNER (and ADMIN).
 * - ADMIN portal: only ADMIN.
 *
 * Merchant and driver do NOT access each other's apps; they only share the
 * consumer app.
 */

export type AppKey = "CONSUMER" | "DRIVER" | "MERCHANT" | "ADMIN";

export const APP_ALLOWED_ROLES: Record<AppKey, string[]> = {
  CONSUMER: ["CONSUMER", "DRIVER", "MERCHANT_OWNER", "ADMIN"],
  DRIVER: ["DRIVER", "ADMIN"],
  MERCHANT: ["MERCHANT_OWNER", "ADMIN"],
  ADMIN: ["ADMIN"],
};

export function canAccessApp(
  userRoles: string[] | null | undefined,
  app: AppKey,
): boolean {
  const allowed = APP_ALLOWED_ROLES[app];
  return (userRoles ?? []).some((r) => allowed.includes(r));
}
