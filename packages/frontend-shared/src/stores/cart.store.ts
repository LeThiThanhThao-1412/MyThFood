import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MenuItem } from '@mythfood/api-client';

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  specialInstructions?: string;
  merchantId: string;
  merchantName: string;
}

interface CartState {
  items: CartItem[];
  merchantId: string | null;
  merchantName: string | null;
  addItem: (item: CartItem) => void;
  removeItem: (menuItemId: string) => void;
  updateQuantity: (menuItemId: string, quantity: number) => void;
  clearCart: () => void;
  getItemCount: () => number;
  getSubtotal: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      merchantId: null,
      merchantName: null,

      addItem: (item: CartItem) => {
        const current = get();
        // If adding from different merchant, clear cart first
        if (current.merchantId && current.merchantId !== item.merchantId) {
          set({
            items: [item],
            merchantId: item.merchantId,
            merchantName: item.merchantName,
          });
          return;
        }

        const existing = current.items.find(
          (i) => i.menuItem.id === item.menuItem.id,
        );
        if (existing) {
          set({
            items: current.items.map((i) =>
              i.menuItem.id === item.menuItem.id
                ? { ...i, quantity: i.quantity + item.quantity }
                : i,
            ),
            merchantId: item.merchantId,
            merchantName: item.merchantName,
          });
        } else {
          set({
            items: [...current.items, item],
            merchantId: item.merchantId,
            merchantName: item.merchantName,
          });
        }
      },

      removeItem: (menuItemId: string) => {
        const current = get();
        const newItems = current.items.filter(
          (i) => i.menuItem.id !== menuItemId,
        );
        set({
          items: newItems,
          merchantId: newItems.length > 0 ? current.merchantId : null,
          merchantName: newItems.length > 0 ? current.merchantName : null,
        });
      },

      updateQuantity: (menuItemId: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(menuItemId);
          return;
        }
        set({
          items: get().items.map((i) =>
            i.menuItem.id === menuItemId ? { ...i, quantity } : i,
          ),
        });
      },

      clearCart: () =>
        set({ items: [], merchantId: null, merchantName: null }),

      getItemCount: () =>
        get().items.reduce((sum, i) => sum + i.quantity, 0),

      getSubtotal: () =>
        get().items.reduce((sum, i) => sum + i.menuItem.price * i.quantity, 0),
    }),
    {
      name: 'mythfood-cart',
    },
  ),
);