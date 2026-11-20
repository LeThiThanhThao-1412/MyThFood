import { consumerApi } from "@mythfood/api-client";

/**
 * Resolve the consumer profile id for a given auth user id.
 * If the profile does not exist yet, it is auto-created so that features
 * that depend on a consumer id (favourites, re-order) keep working even
 * before the user visits the /profile page.
 */
export async function resolveConsumerId(
  userId: string,
  fullName?: string,
): Promise<string | null> {
  if (!userId) return null;
  try {
    const res: any = await consumerApi.getByUserId(userId);
    const profile = res?.data || res;
    if (profile?.id) {
      return profile.id;
    }
  } catch {
    /* profile not found or network error - try to create below */
  }

  // Auto-create the profile when it is missing.
  try {
    const created: any = await consumerApi.create({
      userId,
      fullName: fullName || "Người dùng",
    });
    const profile = created?.data || created;
    if (profile?.id) {
      return profile.id;
    }
  } catch {
    /* ignore */
  }

  // Last resort: fall back to the auth userId so callers degrade gracefully.
  return userId;
}
