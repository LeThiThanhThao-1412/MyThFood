import { create } from "zustand";
import { persist } from "zustand/middleware";
import { consumerApi, merchantApi } from "@mythfood/api-client";

/** Thông tin hiển thị của một món yêu thích (dùng cho dashboard). */
export interface FavoriteDishInfo {
  menuItemId: string;
  name: string;
  price?: number;
  imageUrl?: string | null;
  merchantId: string;
  merchantName: string;
}

interface FavoriteDishesState {
  /** Menu item ids the current consumer has favourited. */
  ids: string[];
  /** Chi tiết món (được lưu khi bấm yêu thích) để hiển thị ngoài trang menu. */
  details: Record<string, FavoriteDishInfo>;
  consumerId: string | null;
  loaded: boolean;
  load: (consumerId: string) => Promise<void>;
  toggle: (
    consumerId: string,
    menuItemId: string,
    info?: FavoriteDishInfo,
  ) => Promise<boolean>;
  isFavorite: (menuItemId: string) => boolean;
  getList: () => FavoriteDishInfo[];
  reset: () => void;
}

export const useFavoriteDishesStore = create<FavoriteDishesState>()(
  persist(
    (set, get) => ({
      ids: [],
      details: {},
      consumerId: null,
      loaded: false,

      load: async (consumerId) => {
        if (!consumerId) return;
        if (get().loaded && get().consumerId === consumerId) return;

        try {
          const res = await consumerApi.getFavoriteMenuItems(consumerId);
          const data: any = (res as any)?.data ?? res;
          const favorites: string[] = Array.isArray(data?.favorites)
            ? data.favorites
            : [];

          // Giữ lại chi tiết của các món vẫn còn yêu thích
          const existing = get().details;
          const keep: Record<string, FavoriteDishInfo> = {};
          const missing: string[] = [];
          for (const id of favorites) {
            if (existing[id]) keep[id] = existing[id];
            else missing.push(id);
          }

          // Resolve tên/chi tiết cho các món yêu thích từ thiết bị/phiên khác
          if (missing.length > 0) {
            try {
              const mRes: any = await merchantApi.getMenuItemsByIds(missing);
              const list: any[] = Array.isArray(mRes?.items)
                ? mRes.items
                : Array.isArray(mRes?.data?.items)
                  ? mRes.data.items
                  : [];
              for (const item of list) {
                keep[item.id] = {
                  menuItemId: item.id,
                  name: item.name,
                  price: item.price,
                  imageUrl: item.imageUrl ?? null,
                  merchantId: item.merchantId,
                  merchantName: item.merchant?.name || "Nhà hàng",
                };
              }
            } catch {
              /* ignore - chỉ giữ chi tiết đã biết ở local */
            }
          }

          set({ ids: favorites, details: keep, consumerId, loaded: true });
        } catch {
          set({ ids: [], consumerId, loaded: true });
        }
      },

      toggle: async (consumerId, menuItemId, info) => {
        const current = get();
        const wasFavorite = current.ids.includes(menuItemId);

        // Optimistic update
        set({
          ids: wasFavorite
            ? current.ids.filter((id) => id !== menuItemId)
            : [...current.ids, menuItemId],
          details: wasFavorite
            ? (() => {
                const next = { ...current.details };
                delete next[menuItemId];
                return next;
              })()
            : info
              ? { ...current.details, [menuItemId]: info }
              : current.details,
        });

        try {
          const res = await consumerApi.toggleFavoriteMenuItem(
            consumerId,
            menuItemId,
          );
          const data: any = (res as any)?.data ?? res;
          const favorites: string[] = Array.isArray(data?.favorites)
            ? data.favorites
            : current.ids;
          set({ ids: favorites, consumerId, loaded: true });
          return !!data?.added;
        } catch {
          set({ ids: current.ids, details: current.details });
          return wasFavorite;
        }
      },

      isFavorite: (menuItemId) => get().ids.includes(menuItemId),

      getList: () => {
        const { ids, details } = get();
        return ids
          .map((id) => details[id])
          .filter((d): d is FavoriteDishInfo => !!d);
      },

      reset: () =>
        set({ ids: [], details: {}, consumerId: null, loaded: false }),
    }),
    {
      name: "mythfood-fav-dishes",
      version: 1,
      partialize: (state) => ({
        ids: state.ids,
        details: state.details,
        consumerId: state.consumerId,
      }),
    },
  ),
);
