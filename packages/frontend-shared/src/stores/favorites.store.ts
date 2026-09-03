import { create } from "zustand";
import { consumerApi } from "@mythfood/api-client";

interface FavoritesState {
  /** Merchant ids the current consumer has favourited. */
  ids: string[];
  /** Consumer profile id the list belongs to (null until loaded). */
  consumerId: string | null;
  loaded: boolean;
  /** Load favourites for a consumer (no-op when already loaded for that id). */
  load: (consumerId: string) => Promise<void>;
  /** Toggle a merchant and persist via the API (optimistic update). */
  toggle: (consumerId: string, merchantId: string) => Promise<boolean>;
  isFavorite: (merchantId: string) => boolean;
  reset: () => void;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  ids: [],
  consumerId: null,
  loaded: false,

  load: async (consumerId) => {
    if (!consumerId) return;
    // Already loaded for this consumer — keep the in-memory state
    if (get().loaded && get().consumerId === consumerId) return;

    try {
      const res = await consumerApi.getFavorites(consumerId);
      const data: any = (res as any)?.data ?? res;
      const favorites: string[] = Array.isArray(data?.favorites)
        ? data.favorites
        : [];
      set({ ids: favorites, consumerId, loaded: true });
    } catch {
      // Offline / API error — start from an empty list without blocking the UI
      set({ ids: [], consumerId, loaded: true });
    }
  },

  toggle: async (consumerId, merchantId) => {
    const current = get();
    const wasFavorite = current.ids.includes(merchantId);

    // Optimistic update first
    set({
      ids: wasFavorite
        ? current.ids.filter((id) => id !== merchantId)
        : [...current.ids, merchantId],
    });

    try {
      const res = await consumerApi.toggleFavorite(consumerId, merchantId);
      const data: any = (res as any)?.data ?? res;
      const favorites: string[] = Array.isArray(data?.favorites)
        ? data.favorites
        : data?.favorites
          ? data.favorites
          : current.ids;
      set({ ids: favorites, consumerId, loaded: true });
      return !!data?.added;
    } catch {
      // Roll back on failure
      set({ ids: current.ids });
      return wasFavorite;
    }
  },

  isFavorite: (merchantId) => get().ids.includes(merchantId),

  reset: () => set({ ids: [], consumerId: null, loaded: false }),
}));
