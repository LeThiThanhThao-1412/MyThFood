"use client";

import { useEffect, useState } from "react";
import type { Promotion } from "@mythfood/api-client";
import { Drawer } from "@mythfood/frontend-shared";
import type { CartItem } from "@mythfood/frontend-shared";

interface Props {
  open: boolean;
  onClose: () => void;
  promos: Promotion[];
  items: CartItem[];
  subtotal: number;
  deliveryFee: number;
  appliedCode: string | null;
  onApply: (promo: Promotion) => void;
}

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

function itemTotalFor(
  items: CartItem[],
  menuItemId: string | null | undefined,
): number {
  if (!menuItemId) return 0;
  return items
    .filter((i) => i.menuItem?.id === menuItemId)
    .reduce(
      (sum, i) => sum + (i.unitPrice ?? i.menuItem?.price ?? 0) * i.quantity,
      0,
    );
}

export function estimatePromoDiscount(
  promo: Promotion,
  subtotal: number,
  deliveryFee: number,
  items: CartItem[],
): number {
  if (promo.minOrderValue != null && subtotal < toNum(promo.minOrderValue)) {
    return 0;
  }
  let base: number;
  if (promo.target === "SHIPPING") base = deliveryFee;
  else if (promo.target === "ITEM")
    base = itemTotalFor(items, promo.menuItemId);
  else base = subtotal;

  let discount =
    promo.type === "PERCENT"
      ? (base * toNum(promo.value)) / 100
      : toNum(promo.value);
  if (promo.maxDiscount != null && discount > toNum(promo.maxDiscount)) {
    discount = toNum(promo.maxDiscount);
  }
  return Math.round(Math.max(0, Math.min(discount, base)));
}

export function isPromoEligible(
  promo: Promotion,
  subtotal: number,
  items: CartItem[],
): boolean {
  if (promo.minOrderValue != null && subtotal < toNum(promo.minOrderValue)) {
    return false;
  }
  if (promo.target === "ITEM" && itemTotalFor(items, promo.menuItemId) <= 0) {
    return false;
  }
  return true;
}

function promoLabel(promo: Promotion): string {
  const value =
    promo.type === "PERCENT"
      ? `-${toNum(promo.value)}%`
      : `-${toNum(promo.value).toLocaleString("vi-VN")}đ`;
  let target = "đơn hàng";
  if (promo.target === "SHIPPING") target = "phí ship";
  else if (promo.target === "ITEM") target = `món ${promo.menuItemName || ""}`;
  return `${value} cho ${target}`;
}

export default function PromoCodeDrawer({
  open,
  onClose,
  promos,
  items,
  subtotal,
  deliveryFee,
  appliedCode,
  onApply,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const applied = promos.find((p) => p.code === appliedCode);
    setSelectedId(applied?.id ?? null);
  }, [open, appliedCode, promos]);

  const selected = promos.find((p) => p.id === selectedId) ?? null;
  const selectedDiscount = selected
    ? estimatePromoDiscount(selected, subtotal, deliveryFee, items)
    : 0;
  const selectedEligible = selected
    ? isPromoEligible(selected, subtotal, items)
    : false;

  return (
    <Drawer open={open} onClose={onClose} title="🏷️ Chọn mã khuyến mãi">
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {promos.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">🏷️</p>
              <p className="text-gray-400 text-sm">
                Nhà hàng chưa có mã khuyến mãi nào
              </p>
            </div>
          ) : (
            promos.map((p) => {
              const discount = estimatePromoDiscount(
                p,
                subtotal,
                deliveryFee,
                items,
              );
              const eligible = isPromoEligible(p, subtotal, items);
              const isSelected = selectedId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full text-left border rounded-xl p-4 transition ${
                    isSelected
                      ? "border-[#ff6b35] bg-[#fff7ed] ring-1 ring-[#ff6b35]"
                      : "border-gray-100 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-gray-800 text-sm">
                      {p.code}
                    </span>
                    <span
                      className={`text-sm font-bold ${
                        eligible ? "text-[#ff6b35]" : "text-gray-300"
                      }`}
                    >
                      {eligible
                        ? `Giảm ${discount.toLocaleString("vi-VN")}₫`
                        : "Không đủ điều kiện"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {promoLabel(p)}
                    {p.minOrderValue != null &&
                      ` · Đơn tối thiểu ${toNum(p.minOrderValue).toLocaleString("vi-VN")}đ`}
                  </p>
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-4 shrink-0 bg-white">
          <div className="flex items-center justify-between mb-3 text-sm">
            <span className="text-gray-500">Mã đã chọn</span>
            <span className="font-bold text-[#ff6b35]">
              {selected
                ? `${selected.code} · Giảm ${selectedDiscount.toLocaleString("vi-VN")}₫`
                : "Chưa chọn"}
            </span>
          </div>
          <button
            onClick={() => selected && onApply(selected)}
            disabled={!selected || !selectedEligible}
            className="w-full bg-[#ff6b35] text-white py-3 rounded-xl font-semibold hover:bg-orange-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Áp mã
          </button>
        </div>
      </div>
    </Drawer>
  );
}
