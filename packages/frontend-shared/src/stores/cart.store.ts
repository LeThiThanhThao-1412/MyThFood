import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MenuItem, SelectedOptionGroup } from "@mythfood/api-client";

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  selectedGroups?: SelectedOptionGroup[]; // cấu hình tùy chọn đã chọn
  unitPrice: number; // giá cuối mỗi phần (base + option deltas)
  // Giá gốc mỗi phần TRƯỚC flash sale (đã gồm option deltas). Nếu có nghĩa là
  // món này đang được giảm giá flash sale; dùng để hiển thị giá gốc + giảm giá
  // flash sale trên hóa đơn.
  originalUnitPrice?: number;
  // Số phần tối đa được hưởng giá flash sale cho mỗi khách. Phần vượt giới hạn
  // được tính theo `originalUnitPrice` (giá thường).
  flashSaleLimitPerUser?: number;
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
  originalUnitPrice?: number;
  flashSaleLimitPerUser?: number;
  variantKey?: string;
  specialInstructions?: string;
  merchantId: string;
  merchantName: string;
}

/** Kết quả tách giá một dòng giỏ hàng: phần giá sale + phần giá thường. */
export interface CartItemPricing {
  /** Số phần được tính giá flash sale. */
  saleQuantity: number;
  /** Số phần phải trả giá thường (vượt giới hạn flash sale). */
  regularQuantity: number;
  saleUnitPrice: number;
  regularUnitPrice: number;
  /** Thành tiền của dòng (đã tách giá sale / giá thường). */
  amount: number;
  /** Thành tiền nếu không có flash sale. */
  originalAmount: number;
  /** Dòng này có đang áp flash sale hay không. */
  isFlashSale: boolean;
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

/**
 * Tách giá một dòng giỏ hàng thành phần được hưởng giá flash sale và phần
 * phải trả giá thường.
 *
 * `saleQuota` là số suất flash sale còn lại của khách (server-authoritative —
 * lấy từ API validate). Nếu không truyền, dùng `flashSaleLimitPerUser` đã lưu
 * trong giỏ; nếu cũng không có thì coi như toàn bộ số lượng được hưởng giá sale
 * (hành vi cũ).
 */
export function computeCartItemPricing(
  item: CartItem,
  saleQuota?: number | null,
): CartItemPricing {
  const saleUnitPrice = item.unitPrice ?? item.menuItem?.price ?? 0;
  const originalUnitPrice = item.originalUnitPrice;
  const isFlashSale =
    originalUnitPrice != null && originalUnitPrice > saleUnitPrice;

  if (!isFlashSale) {
    const amount = saleUnitPrice * item.quantity;
    return {
      saleQuantity: item.quantity,
      regularQuantity: 0,
      saleUnitPrice,
      regularUnitPrice: saleUnitPrice,
      amount,
      originalAmount: amount,
      isFlashSale: false,
    };
  }

  const limit = saleQuota ?? item.flashSaleLimitPerUser;
  const maxSaleQuantity =
    limit == null || !Number.isFinite(limit)
      ? item.quantity
      : Math.max(0, Math.floor(limit));
  const saleQuantity = Math.min(item.quantity, maxSaleQuantity);
  const regularQuantity = item.quantity - saleQuantity;
  const regularUnitPrice = Math.max(originalUnitPrice as number, saleUnitPrice);

  return {
    saleQuantity,
    regularQuantity,
    saleUnitPrice,
    regularUnitPrice,
    amount: saleQuantity * saleUnitPrice + regularQuantity * regularUnitPrice,
    originalAmount: item.quantity * regularUnitPrice,
    isFlashSale: true,
  };
}

/**
 * Tính giá từng dòng giỏ hàng sau khi tách phần flash sale / phần giá thường.
 *
 * Giới hạn flash sale là theo khách và theo món, nên quota được chia lần lượt
 * cho các dòng cùng `menuItemId` (ví dụ nhiều biến thể của cùng một món).
 * `quotaByMenuItemId` (tuỳ chọn) là số suất còn lại do server trả về.
 */
export function computeCartLinePricing(
  items: CartItem[],
  quotaByMenuItemId?: Record<string, number> | null,
): Array<{ item: CartItem; pricing: CartItemPricing }> {
  const remainingQuota = new Map<string, number>();
  const result: Array<{ item: CartItem; pricing: CartItemPricing }> = [];
  for (const item of items) {
    const key = item.menuItem?.id ?? item.variantKey;
    if (!remainingQuota.has(key)) {
      const quota = quotaByMenuItemId?.[key];
      remainingQuota.set(
        key,
        quota != null
          ? Number(quota)
          : (item.flashSaleLimitPerUser ?? Number.POSITIVE_INFINITY),
      );
    }
    const quota = remainingQuota.get(key) as number;
    const pricing = computeCartItemPricing(item, quota);
    remainingQuota.set(key, Math.max(0, quota - pricing.saleQuantity));
    result.push({ item, pricing });
  }
  return result;
}

/**
 * Tổng tiền hàng của giỏ sau khi tách phần flash sale / phần giá thường.
 */
export function computeCartSubtotal(
  items: CartItem[],
  quotaByMenuItemId?: Record<string, number> | null,
): number {
  return computeCartLinePricing(items, quotaByMenuItemId).reduce(
    (sum, line) => sum + line.pricing.amount,
    0,
  );
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
                    // Luôn lấy giá mới nhất (vd: món đang flash sale) thay cho
                    // giá cũ đã thêm trước đó.
                    unitPrice: normalized.unitPrice,
                    originalUnitPrice:
                      normalized.originalUnitPrice ?? i.originalUnitPrice,
                    flashSaleLimitPerUser:
                      normalized.flashSaleLimitPerUser ??
                      i.flashSaleLimitPerUser,
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

      getSubtotal: () => computeCartSubtotal(get().items),
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
