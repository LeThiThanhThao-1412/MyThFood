import { consumerApi } from "@mythfood/api-client";

/**
 * Resolve the consumer profile id for a given auth user id.
 * Falls back to the userId when the profile cannot be found (mirrors the
 * checkout page behaviour so favourites & re-order stay consistent).
 */
export async function resolveConsumerId(
  userId: string,
): Promise<string | null> {
  if (!userId) return null;
  try {
    const res: any = await consumerApi.getByUserId(userId);
    const profile = res?.data || res;
    if (profile?.id) {
      return profile.id;
    }
  } catch {
    /* ignore */
  }
  return userId;
}
