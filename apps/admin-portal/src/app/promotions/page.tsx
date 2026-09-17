"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { merchantApi, promotionApi } from "@mythfood/api-client";
import { useAuthStore } from "@mythfood/frontend-shared";

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

const emptyForm = {
  merchantId: "",
  code: "",
  type: "PERCENT",
  target: "FOOD",
  value: "",
  minOrderValue: "",
  maxDiscount: "",
  startAt: "",
  endAt: "",
  usageLimit: "",
  usageLimitPerUser: "",
};

export default function AdminPromotionsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [promos, setPromos] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({ ...emptyForm });
  const [creating, setCreating] = useState(false);
  const [compConfig, setCompConfig] = useState<any>(null);
  const [compValue, setCompValue] = useState("");
  const [compActive, setCompActive] = useState(true);
  const [compStatus, setCompStatus] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    async function load() {
      try {
        const mRes: any = await merchantApi.list({ take: 500 });
        setMerchants(mRes.items || []);
        const pRes: any = await promotionApi.list({ take: 200 });
        setPromos(pRes.items || []);
        try {
          const cRes: any = await promotionApi.getCompensationConfig();
          const cfg = cRes?.data ?? cRes;
          if (cfg) {
            setCompConfig(cfg);
            setCompValue(String(cfg.value ?? 15000));
            setCompActive(cfg.isActive !== false);
          }
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isAuthenticated, router]);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleCreate() {
    if (!form.merchantId) {
      setStatus("❌ Vui lòng chọn nhà hàng");
      return;
    }
    if (!form.code.trim() || !form.value) {
      setStatus("❌ Vui lòng nhập mã và giá trị");
      return;
    }
    setCreating(true);
    setStatus("");
    try {
      await promotionApi.create({
        merchantId: form.merchantId,
        code: form.code.trim().toUpperCase(),
        type: form.type as any,
        target: form.target as any,
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
      setStatus("✅ Đã tạo mã khuyến mãi (Platform tài trợ)");
      setForm({ ...emptyForm });
      const pRes: any = await promotionApi.list({ take: 200 });
      setPromos(pRes.items || []);
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

  async function saveCompConfig() {
    const value = Number(compValue);
    if (!value || value <= 0) {
      setCompStatus("❌ Giá trị voucher phải lớn hơn 0");
      return;
    }
    setCompStatus("");
    try {
      const res: any = await promotionApi.updateCompensationConfig({
        value,
        isActive: compActive,
      });
      const cfg = res?.data ?? res;
      setCompConfig(cfg);
      setCompStatus("✅ Đã cập nhật voucher bồi thường");
    } catch (err: any) {
      setCompStatus(`❌ ${err?.message || "Cập nhật thất bại"}`);
    }
  }

  const merchantName = (id: string) =>
    merchants.find((m) => m.id === id)?.name || id.slice(0, 8);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] max-w-[1400px] mx-auto pb-20 lg:pb-0 w-full">
      <header className="bg-[#1a1a2e] px-4 sm:px-6 py-4 text-white">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-white/60 text-lg">
            ←
          </Link>
          <h1 className="text-lg font-bold">🏷️ Quản lý khuyến mãi</h1>
          <div className="w-6" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-bold text-lg mb-4">
            🎁 Voucher bồi thường (đơn hủy do không có tài xế)
          </h2>
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <label className="text-sm">
              <span className="text-gray-500 block mb-1">Giá trị (VND)</span>
              <input
                type="number"
                min={0}
                value={compValue}
                onChange={(e) => setCompValue(e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
                placeholder="15000"
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 py-2.5">
              <input
                type="checkbox"
                checked={compActive}
                onChange={(e) => setCompActive(e.target.checked)}
              />
              Bật tự động phát voucher
            </label>
            <button
              onClick={saveCompConfig}
              className="bg-[#ff6b35] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-orange-600 transition"
            >
              💾 Lưu cấu hình
            </button>
          </div>
          {compStatus && (
            <p
              className={`mt-2 text-sm font-medium ${compStatus.startsWith("✅") ? "text-green-600" : "text-red-600"}`}
            >
              {compStatus}
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-bold text-lg mb-4">
            ➕ Tạo mã khuyến mãi (Admin → Platform tài trợ)
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <select
              value={form.merchantId}
              onChange={(e) => set("merchantId", e.target.value)}
              className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
            >
              <option value="">Chọn nhà hàng...</option>
              {merchants.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <input
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
              placeholder="Mã (VD: PLATFORM20)"
              className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
            />
            <select
              value={form.target}
              onChange={(e) => set("target", e.target.value)}
              className="border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
            >
              <option value="FOOD">Giảm món ăn</option>
              <option value="SHIPPING">Giảm phí ship</option>
            </select>
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
                        ({p.target === "SHIPPING" ? "Giảm ship" : "Giảm món"} ·{" "}
                        {merchantName(p.merchantId)})
                      </span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {p.type === "PERCENT"
                        ? `${p.value}%`
                        : `${toNum(p.value).toLocaleString("vi-VN")}đ`}
                      {p.minOrderValue != null &&
                        ` · Đơn tối thiểu ${toNum(p.minOrderValue).toLocaleString("vi-VN")}đ`}
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

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        <Link
          href="/"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">📊</span>
          <span>Dashboard</span>
        </Link>
        <Link
          href="/merchants"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">🏪</span>
          <span>Merchants</span>
        </Link>
        <Link
          href="/promotions"
          className="flex flex-col items-center text-[10px] text-[#ff6b35] no-underline"
        >
          <span className="text-[22px]">🏷️</span>
          <span>Promo</span>
        </Link>
        <Link
          href="/orders"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">📋</span>
          <span>Orders</span>
        </Link>
        <Link
          href="/users"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">👥</span>
          <span>Users</span>
        </Link>
      </nav>
    </div>
  );
}
