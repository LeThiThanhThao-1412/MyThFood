"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore, canAccessApp } from "@mythfood/frontend-shared";
import MerchantShell from "@/components/MerchantShell";
import { merchantApi, promotionApi } from "@mythfood/api-client";

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  SCHEDULED: { label: "⏰ Sắp diễn ra", cls: "bg-blue-100 text-blue-700" },
  ACTIVE: { label: "🔥 Đang chạy", cls: "bg-orange-100 text-orange-700" },
  PAUSED: { label: "⏸️ Tạm dừng", cls: "bg-purple-100 text-purple-700" },
  ENDED: { label: "✅ Đã kết thúc", cls: "bg-gray-100 text-gray-500" },
  CANCELLED: { label: "❌ Đã hủy", cls: "bg-red-100 text-red-600" },
  SOLD_OUT: { label: "🏁 Hết suất", cls: "bg-yellow-100 text-yellow-700" },
};

type ItemRow = {
  key: string;
  menuItemId: string;
  discountType: string;
  value: string;
  totalQuantity: string;
  limitPerUser: string;
};

const emptySale = { title: "", startAt: "", endAt: "" };

let rowSeq = 0;
const newRow = (): ItemRow => ({
  key: `row-${++rowSeq}`,
  menuItemId: "",
  discountType: "PERCENT",
  value: "",
  totalQuantity: "",
  limitPerUser: "",
});

