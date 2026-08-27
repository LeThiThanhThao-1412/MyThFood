import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MenuItem, SelectedOptionGroup } from "@mythfood/api-client";

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  selectedGroups?: SelectedOptionGroup[]; // cấu hình tùy chọn đã chọn
  unitPrice: number; // giá cuối mỗi phần (base + option deltas)
  variantKey: string; // khóa phân biệt biến thể của cùng một món
  specialInstructions?: string;
  merchantId: string;
  merchantName: string;
}

// Input khi gọi addItem: unitPrice/variantKey được tính tự động nếu không truyền
export interface AddCartItemInput {
  menuItem: MenuItem;
  quantity: number;
  selectedGroups?: SelectedOptionGroup[];
  unitPrice?: number;
  variantKey?: string;
  specialInstructions?: string;
  merchantId: string;
  merchantName: string;
}

interface CartState {
  items: CartItem[];
  merchantId: string | null;
  merchantName: string | null;
  addItem: (item: AddCartItemInput) => void;
  removeItem: (variantKey: string) => void;
  updateQuantity: (variantKey: string, quantity: number) => void;
  clearCart: () => void;
  getItemCount: () => number;
  getSubtotal: () => number;
}

/**
 * Tính giá cuối mỗi phần sau khi cộng/trừ các tùy chọn đã chọn.
 * Với QUANTITY, mỗi option được nhân với số lượng đã chọn.
 */
export function computeUnitPrice(
  menuItem: MenuItem,
  selectedGroups?: SelectedOptionGroup[],
): number {
  let price = menuItem.price || 0;
  for (const group of selectedGroups || []) {
    for (const opt of group.options) {
      const qty = opt.quantity ?? 1;
      price += (opt.priceDelta || 0) * qty;
    }
  }
  return price;
}

/**
 * Sinh khóa phân biệt biến thể của một món dựa trên cấu hình đã chọn.
 */
export function buildVariantKey(
  menuItem: MenuItem,
  selectedGroups?: SelectedOptionGroup[],
): string {
  const parts: string[] = [];
  for (const group of selectedGroups || []) {
    for (const opt of group.options) {
      const qty = opt.quantity ?? 1;
      parts.push(`${group.groupId}:${opt.optionId}:${qty}`);
    }
  }
  parts.sort();
  return `${menuItem.id}::${parts.join("|")}`;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      merchantId: null,
      merchantName: null,

      addItem: (item: AddCartItemInput) => {
        const current = get();
        const normalized: CartItem = {
          ...item,
          unitPrice:
            item.unitPrice ??
            computeUnitPrice(item.menuItem, item.selectedGroups),
          variantKey:
            item.variantKey ??
            buildVariantKey(item.menuItem, item.selectedGroups),
        };
        // If adding from different merchant, clear cart first
        if (
          current.merchantId &&
          current.merchantId !== normalized.merchantId
        ) {
          set({
            items: [normalized],
            merchantId: normalized.merchantId,
            merchantName: normalized.merchantName,
          });
          return;
        }

        const existing = current.items.find(
          (i) => i.variantKey === normalized.variantKey,
        );
        if (existing) {
          set({
            items: current.items.map((i) =>
              i.variantKey === normalized.variantKey
                ? {
                    ...i,
                    quantity: i.quantity + normalized.quantity,
                    specialInstructions:
                      normalized.specialInstructions ?? i.specialInstructions,
                  }
                : i,
            ),
            merchantId: normalized.merchantId,
            merchantName: normalized.merchantName,
          });
        } else {
          set({
            items: [...current.items, normalized],
            merchantId: normalized.merchantId,
            merchantName: normalized.merchantName,
          });
        }
      },

      removeItem: (variantKey: string) => {
        const current = get();
        const newItems = current.items.filter(
          (i) => i.variantKey !== variantKey,
        );
        set({
          items: newItems,
          merchantId: newItems.length > 0 ? current.merchantId : null,
          merchantName: newItems.length > 0 ? current.merchantName : null,
        });
      },

      updateQuantity: (variantKey: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(variantKey);
          return;
        }
        set({
          items: get().items.map((i) =>
            i.variantKey === variantKey ? { ...i, quantity } : i,
          ),
        });
      },

      clearCart: () => set({ items: [], merchantId: null, merchantName: null }),

      getItemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

      getSubtotal: () =>
        get().items.reduce(
          (sum, i) => sum + (i.unitPrice ?? i.menuItem.price ?? 0) * i.quantity,
          0,
        ),
    }),
    {
      name: "mythfood-cart",
      version: 1,
      // Nâng cấp dữ liệu giỏ hàng cũ (chưa có unitPrice/variantKey) từ localStorage
      migrate: (persistedState: any) => {
        if (persistedState && Array.isArray(persistedState.items)) {
          persistedState.items = persistedState.items.map((i: any) => ({
            ...i,
            unitPrice: i.unitPrice ?? i.menuItem?.price ?? 0,
            variantKey: i.variantKey ?? i.menuItem?.id ?? "",
          }));
        }
        return persistedState;
      },
    },
  ),
);
