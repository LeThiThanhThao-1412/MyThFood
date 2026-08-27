"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  MenuItem,
  MenuItemOptionGroup,
  SelectedMenuItemOption,
  SelectedOptionGroup,
} from "@mythfood/api-client";
import { computeUnitPrice } from "@mythfood/frontend-shared";

interface Props {
  menuItem: MenuItem | null;
  onClose: () => void;
  onAdd: (payload: {
    selectedGroups: SelectedOptionGroup[];
    quantity: number;
    note: string;
  }) => void;
}

type SelectionState = Record<string, SelectedMenuItemOption[]>;

function toSelected(
  group: MenuItemOptionGroup,
  option: MenuItemOptionGroup["options"][number],
  quantity = 1,
): SelectedMenuItemOption {
  return {
    optionId: option.id,
    groupId: group.id,
    groupName: group.name,
    name: option.name,
    priceDelta: option.priceDelta,
    quantity,
  };
}

function initState(groups?: MenuItemOptionGroup[]): SelectionState {
  const state: SelectionState = {};
  for (const g of groups || []) {
    if (g.type === "CHOICE") {
      const def = g.options.find((o) => o.isDefault) ?? g.options[0];
      if (def) state[g.id] = [toSelected(g, def)];
    } else if (g.type === "TOGGLE") {
      const def = g.options.find((o) => o.isDefault);
      if (def) state[g.id] = [toSelected(g, def)];
    }
  }
  return state;
}