export default function MerchantFlashSalesPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [merchant, setMerchant] = useState<any>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({ ...emptySale });
  const [rows, setRows] = useState<ItemRow[]>([newRow()]);
  const [creating, setCreating] = useState(false);
  const [stockEdits, setStockEdits] = useState<
    Record<string, { totalQuantity: string; limitPerUser: string }>
  >({});

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (!canAccessApp(user?.roles, "MERCHANT")) {
      clearAuth();
      router.push("/login");
      return;
    }
    async function load() {
      try {
        const res = await merchantApi.list({ take: 200 });
        const m =
          (res.items || []).find((m2: any) => m2.userId === user?.id) || null;
        setMerchant(m);
        if (m?.id) {
          try {
            const fsRes: any = await promotionApi.flashSale.getByMerchant(m.id);
            setSales(Array.isArray(fsRes?.items) ? fsRes.items : []);
          } catch {
            /* ignore */
          }
          try {
            const menu: any = await merchantApi.getMenu(m.id, true);
            setMenuItems(Array.isArray(menu) ? menu : []);
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isAuthenticated, user, router, clearAuth]);

  function setSale(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setRow(key: string, field: string, value: string) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)),
    );
  }

  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }

  function removeRow(key: string) {
    setRows((prev) =>
      prev.length > 1 ? prev.filter((r) => r.key !== key) : prev,
    );
  }

  function rowSalePrice(r: ItemRow): number | null {
    const mi = menuItems.find((m: any) => m.id === r.menuItemId);
    if (!mi) return null;
    const base = Number(mi.price) || 0;
    const value = Number(r.value);
    if (!value || value <= 0) return null;
    if (r.discountType === "PERCENT") {
      if (value >= 100) return null;
      return Math.round((base * (100 - value)) / 100);
    }
    return value;
  }

  async function handleCreate() {
    if (!merchant?.id) {
      setStatus("❌ Không tìm thấy nhà hàng");
      return;
    }
    if (!form.startAt || !form.endAt) {
      setStatus("❌ Vui lòng chọn thời gian bắt đầu và kết thúc");
      return;
    }
    const validRows = rows.filter((r) => r.menuItemId);
    if (validRows.length === 0) {
      setStatus("❌ Vui lòng chọn ít nhất 1 món");
      return;
    }
    for (const r of validRows) {
      const mi = menuItems.find((m: any) => m.id === r.menuItemId);
      const value = Number(r.value);
      const totalQuantity = Number(r.totalQuantity);
      if (
        r.discountType === "PERCENT" &&
        (!value || value <= 0 || value >= 100)
      ) {
        setStatus(
          `❌ Món "${mi?.name || "?"}": phần trăm giảm phải trong (0, 100)`,
        );
        return;
      }
      if (r.discountType === "FIXED_PRICE" && (!value || value <= 0)) {
        setStatus(`❌ Món "${mi?.name || "?"}": giá sale phải lớn hơn 0`);
        return;
      }
      if (!totalQuantity || totalQuantity <= 0) {
        setStatus(`❌ Món "${mi?.name || "?"}": số lượng bán phải lớn hơn 0`);
        return;
      }
    }
    setCreating(true);
    setStatus("");
    try {
      await promotionApi.flashSale.create({
        merchantId: merchant.id,
        title: form.title.trim() || undefined,
        items: validRows.map((r) => {
          const mi = menuItems.find((m: any) => m.id === r.menuItemId);
          const value = Number(r.value);
          return {
            menuItemId: r.menuItemId,
            menuItemName: mi?.name,
            imageUrl: mi?.imageUrl,
            originalPrice: Number(mi?.price) || 0,
            discountType: r.discountType as any,
            discountPercent: r.discountType === "PERCENT" ? value : undefined,
            salePrice: r.discountType === "FIXED_PRICE" ? value : undefined,
            totalQuantity: Number(r.totalQuantity),
            limitPerUser: r.limitPerUser ? Number(r.limitPerUser) : undefined,
          };
        }),
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
      });
      setStatus("✅ Đã tạo flash sale");
      setForm({ ...emptySale });
      setRows([newRow()]);
      const fsRes: any = await promotionApi.flashSale.getByMerchant(
        merchant.id,
      );
      setSales(Array.isArray(fsRes?.items) ? fsRes.items : []);
    } catch (err: any) {
      setStatus(`❌ ${err?.message || "Tạo thất bại"}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleCancel(s: any) {
    if (!confirm(`Hủy flash sale "${s.title}"?`)) return;
    try {
      await promotionApi.flashSale.cancel(s.id);
      const fsRes: any = await promotionApi.flashSale.getByMerchant(
        merchant.id,
      );
      setSales(Array.isArray(fsRes?.items) ? fsRes.items : []);
    } catch {
      /* ignore */
    }
  }

  async function refreshSales() {
    const fsRes: any = await promotionApi.flashSale.getByMerchant(merchant.id);
    setSales(Array.isArray(fsRes?.items) ? fsRes.items : []);
  }

  async function handlePause(s: any) {
    if (!confirm(`Tạm dừng flash sale "${s.title}"?`)) return;
    try {
      await promotionApi.flashSale.pause(s.id);
      await refreshSales();
    } catch {
      /* ignore */
    }
  }

  async function handleResume(s: any) {
    try {
      await promotionApi.flashSale.resume(s.id);
      await refreshSales();
    } catch {
      /* ignore */
    }
  }

  function stockEditFor(it: any) {
    return (
      stockEdits[it.id] ?? {
        totalQuantity: String(it.totalQuantity ?? 0),
        limitPerUser: String(it.limitPerUser ?? 1),
      }
    );
  }

  function setStockEdit(itemId: string, field: string, value: string) {
    setStockEdits((prev) => {
      const cur = prev[itemId] ?? { totalQuantity: "", limitPerUser: "" };
      return { ...prev, [itemId]: { ...cur, [field]: value } };
    });
  }

  async function saveStock(s: any, it: any) {
    const e = stockEditFor(it);
    const totalQuantity = Number(e.totalQuantity);
    if (!totalQuantity || totalQuantity <= 0) {
      setStatus(`❌ Món "${it.menuItemName || "?"}": tổng suất phải lớn hơn 0`);
      return;
    }
    try {
      await promotionApi.flashSale.update(s.id, {
        items: [
          {
            id: it.id,
            totalQuantity,
            limitPerUser: e.limitPerUser ? Number(e.limitPerUser) : undefined,
          },
        ],
      });
      setStatus("✅ Đã cập nhật stock");
      const fsRes: any = await promotionApi.flashSale.getByMerchant(
        merchant.id,
      );
      setSales(Array.isArray(fsRes?.items) ? fsRes.items : []);
    } catch (err: any) {
      setStatus(`❌ ${err?.message || "Cập nhật thất bại"}`);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <MerchantShell>
        <h1 className="text-2xl font-extrabold text-[#1a1a2e]">
          🔥 Flash Sale
        </h1>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-bold text-lg mb-4">Tạo flash sale mới</h2>
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <input
              type="text"
              value={form.title}
              onChange={(e) => setSale("title", e.target.value)}
              placeholder="Tên chiến dịch (VD: Sale giờ trưa)"
              className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
            />
            <input
              type="datetime-local"
              value={form.startAt}
              onChange={(e) => setSale("startAt", e.target.value)}
              className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
            />
            <input
              type="datetime-local"
              value={form.endAt}
              onChange={(e) => setSale("endAt", e.target.value)}
              className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
            />
          </div>

          <p className="text-sm font-semibold text-gray-600 mb-2">
            Món áp dụng ({rows.length})
          </p>
          <div className="space-y-3">
            {rows.map((r) => {
              const mi = menuItems.find((m: any) => m.id === r.menuItemId);
              const salePrice = rowSalePrice(r);
              return (
                <div
                  key={r.key}
                  className="border border-gray-100 rounded-xl p-3 grid sm:grid-cols-2 lg:grid-cols-6 gap-2 items-center"
                >
                  <select
                    value={r.menuItemId}
                    onChange={(e) =>
                      setRow(r.key, "menuItemId", e.target.value)
                    }
                    className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35] lg:col-span-2"
                  >
                    <option value="">Chọn món…</option>
                    {menuItems.map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — {toNum(m.price).toLocaleString("vi-VN")}đ
                      </option>
                    ))}
                  </select>
                  <select
                    value={r.discountType}
                    onChange={(e) =>
                      setRow(r.key, "discountType", e.target.value)
                    }
                    className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
                  >
                    <option value="PERCENT">Giảm %</option>
                    <option value="FIXED_PRICE">Giá cố định</option>
                  </select>
                  <input
                    type="number"
                    value={r.value}
                    onChange={(e) => setRow(r.key, "value", e.target.value)}
                    placeholder={
                      r.discountType === "PERCENT" ? "% giảm" : "Giá sale"
                    }
                    className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
                  />
                  <input
                    type="number"
                    value={r.totalQuantity}
                    onChange={(e) =>
                      setRow(r.key, "totalQuantity", e.target.value)
                    }
                    placeholder="Suất bán"
                    className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
                  />
                  <input
                    type="number"
                    value={r.limitPerUser}
                    onChange={(e) =>
                      setRow(r.key, "limitPerUser", e.target.value)
                    }
                    placeholder="Limit/khách"
                    className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
                  />
                  <div className="flex items-center gap-2">
                    {mi && salePrice != null && (
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        {toNum(mi.price).toLocaleString("vi-VN")}đ →{" "}
                        <b className="text-[#ff6b35]">
                          {salePrice.toLocaleString("vi-VN")}đ
                        </b>
                      </span>
                    )}
                    <button
                      onClick={() => removeRow(r.key)}
                      className="text-xs bg-red-50 text-red-600 px-2.5 py-1.5 rounded-lg font-semibold hover:bg-red-100"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={addRow}
            className="mt-3 text-sm bg-blue-50 text-blue-600 px-4 py-2 rounded-xl font-semibold hover:bg-blue-100"
          >
            + Thêm món
          </button>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="bg-[#ff6b35] text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-orange-600 transition disabled:opacity-50"
            >
              {creating ? "Đang tạo..." : "Tạo flash sale"}
            </button>
            {status && (
              <p
                className={`text-sm font-medium ${status.startsWith("✅") ? "text-green-600" : "text-red-600"}`}
              >
                {status}
              </p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-bold text-lg mb-4">
            Danh sách flash sale ({sales.length})
          </h2>
          {sales.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              Chưa có flash sale nào
            </p>
          ) : (
            <div className="space-y-3">
              {sales.map((s: any) => {
                const items = Array.isArray(s.items) ? s.items : [];
                const meta = STATUS_META[s.status] ?? STATUS_META.ENDED;
                return (
                  <div
                    key={s.id}
                    className="border border-gray-100 rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                      <div>
                        <p className="font-bold text-gray-800">
                          {s.title || "Flash Sale"}{" "}
                          <span className="text-xs font-normal text-gray-400">
                            ({items.length} món)
                          </span>
                        </p>
                        <p className="text-xs text-gray-500">
                          🕒 {new Date(s.startAt).toLocaleString("vi-VN")} →{" "}
                          {new Date(s.endAt).toLocaleString("vi-VN")}
                          {s.fundedBy === "PLATFORM"
                            ? " · Platform tài trợ"
                            : " · Merchant tài trợ"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-semibold ${meta.cls}`}
                        >
                          {meta.label}
                        </span>
                        {s.status === "ACTIVE" && (
                          <button
                            onClick={() => handlePause(s)}
                            className="text-xs bg-purple-50 text-purple-600 px-3 py-1.5 rounded-lg font-semibold hover:bg-purple-100"
                          >
                            Tạm dừng
                          </button>
                        )}
                        {s.status === "PAUSED" && (
                          <button
                            onClick={() => handleResume(s)}
                            className="text-xs bg-green-50 text-green-600 px-3 py-1.5 rounded-lg font-semibold hover:bg-green-100"
                          >
                            Tiếp tục
                          </button>
                        )}
                        {(s.status === "ACTIVE" ||
                          s.status === "SCHEDULED" ||
                          s.status === "PAUSED") && (
                          <button
                            onClick={() => handleCancel(s)}
                            className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg font-semibold hover:bg-red-100"
                          >
                            Hủy
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      {items.map((it: any) => {
                        const e = stockEditFor(it);
                        return (
                          <div
                            key={it.id}
                            className="flex items-center justify-between gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 flex-wrap"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="truncate font-medium">
                                {it.menuItemName || "Món"}
                              </span>
                              <span className="ml-2 text-xs whitespace-nowrap">
                                <span className="line-through text-gray-400">
                                  {toNum(it.originalPrice).toLocaleString(
                                    "vi-VN",
                                  )}
                                  đ
                                </span>{" "}
                                →{" "}
                                <b className="text-[#ff6b35]">
                                  {toNum(it.salePrice).toLocaleString("vi-VN")}đ
                                </b>{" "}
                                · Đã bán {it.soldQuantity ?? 0}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={e.totalQuantity}
                                onChange={(ev) =>
                                  setStockEdit(
                                    it.id,
                                    "totalQuantity",
                                    ev.target.value,
                                  )
                                }
                                placeholder="Tổng suất"
                                className="w-20 border rounded-lg px-2 py-1 text-xs outline-none focus:border-[#ff6b35]"
                              />
                              <input
                                type="number"
                                value={e.limitPerUser}
                                onChange={(ev) =>
                                  setStockEdit(
                                    it.id,
                                    "limitPerUser",
                                    ev.target.value,
                                  )
                                }
                                placeholder="Limit"
                                className="w-16 border rounded-lg px-2 py-1 text-xs outline-none focus:border-[#ff6b35]"
                              />
                              <button
                                onClick={() => saveStock(s, it)}
                                className="text-xs bg-green-50 text-green-600 px-2.5 py-1.5 rounded-lg font-semibold hover:bg-green-100"
                              >
                                Lưu
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
    </MerchantShell>
  );
}
