"use client";

import { useEffect, useMemo, useState } from "react";
import { merchantApi, orderApi } from "@mythfood/api-client";

interface DraftOption {
  optionId: string;
  groupId: string;
  quantity?: number;
}

interface DraftLine {
  key: string;
  sourceIndex?: number;
  menuItemId: string;
  name: string;
  imageUrl?: string | null;
  unitPrice: number;
  quantity: number;
  options: DraftOption[];
  specialInstructions?: string;
}

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

function optionDelta(options: DraftOption[], item?: any): number {
  const groups = item?.optionGroups ?? [];
  let delta = 0;
  for (const opt of options) {
    const group = groups.find((g: any) => g.id === opt.groupId);
    const found = (group?.options ?? []).find(
      (o: any) => o.id === opt.optionId,
    );
    delta += toNum(found?.priceDelta) * (opt.quantity ?? 1);
  }
  return delta;
}

/**
 * Chọn option mặc định cho món mới: ưu tiên option isDefault; nếu nhóm bắt
 * buộc mà không có default thì chọn option đầu tiên để server không từ chối.
 */
function pickDefaultOptions(item: any): DraftOption[] {
  const result: DraftOption[] = [];
  for (const group of item?.optionGroups ?? []) {
    const options = group?.options ?? [];
    if (!options.length) continue;
    const max =
      group.maxSelections ?? (group.type === "CHOICE" ? 1 : options.length);
    const min = group.minSelections ?? (group.required ? 1 : 0);
    const defaults = options.filter((o: any) => o.isDefault);
    if (defaults.length > 0) {
      for (const opt of defaults.slice(0, Math.max(1, max))) {
        result.push({ optionId: opt.id, groupId: group.id, quantity: 1 });
      }
      continue;
    }
    if (min > 0) {
      for (const opt of options.slice(0, Math.max(1, min))) {
        result.push({ optionId: opt.id, groupId: group.id, quantity: 1 });
      }
    }
  }
  return result;
}

