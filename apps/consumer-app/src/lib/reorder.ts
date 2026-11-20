"use client";
import { merchantApi } from "@mythfood/api-client";
import type {
  MenuItem,
  MenuItemOptionGroup,
  SelectedOptionGroup,
  SelectedMenuItemOption,
} from "@mythfood/api-client";
import { useCartStore } from "@mythfood/frontend-shared";

export interface ReorderResult {
  ok: boolean;
  added: number;
  skipped: number;
  merchantName: string;
  error?: string;
}

/**
 * Đặt lại (re-order) một đơn cũ:
 * - fetch merchant + menu hiện tại để dùng giá/trạng thái mới nhất
 * - match theo `menuItemId`, bỏ qua món đã ngưng bán / hết hàng
 * - giữ nguyên tuỳ chọn đã chọn nếu vẫn khớp với optionGroups hiện tại
 * - ghi đè giỏ hàng (cart chỉ chứa 1 nhà hàng)
 */
export async function reorderOrder(order: any): Promise<ReorderResult> {
  const cart = useCartStore.getState();
  const merchantId = order?.merchantId;
  if (!merchantId) {
    return {
      ok: false,
      added: 0,
      skipped: 0,
      merchantName: "",
      error: "Đơn không có merchantId",
    };
  }

  try {
    const merchant = await merchantApi.getById(merchantId);
    const menuData = await merchantApi.getMenu(merchantId, true);
    const menu: any[] = Array.isArray(menuData) ? menuData : [];

    const menuById = new Map<string, any>(menu.map((m) => [m.id, m]));
    const menuByName = new Map<string, any>(
      menu.map((m) => [String(m.name ?? "").toLowerCase(), m]),
    );
    let added = 0;
    let skipped = 0;

    for (const item of order?.items ?? []) {
      let menuItem = item.menuItemId
        ? menuById.get(item.menuItemId)
        : undefined;
      // Fallback: khớp theo tên món khi đơn cũ không còn lưu menuItemId
      if (!menuItem && item.name) {
        menuItem = menuByName.get(String(item.name).toLowerCase());
      }
      if (!menuItem) {
        skipped += 1;
        continue;
      }
      if (menuItem.isAvailable === false) {
        skipped += 1;
        continue;
      }

      const quantity = Number(item.quantity) || 1;
      const selectedGroups = buildSelectedGroups(menuItem, item.options);
      cart.addItem({
        menuItem: menuItem as MenuItem,
        quantity,
        selectedGroups,
        specialInstructions: item.specialInstructions,
        merchantId,
        merchantName: merchant?.name || "Nhà hàng",
      });
      added += 1;
    }

    return {
      ok: added > 0,
      added,
      skipped,
      merchantName: merchant?.name || "Nhà hàng",
    };
  } catch (err: any) {
    return {
      ok: false,
      added: 0,
      skipped: 0,
      merchantName: "",
      error: "Không thể đặt lại đơn: " + (err?.message || "lỗi không xác định"),
    };
  }
}

/**
 * Reconstruct the cart's `SelectedOptionGroup[]` from an order's flat
 * `SelectedMenuItemOption[]` using the menu item's current option groups.
 * If a selected option no longer exists, it is dropped gracefully.
 */
function buildSelectedGroups(
  menuItem: any,
  orderOptions?: any[] | null,
): SelectedOptionGroup[] | undefined {
  if (!orderOptions || orderOptions.length === 0) {
    return undefined;
  }
  const groups: (MenuItemOptionGroup & { _selected?: any[] })[] =
    menuItem?.optionGroups || [];
  if (groups.length === 0) {
    return undefined;
  }

  const selectedGroups: SelectedOptionGroup[] = [];
  const seen = new Set<string>();

  for (const opt of orderOptions) {
    const group = groups.find((g: any) => g.id === opt.groupId);
    if (!group) continue;
    const option = group.options.find((o: any) => o.id === opt.optionId);
    if (!option) continue;

    const selected: SelectedMenuItemOption = {
      optionId: option.id,
      groupId: group.id,
      groupName: group.name,
      name: option.name,
      priceDelta: option.priceDelta ?? 0,
      quantity: opt.quantity ?? option.minQuantity ?? 1,
    };

    if (!seen.has(group.id)) {
      seen.add(group.id);
      selectedGroups.push({
        groupId: group.id,
        groupName: group.name,
        type: group.type,
        options: [selected],
      });
    } else {
      const target = selectedGroups.find((g) => g.groupId === group.id);
      if (target) {
        target.options.push(selected);
      }
    }
  }

  return selectedGroups.length > 0 ? selectedGroups : undefined;
}
