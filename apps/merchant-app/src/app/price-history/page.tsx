"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  merchantApi,
  PORTS,
  type PriceHistoryStatus,
} from "@mythfood/api-client";
import { useAuthStore } from "@mythfood/frontend-shared";
import TopNav from "@/components/TopNav";

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

function fmt(d: unknown): string {
  if (!d) return "—";
  const date = new Date(d as string);
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleString("vi-VN");
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  RECORDED: { label: "Đã ghi nhận", cls: "bg-blue-100 text-blue-700" },
  AUDITED: { label: "Đã kiểm toán", cls: "bg-green-100 text-green-700" },
  FLAGGED: { label: "Bất thường", cls: "bg-red-100 text-red-700" },
};

export default function MerchantPriceHistoryPage() {
  const router = useRouter();
  const { isAuthenticated, user, token } = useAuthStore();
  const [merchant, setMerchant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"history" | "alerts" | "report">("history");

  const [history, setHistory] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [report, setReport] = useState<any>(null);
  const [reconcile, setReconcile] = useState<any>(null);
  const [period, setPeriod] = useState("today");

  const [menuItemId, setMenuItemId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    async function load() {
      try {
        const res = await merchantApi.list({ take: 200 });
        const m = (res.items || []).find((m2: any) => m2.userId === user?.id);
        setMerchant(m);
        if (m?.id) {
          await Promise.all([
            loadHistory(m.id),
            loadAlerts(m.id),
            loadReport(m.id),
          ]);
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user, router]);

  async function loadHistory(merchantId: string) {
    try {
      const res: any = await merchantApi.getPriceHistory(merchantId, {
        menuItemId: menuItemId || undefined,
        from: from || undefined,
        to: to || undefined,
        take: 200,
      });
      setHistory(Array.isArray(res?.items) ? res.items : []);
      setTotal(res?.total ?? 0);
    } catch {
      /* ignore */
    }
  }

  async function loadAlerts(merchantId: string) {
    try {
      const res: any = await merchantApi.getPriceAlerts(merchantId, {
        take: 200,
      });
      setAlerts(Array.isArray(res?.items) ? res.items : []);
    } catch {
      /* ignore */
    }
  }

  async function loadReport(merchantId: string) {
    try {
      const r: any = await merchantApi.getPriceFluctuationReport(merchantId);
      setReport(r);
    } catch {
      /* ignore */
    }
  }

  async function loadReconcile() {
    if (!merchant?.id) return;
    try {
      const r: any = await merchantApi.reconcileRevenue(merchant.id, {
        period,
      });
      setReconcile(r);
    } catch {
      /* ignore */
    }
  }

  async function applyFilter() {
    if (!merchant?.id) return;
    await loadHistory(merchant.id);
  }

  async function setStatus(historyId: string, status: PriceHistoryStatus) {
    try {
      await merchantApi.updatePriceHistoryStatus(historyId, status);
      if (merchant?.id) await loadHistory(merchant.id);
    } catch {
      /* ignore */
    }
  }

  async function exportCsv() {
    if (!merchant?.id) return;
    const params = new URLSearchParams();
    if (menuItemId) params.set("menuItemId", menuItemId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const base = process.env.NEXT_PUBLIC_API_GATEWAY || "http://localhost:3001";
    const isLocal = base.startsWith("http://localhost");
    const url = `${
      isLocal ? `http://localhost:${PORTS.MERCHANT}` : base
    }/api/v1/merchants/${merchant.id}/price-history/export?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "price-history.csv";
    a.click();
    URL.revokeObjectURL(a.href);
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
          📉 Lịch sử biến động giá
        </h1>
        {/* Tabs */}
        <div className="flex gap-2 bg-white rounded-2xl p-1.5 shadow-sm w-fit">
          {(
            [
              { key: "history", icon: "📜", label: "Lịch sử" },
              { key: "alerts", icon: "🚨", label: "Cảnh báo" },
              { key: "report", icon: "📊", label: "Báo cáo" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                tab === t.key
                  ? "bg-[#ff6b35] text-white"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {tab === "history" && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Món (ID)
                </label>
                <input
                  value={menuItemId}
                  onChange={(e) => setMenuItemId(e.target.value)}
                  placeholder="UUID món"
                  className="border rounded-xl px-3 py-2 text-sm outline-none focus:border-[#ff6b35]"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Từ</label>
                <input
                  type="datetime-local"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="border rounded-xl px-3 py-2 text-sm outline-none focus:border-[#ff6b35]"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Đến</label>
                <input
                  type="datetime-local"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="border rounded-xl px-3 py-2 text-sm outline-none focus:border-[#ff6b35]"
                />
              </div>
              <button
                onClick={applyFilter}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#1a1a2e] text-white hover:bg-black"
              >
                Lọc
              </button>
              <button
                onClick={exportCsv}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700"
              >
                ⬇️ Xuất CSV
              </button>
            </div>

            <p className="text-xs text-gray-400 mb-2">
              {total} thay đổi giá được ghi nhận
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b">
                    <th className="py-2 pr-3">Thời gian</th>
                    <th className="py-2 pr-3">Giá cũ</th>
                    <th className="py-2 pr-3">Giá mới</th>
                    <th className="py-2 pr-3">Lý do</th>
                    <th className="py-2 pr-3">Trạng thái</th>
                    <th className="py-2">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 text-gray-600">
                        {fmt(h.createdAt)}
                      </td>
                      <td className="py-2 pr-3">
                        {toNum(h.oldPrice).toLocaleString("vi-VN")}đ
                      </td>
                      <td className="py-2 pr-3 font-semibold text-[#ff6b35]">
                        {toNum(h.newPrice).toLocaleString("vi-VN")}đ
                      </td>
                      <td className="py-2 pr-3 text-gray-500 max-w-[200px] truncate">
                        {h.reason || "—"}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-semibold ${
                            STATUS_META[h.status]?.cls ||
                            "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {STATUS_META[h.status]?.label || h.status}
                        </span>
                      </td>
                      <td className="py-2">
                        {h.status !== "AUDITED" && (
                          <button
                            onClick={() => setStatus(h.id, "AUDITED")}
                            className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded-lg font-semibold hover:bg-green-100 mr-1"
                          >
                            ✓ Kiểm toán
                          </button>
                        )}
                        {h.status !== "FLAGGED" && (
                          <button
                            onClick={() => setStatus(h.id, "FLAGGED")}
                            className="text-xs bg-red-50 text-red-600 px-2 py-1 rounded-lg font-semibold hover:bg-red-100"
                          >
                            ⚑ Cờ
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-6 text-center text-gray-400"
                      >
                        Chưa có thay đổi giá nào
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {tab === "alerts" && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
            <h2 className="font-bold text-lg">
              🚨 Cảnh báo bất thường (&gt; 50%)
            </h2>
            {alerts.map((a) => (
              <div
                key={a.id}
                className="flex items-start justify-between gap-3 bg-red-50 rounded-xl p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-red-700">
                    {a.message}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {fmt(a.createdAt)}
                  </p>
                </div>
                <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-semibold shrink-0">
                  {toNum(a.changePercent).toFixed(2)}%
                </span>
              </div>
            ))}
            {alerts.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">
                Không có cảnh báo nào
              </p>
            )}
          </div>
        )}
        {tab === "report" && (
          <div className="space-y-5">
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <p className="text-sm text-gray-400">Tổng số lần đổi giá</p>
                <p className="text-2xl font-extrabold text-[#1a1a2e]">
                  {report?.totalChanges ?? 0}
                </p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <p className="text-sm text-gray-400">Số lần bất thường</p>
                <p className="text-2xl font-extrabold text-red-600">
                  {report?.flaggedCount ?? 0}
                </p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <p className="text-sm text-gray-400">Biến động lớn nhất</p>
                <p className="text-2xl font-extrabold text-[#ff6b35]">
                  {toNum(report?.maxChangePercent).toFixed(2)}%
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="font-bold text-lg">💼 Đối soát doanh thu</h2>
                <div className="flex items-center gap-2">
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="border rounded-xl px-3 py-2 text-sm outline-none"
                  >
                    <option value="today">Hôm nay</option>
                    <option value="week">7 ngày</option>
                    <option value="month">30 ngày</option>
                  </select>
                  <button
                    onClick={loadReconcile}
                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#1a1a2e] text-white hover:bg-black"
                  >
                    Chạy đối soát
                  </button>
                </div>
              </div>
              {reconcile ? (
                <pre className="text-xs bg-gray-50 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(reconcile, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-gray-400">
                  Chọn kỳ và nhấn &quot;Chạy đối soát&quot; để so sánh doanh thu
                  thực tế với giá niêm yết.
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