export default function OrderEditDrawer({
  order,
  onClose,
  onSubmitted,
}: {
  order: any;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [menu, setMenu] = useState<any[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    setLines(
      (order?.items ?? []).map((item: any, index: number) => ({
        key: `existing-${index}`,
        sourceIndex: index,
        menuItemId: item.menuItemId,
        name: item.name,
        imageUrl: item.imageUrl ?? null,
        unitPrice: toNum(item.unitPrice),
        quantity: toNum(item.quantity) || 1,
        options: (item.options ?? []).map((opt: any) => ({
          optionId: opt.optionId,
          groupId: opt.groupId,
          quantity: opt.quantity ?? 1,
        })),
        specialInstructions: item.specialInstructions ?? undefined,
      })),
    );
  }, [order?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await merchantApi.getMenu(order.merchantId, true);
        if (!cancelled) setMenu(Array.isArray(items) ? items : []);
      } catch {
        if (!cancelled) setMenu([]);
      } finally {
        if (!cancelled) setLoadingMenu(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order?.merchantId]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce(
      (sum, line) => sum + line.unitPrice * line.quantity,
      0,
    );
    const discount = Math.min(toNum(order?.discount), subtotal);
    const total =
      subtotal +
      toNum(order?.deliveryFee) +
      toNum(order?.serviceFee) -
      discount;
    return {
      subtotal,
      discount,
      total,
      delta: total - toNum(order?.totalAmount),
    };
  }, [
    lines,
    order?.discount,
    order?.deliveryFee,
    order?.serviceFee,
    order?.totalAmount,
  ]);

  const paymentMethod = String(order?.paymentMethod || "CASH").toUpperCase();
  const moneyHint =
    totals.delta === 0
      ? "Tổng tiền không thay đổi."
      : paymentMethod === "WALLET"
        ? totals.delta > 0
          ? `Khách sẽ bị trừ thêm ${totals.delta.toLocaleString("vi-VN")}₫ vào ví khi đồng ý.`
          : `Khách sẽ được hoàn ${Math.abs(totals.delta).toLocaleString("vi-VN")}₫ vào ví khi đồng ý.`
        : paymentMethod === "CREDIT_CARD"
          ? totals.delta > 0
            ? totals.delta < 13000
              ? `Chênh lệch nhỏ (< 13.000₫) sẽ được trừ vào ví khách khi đồng ý.`
              : `Khách sẽ thanh toán thêm ${totals.delta.toLocaleString("vi-VN")}₫ bằng thẻ.`
            : `Khách sẽ được hoàn ${Math.abs(totals.delta).toLocaleString("vi-VN")}₫ vào ví khi đồng ý.`
          : `Số tiền tài xế thu khi giao sẽ ${totals.delta > 0 ? "tăng" : "giảm"} ${Math.abs(totals.delta).toLocaleString("vi-VN")}₫.`;

  const [search, setSearch] = useState("");

  function addDish(item: any) {
    const options = pickDefaultOptions(item);
    setLines((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        menuItemId: item.id,
        name: item.name,
        imageUrl: item.imageUrl ?? null,
        unitPrice: toNum(item.price) + optionDelta(options, item),
        quantity: 1,
        options,
      },
    ]);
    setShowPicker(false);
    setSearch("");
  }

  function changeQuantity(key: string, diff: number) {
    setLines((prev) =>
      prev.map((line) =>
        line.key === key
          ? { ...line, quantity: Math.max(1, line.quantity + diff) }
          : line,
      ),
    );
  }

  function removeLine(key: string) {
    if (lines.length <= 1) {
      setError("Không thể xóa món duy nhất của đơn hàng");
      return;
    }
    setLines((prev) => prev.filter((line) => line.key !== key));
  }

  async function submit() {
    if (!reason.trim()) {
      setError("Vui lòng nhập lý do chỉnh sửa để khách nắm được");
      return;
    }
    if (lines.length === 0) {
      setError("Đơn hàng phải còn ít nhất một món");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const created = await orderApi.createChangeRequest(order.id, {
        reason: reason.trim(),
        items: lines.map((line) => ({
          ...(line.sourceIndex !== undefined
            ? { sourceIndex: line.sourceIndex }
            : {}),
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          ...(line.sourceIndex === undefined && line.options.length > 0
            ? {
                options: line.options.map((opt) => ({
                  optionId: opt.optionId,
                  groupId: opt.groupId,
                  quantity: opt.quantity ?? 1,
                })),
              }
            : {}),
          ...(line.specialInstructions
            ? { specialInstructions: line.specialInstructions }
            : {}),
        })),
      });
      setResult(created);
    } catch (e: any) {
      setError(e?.message || "Không thể tạo yêu cầu chỉnh sửa");
    } finally {
      setSubmitting(false);
    }
  }

  const availableMenu = menu
    .filter((item: any) => item.isAvailable !== false)
    .filter((item: any) =>
      search.trim()
        ? String(item.name || "")
            .toLowerCase()
            .includes(search.trim().toLowerCase())
        : true,
    );

  return (
    <div className="fixed inset-0 z-[300]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 max-h-[92vh] bg-white rounded-t-2xl flex flex-col lg:left-auto lg:right-0 lg:top-0 lg:max-h-none lg:h-full lg:w-[480px] lg:rounded-none lg:border-l lg:border-gray-200">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <p className="font-bold text-[#1a1a2e]">✏️ Chỉnh sửa đơn hàng</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Đơn #{String(order.id).slice(0, 8)} · khách phải xác nhận
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-2xl text-gray-400 hover:text-gray-600 leading-none"
          >
            ✕
          </button>
        </div>

        {result ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="text-center text-4xl">📨</div>
            <p className="text-center font-bold text-[#1a1a2e]">
              Đã gửi đề xuất tới khách hàng
            </p>
            <p className="text-center text-sm text-gray-500">
              Đơn chỉ thay đổi sau khi khách xác nhận (trong vòng 15 phút).
            </p>
            <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Tổng trước</span>
                <span>
                  {toNum(result.before?.total).toLocaleString("vi-VN")}₫
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tổng sau</span>
                <span className="font-semibold">
                  {toNum(result.after?.total).toLocaleString("vi-VN")}₫
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Chênh lệch</span>
                <span
                  className={
                    toNum(result.deltaAmount) > 0
                      ? "text-orange-600 font-semibold"
                      : "text-green-600 font-semibold"
                  }
                >
                  {toNum(result.deltaAmount) > 0 ? "+" : ""}
                  {toNum(result.deltaAmount).toLocaleString("vi-VN")}₫
                </span>
              </div>
            </div>
            <button
              onClick={onSubmitted}
              className="w-full bg-[#ff6b35] text-white py-3 rounded-xl text-sm font-semibold"
            >
              Đóng
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="bg-white rounded-xl border border-gray-100 p-3">
                <p className="font-bold text-sm text-[#1a1a2e] mb-2">
                  🛒 Món sau chỉnh sửa
                </p>
                {lines.map((line) => (
                  <div
                    key={line.key}
                    className="py-2 border-b border-gray-50 last:border-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-700 truncate">
                          {line.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {line.unitPrice.toLocaleString("vi-VN")}₫ / phần
                          {line.sourceIndex !== undefined
                            ? " · món hiện tại"
                            : " · món mới"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => changeQuantity(line.key, -1)}
                          disabled={line.quantity <= 1}
                          className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 disabled:opacity-40"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm font-semibold">
                          {line.quantity}
                        </span>
                        <button
                          onClick={() => changeQuantity(line.key, 1)}
                          className="w-7 h-7 rounded-full bg-gray-100 text-gray-600"
                        >
                          +
                        </button>
                        <button
                          onClick={() => removeLine(line.key)}
                          disabled={lines.length <= 1}
                          title={
                            lines.length <= 1
                              ? "Không thể xóa món duy nhất"
                              : "Xóa món"
                          }
                          className="w-7 h-7 rounded-full bg-red-50 text-red-500 disabled:opacity-30 ml-1"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => setShowPicker((v) => !v)}
                  className="mt-2 w-full border border-dashed border-[#ff6b35] text-[#ff6b35] py-2 rounded-xl text-sm font-medium"
                >
                  ➕ Thêm món
                </button>

                {showPicker && (
                  <div className="mt-2 border border-gray-100 rounded-xl p-2">
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Tìm món..."
                      className="w-full border rounded-lg px-2 py-1.5 text-sm outline-none mb-2"
                    />
                    {loadingMenu ? (
                      <p className="text-xs text-gray-400 text-center py-2">
                        Đang tải menu...
                      </p>
                    ) : availableMenu.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-2">
                        Không có món khả dụng
                      </p>
                    ) : (
                      <div className="max-h-56 overflow-y-auto space-y-1">
                        {availableMenu.map((item: any) => (
                          <button
                            key={item.id}
                            onClick={() => addDish(item)}
                            className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-orange-50 flex items-center justify-between gap-2"
                          >
                            <span className="text-sm text-gray-700 truncate">
                              {item.name}
                            </span>
                            <span className="text-xs text-gray-500 shrink-0">
                              {toNum(item.price).toLocaleString("vi-VN")}₫
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-100 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Tạm tính</span>
                  <span>{totals.subtotal.toLocaleString("vi-VN")}₫</span>
                </div>
                {totals.discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Giảm giá</span>
                    <span>-{totals.discount.toLocaleString("vi-VN")}₫</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Phí giao hàng</span>
                  <span>
                    {toNum(order.deliveryFee).toLocaleString("vi-VN")}₫
                  </span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t border-gray-100">
                  <span>Tổng mới (dự kiến)</span>
                  <span className="text-[#ff6b35]">
                    {totals.total.toLocaleString("vi-VN")}₫
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Chênh lệch</span>
                  <span
                    className={
                      totals.delta > 0
                        ? "text-orange-600 font-semibold"
                        : "text-green-600 font-semibold"
                    }
                  >
                    {totals.delta > 0 ? "+" : ""}
                    {totals.delta.toLocaleString("vi-VN")}₫
                  </span>
                </div>
                <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2 mt-1">
                  💳 {moneyHint}
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-700 mb-1">
                  Lý do chỉnh sửa <span className="text-red-500">*</span>
                </p>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="VD: Hết nguyên liệu món bò, thay bằng món gà..."
                  className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">
                  ⚠️ {error}
                </p>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 shrink-0 flex gap-2 bg-white">
              <button
                onClick={onClose}
                className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl text-sm font-semibold"
              >
                Hủy
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="flex-1 bg-[#ff6b35] text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                {submitting ? "Đang gửi..." : "Gửi khách xác nhận"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
