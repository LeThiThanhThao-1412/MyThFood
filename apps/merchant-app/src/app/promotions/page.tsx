"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore, canAccessApp } from "@mythfood/frontend-shared";
import TopNav from "@/components/TopNav";
import { merchantApi, promotionApi } from "@mythfood/api-client";

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

const emptyForm = {
  code: "",
  type: "PERCENT",
  target: "FOOD",
  menuItemId: "",
  value: "",
  minOrderValue: "",
  maxDiscount: "",
  startAt: "",
  endAt: "",
  usageLimit: "",
  usageLimitPerUser: "",
};

export default function MerchantPromotionsPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [merchant, setMerchant] = useState<any>(null);
  const [promos, setPromos] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({ ...emptyForm });
  const [creating, setCreating] = useState(false);

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
            const pRes: any = await promotionApi.getByMerchant(m.id);
            setPromos(
              Array.isArray(pRes?.data)
                ? pRes.data
                : Array.isArray(pRes)
                  ? pRes
                  : [],
            );
          } catch {
            /* ignore */
          }
          try {
            const sRes: any = await promotionApi.getMerchantStats(m.id);
            setStats(sRes?.data ?? sRes ?? null);
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

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleCreate() {
    if (!merchant?.id) {
      setStatus("❌ Không tìm thấy nhà hàng");
      return;
    }
    if (!form.code.trim() || !form.value) {
      setStatus("❌ Vui lòng nhập mã và giá trị");
      return;
    }
    if (form.target === "ITEM" && !form.menuItemId) {
      setStatus("❌ Vui lòng chọn món áp dụng cho mã giảm giá");
      return;
    }
    setCreating(true);
    setStatus("");
    try {
      const selectedItem = menuItems.find(
        (mi: any) => mi.id === form.menuItemId,
      );
      await promotionApi.create({
        merchantId: merchant.id,
        code: form.code.trim().toUpperCase(),
        type: form.type as any,
        target: form.target as any,
        menuItemId:
          form.target === "ITEM" ? form.menuItemId || undefined : undefined,
        menuItemName: form.target === "ITEM" ? selectedItem?.name : undefined,
        value: Number(form.value),
        minOrderValue: form.minOrderValue
          ? Number(form.minOrderValue)
          : undefined,
        maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : undefined,
        startAt: form.startAt
          ? new Date(form.startAt).toISOString()
          : undefined,
        endAt: form.endAt ? new Date(form.endAt).toISOString() : undefined,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        usageLimitPerUser: form.usageLimitPerUser
          ? Number(form.usageLimitPerUser)
          : undefined,
      });
      setStatus("✅ Đã tạo mã khuyến mãi");
      setForm({ ...emptyForm });
      const pRes: any = await promotionApi.getByMerchant(merchant.id);
      setPromos(
        Array.isArray(pRes?.data) ? pRes.data : Array.isArray(pRes) ? pRes : [],
      );
    } catch (err: any) {
      setStatus(`❌ ${err?.message || "Tạo thất bại"}`);
    } finally {
      setCreating(false);
    }
  }

  async function toggle(p: any) {
    try {
      if (p.isActive) await promotionApi.deactivate(p.id);
      else await promotionApi.activate(p.id);
      setPromos((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, isActive: !x.isActive } : x)),
      );
    } catch {
      /* ignore */
    }
  }

  async function remove(p: any) {
    if (!confirm(`Xóa mã ${p.code}?`)) return;
    try {
      await promotionApi.remove(p.id);
      setPromos((prev) => prev.filter((x) => x.id !== p.id));
    } catch {
      /* ignore */
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
    <div className="min-h-screen bg-[#f0f2f5] max-w-[1400px] mx-auto pb-20 lg:pb-0">
      <TopNav merchantName={merchant?.name} isOpen={merchant?.isOpen} />
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <h1 className="text-2xl font-extrabold text-[#1a1a2e]">
          🏷️ Khuyến mãi
        </h1>

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-xs text-gray-400">Tổng mã</p>
              <p className="text-2xl font-bold text-[#1a1a2e]">
                {stats.totalPromotions ?? 0}
              </p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-xs text-gray-400">Đang hoạt động</p>
              <p className="text-2xl font-bold text-green-600">
                {stats.activePromotions ?? 0}
              </p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-xs text-gray-400">Lượt dùng</p>
              <p className="text-2xl font-bold text-[#1a1a2e]">
                {stats.totalUsedCount ?? 0}
              </p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-xs text-gray-400">Đã giảm</p>
              <p className="text-2xl font-bold text-[#ff6b35]">
                {toNum(stats.totalDiscount).toLocaleString("vi-VN")}đ
              </p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-bold text-lg mb-4">➕ Tạo mã khuyến mãi</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <input
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
              placeholder="Mã (VD: SALE20)"
              className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
            />
            <select
              value={form.target}
              onChange={(e) => set("target", e.target.value)}
              className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
            >
              <option value="FOOD">Giảm toàn bộ món ăn</option>
              <option value="ITEM">Giảm món cụ thể</option>
              <option value="SHIPPING">Giảm phí ship</option>
            </select>
            {form.target === "ITEM" && (
              <select
                value={form.menuItemId}
                onChange={(e) => set("menuItemId", e.target.value)}
                className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
              >
                <option value="">Chọn món áp dụng...</option>
                {menuItems.map((mi: any) => (
                  <option key={mi.id} value={mi.id}>
                    {mi.name} ({Number(mi.price).toLocaleString("vi-VN")}đ)
                  </option>
                ))}
              </select>
            )}
            <select
              value={form.type}
              onChange={(e) => set("type", e.target.value)}
              className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
            >
              <option value="PERCENT">Phần trăm (%)</option>
              <option value="FIXED">Số tiền cố định (đ)</option>
            </select>
            <input
              type="number"
              value={form.value}
              onChange={(e) => set("value", e.target.value)}
              placeholder={
                form.type === "PERCENT"
                  ? "Giá trị % (VD: 20)"
                  : "Số tiền (VD: 20000)"
              }
              className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
            />
            <input
              type="number"
              value={form.minOrderValue}
              onChange={(e) => set("minOrderValue", e.target.value)}
              placeholder="Đơn tối thiểu (đ)"
              className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
            />
            <input
              type="number"
              value={form.maxDiscount}
              onChange={(e) => set("maxDiscount", e.target.value)}
              placeholder="Giảm tối đa (đ)"
              className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
            />
            <input
              type="datetime-local"
              value={form.startAt}
              onChange={(e) => set("startAt", e.target.value)}
              className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
            />
            <input
              type="datetime-local"
              value={form.endAt}
              onChange={(e) => set("endAt", e.target.value)}
              className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
            />
            <input
              type="number"
              value={form.usageLimit}
              onChange={(e) => set("usageLimit", e.target.value)}
              placeholder="Giới hạn lượt dùng"
              className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
            />
            <input
              type="number"
              value={form.usageLimitPerUser}
              onChange={(e) => set("usageLimitPerUser", e.target.value)}
              placeholder="Giới hạn / người"
              className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="mt-4 bg-[#ff6b35] text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-orange-600 transition disabled:opacity-50"
          >
            {creating ? "Đang tạo..." : "Tạo mã"}
          </button>
          {status && (
            <p
              className={`mt-3 text-sm font-medium ${status.startsWith("✅") ? "text-green-600" : "text-red-600"}`}
            >
              {status}
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-bold text-lg mb-4">
            Danh sách mã ({promos.length})
          </h2>
          {promos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              Chưa có mã khuyến mãi nào
            </p>
          ) : (
            <div className="space-y-3">
              {promos.map((p: any) => (
                <div
                  key={p.id}
                  className="border border-gray-100 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800">
                      {p.code}{" "}
                      <span className="text-xs font-normal text-gray-400">
                        (
                        {p.target === "SHIPPING"
                          ? "Giảm ship"
                          : p.target === "ITEM"
                            ? `Món: ${p.menuItemName || p.menuItemId || "?"}`
                            : "Giảm món"}
                        )
                      </span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {p.type === "PERCENT"
                        ? `${p.value}%`
                        : `${toNum(p.value).toLocaleString("vi-VN")}đ`}
                      {p.minOrderValue != null &&
                        ` · Đơn tối thiểu ${toNum(p.minOrderValue).toLocaleString("vi-VN")}đ`}
                      {p.maxDiscount != null &&
                        ` · Giảm tối đa ${toNum(p.maxDiscount).toLocaleString("vi-VN")}đ`}
                      {" · "}
                      {p.usedCount ?? 0} lượt dùng
                      {" · "}
                      {p.fundedBy === "PLATFORM"
                        ? "Platform tài trợ"
                        : "Merchant tài trợ"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-semibold ${p.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                    >
                      {p.isActive ? "✓ Active" : "Tắt"}
                    </span>
                    <button
                      onClick={() => toggle(p)}
                      className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-100"
                    >
                      {p.isActive ? "Tắt" : "Bật"}
                    </button>
                    <button
                      onClick={() => remove(p)}
                      className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg font-semibold hover:bg-red-100"
                    >
                      Xóa
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