export default function MenuItemOptionDrawer({
  menuItem,
  onClose,
  onAdd,
}: Props) {
  const [selection, setSelection] = useState<SelectionState>({});
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (menuItem) {
      setSelection(initState(menuItem.optionGroups));
      setQuantity(1);
      setNote("");
    }
  }, [menuItem?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = menuItem?.optionGroups ?? [];

  const selectedGroups: SelectedOptionGroup[] = useMemo(() => {
    return groups
      .map((g) => ({
        groupId: g.id,
        groupName: g.name,
        type: g.type,
        options: selection[g.id] ?? [],
      }))
      .filter((g) => g.options.length > 0);
  }, [groups, selection]);

  const basePrice = menuItem?.price ?? 0;
  const unitPrice = menuItem ? computeUnitPrice(menuItem, selectedGroups) : 0;
  const optionTotal = unitPrice - basePrice;
  const totalPrice = unitPrice * quantity;

  const isGroupSatisfied = (g: MenuItemOptionGroup): boolean => {
    if (!g.required) return true;
    if (g.type === "TOGGLE" || g.type === "QUANTITY") return true;
    const count = (selection[g.id] ?? []).length;
    if (g.type === "CHOICE") return count === 1;
    return count >= (g.minSelections ?? 1);
  };

  const allSatisfied = groups.every(isGroupSatisfied);

  const selectChoice = (g: MenuItemOptionGroup, optionId: string) => {
    const opt = g.options.find((o) => o.id === optionId);
    if (!opt) return;
    setSelection((s) => ({ ...s, [g.id]: [toSelected(g, opt)] }));
  };

  const toggleMulti = (g: MenuItemOptionGroup, optionId: string) => {
    const opt = g.options.find((o) => o.id === optionId);
    if (!opt) return;
    setSelection((s) => {
      const current = s[g.id] ?? [];
      const exists = current.some((o) => o.optionId === optionId);
      if (exists)
        return { ...s, [g.id]: current.filter((o) => o.optionId !== optionId) };
      const max = g.maxSelections ?? Infinity;
      const next = [...current, toSelected(g, opt)];
      if (next.length > max) return s;
      return { ...s, [g.id]: next };
    });
  };

  const toggleSwitch = (g: MenuItemOptionGroup) => {
    const opt = g.options[0];
    if (!opt) return;
    setSelection((s) => {
      const current = s[g.id] ?? [];
      if (current.length > 0) return { ...s, [g.id]: [] };
      return { ...s, [g.id]: [toSelected(g, opt)] };
    });
  };

  const setOptionQuantity = (
    g: MenuItemOptionGroup,
    optionId: string,
    qty: number,
  ) => {
    const opt = g.options.find((o) => o.id === optionId);
    if (!opt) return;
    const min = opt.minQuantity ?? 0;
    const max = opt.maxQuantity ?? 99;
    const clamped = Math.max(min, Math.min(max, qty));
    setSelection((s) => {
      const current = s[g.id] ?? [];
      if (clamped <= 0) {
        return { ...s, [g.id]: current.filter((o) => o.optionId !== optionId) };
      }
      const idx = current.findIndex((o) => o.optionId === optionId);
      const selected = toSelected(g, opt, clamped);
      if (idx >= 0) {
        const next = [...current];
        next[idx] = selected;
        return { ...s, [g.id]: next };
      }
      return { ...s, [g.id]: [...current, selected] };
    });
  };

  if (!menuItem) return null;

  const renderGroup = (g: MenuItemOptionGroup) => {
    const sel = selection[g.id] ?? [];
    return (
      <div key={g.id} className="space-y-2.5">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-800 text-sm">{g.name}</span>
          {g.required ? (
            <span className="text-[10px] font-bold text-[#ff6b35] bg-[#fff1ea] rounded-md px-1.5 py-0.5">
              Bắt buộc
            </span>
          ) : (
            <span className="text-[10px] text-gray-400">Không bắt buộc</span>
          )}
        </div>

        {g.type === "CHOICE" &&
          g.options.map((o) => {
            const checked = sel.some((s) => s.optionId === o.id);
            return (
              <button
                key={o.id}
                onClick={() => selectChoice(g, o.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition ${checked ? "border-[#ff6b35] bg-[#fff7ed]" : "border-gray-200 bg-white hover:border-gray-300"}`}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${checked ? "border-[#ff6b35]" : "border-gray-300"}`}
                  >
                    {checked && (
                      <span className="w-2 h-2 rounded-full bg-[#ff6b35]" />
                    )}
                  </span>
                  <span
                    className={
                      checked ? "font-medium text-gray-800" : "text-gray-600"
                    }
                  >
                    {o.name}
                  </span>
                </span>
                {o.priceDelta !== 0 && (
                  <span className="text-xs text-gray-400">
                    {o.priceDelta > 0 ? "+" : ""}
                    {o.priceDelta.toLocaleString("vi-VN")}₫
                  </span>
                )}
              </button>
            );
          })}

        {g.type === "MULTI_CHOICE" &&
          g.options.map((o) => {
            const checked = sel.some((s) => s.optionId === o.id);
            return (
              <button
                key={o.id}
                onClick={() => toggleMulti(g, o.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition ${checked ? "border-[#ff6b35] bg-[#fff7ed]" : "border-gray-200 bg-white hover:border-gray-300"}`}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center text-white text-[10px] ${checked ? "bg-[#ff6b35] border-[#ff6b35]" : "border-gray-300 bg-white"}`}
                  >
                    {checked && "✓"}
                  </span>
                  <span
                    className={
                      checked ? "font-medium text-gray-800" : "text-gray-600"
                    }
                  >
                    {o.name}
                  </span>
                </span>
                {o.priceDelta !== 0 && (
                  <span className="text-xs text-gray-400">
                    {o.priceDelta > 0 ? "+" : ""}
                    {o.priceDelta.toLocaleString("vi-VN")}₫
                  </span>
                )}
              </button>
            );
          })}

        {g.type === "TOGGLE" &&
          g.options.map((o) => {
            const on = sel.some((s) => s.optionId === o.id);
            return (
              <div
                key={o.id}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-200"
              >
                <span className="text-sm text-gray-700">{o.name}</span>
                <button
                  onClick={() => toggleSwitch(g)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${on ? "bg-[#ff6b35]" : "bg-gray-300"}`}
                  aria-label={o.name}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`}
                  />
                </button>
              </div>
            );
          })}

        {g.type === "QUANTITY" &&
          g.options.map((o) => {
            const selected = sel.find((s) => s.optionId === o.id);
            const qty = selected?.quantity ?? 0;
            return (
              <div
                key={o.id}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-200"
              >
                <div>
                  <p className="text-sm text-gray-700">{o.name}</p>
                  {o.priceDelta !== 0 && (
                    <p className="text-xs text-gray-400">
                      {o.priceDelta > 0 ? "+" : ""}
                      {o.priceDelta.toLocaleString("vi-VN")}₫ / phần
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setOptionQuantity(g, o.id, qty - 1)}
                    className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium transition"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-bold text-gray-800">
                    {qty}
                  </span>
                  <button
                    onClick={() => setOptionQuantity(g, o.id, qty + 1)}
                    className="w-8 h-8 rounded-lg bg-[#ff6b35] hover:bg-orange-600 text-white text-sm font-medium transition"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl max-h-[92vh] sm:max-h-[85vh] flex flex-col shadow-2xl animate-fade-in-up overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex gap-3 min-w-0">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#f093fb] to-[#f5576c] flex items-center justify-center text-2xl shrink-0">
              🍜
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-gray-800 text-lg leading-snug">
                {menuItem.name}
              </h2>
              <p className="text-[#ff6b35] font-bold">
                {basePrice.toLocaleString("vi-VN")}₫
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 text-lg transition shrink-0"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        {!allSatisfied && (
          <div className="mx-5 mt-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-3 py-2 text-xs flex items-center gap-2">
            <span>⚠️</span>
            <span>Vui lòng chọn các tùy chọn bắt buộc bên dưới</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {groups.map(renderGroup)}

          {/* ===== GHI CHÚ ===== */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-800 text-sm">
                Ghi chú
              </span>
              <span className="text-[10px] text-gray-400">Không bắt buộc</span>
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú cho món này... (vd: ít đá, không cay, bỏ hành...)"
              rows={2}
              className="w-full bg-gray-50 rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:bg-white focus:border-[#ff6b35] focus:ring-2 focus:ring-orange-200 outline-none resize-none transition"
            />
          </div>
        </div>

        <div className="border-t border-gray-100 px-5 py-4 bg-white">
          {/* Số lượng */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">Số lượng</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium transition"
              >
                −
              </button>
              <span className="w-8 text-center text-sm font-bold text-gray-800">
                {quantity}
              </span>
              <button
                onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                className="w-9 h-9 rounded-lg bg-[#ff6b35] hover:bg-orange-600 text-white text-sm font-medium transition"
              >
                +
              </button>
            </div>
          </div>

          {/* Tạm tính */}
          <div className="flex items-center justify-between mb-3 text-sm">
            <span className="text-gray-500">Tạm tính</span>
            <div className="text-right">
              {optionTotal !== 0 && (
                <p className="text-xs text-gray-400">
                  {basePrice.toLocaleString("vi-VN")}₫
                  {optionTotal > 0 ? " + " : " − "}
                  {Math.abs(optionTotal).toLocaleString("vi-VN")}₫ / phần
                </p>
              )}
              <p className="text-lg font-extrabold text-[#ff6b35]">
                {totalPrice.toLocaleString("vi-VN")}₫
              </p>
            </div>
          </div>

          <button
            onClick={() => onAdd({ selectedGroups, quantity, note })}
            disabled={!allSatisfied}
            className="w-full bg-gradient-to-r from-[#ff6b35] to-[#ff8f65] text-white py-3.5 rounded-2xl font-bold text-base hover:shadow-lg hover:shadow-orange-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Thêm vào giỏ • {totalPrice.toLocaleString("vi-VN")}₫
          </button>
        </div>
      </div>
    </div>
  );
}
