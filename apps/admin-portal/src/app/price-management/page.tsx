"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { merchantApi } from "@mythfood/api-client";
import { useAuthStore } from "@mythfood/frontend-shared";
import { formatDateTime } from "../../lib/format";
import AdminShell from "../../components/AdminShell";

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

function fmt(d: unknown): string {
  return formatDateTime(d);
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  RECORDED: { label: "Đã ghi nhận", cls: "bg-blue-100 text-blue-700" },
  AUDITED: { label: "Đã kiểm toán", cls: "bg-green-100 text-green-700" },
  FLAGGED: { label: "Bất thường", cls: "bg-red-100 text-red-700" },
};

export default function AdminPriceManagementPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [merchantId, setMerchantId] = useState("");
  const [tab, setTab] = useState<"history" | "alerts" | "report">("history");

  const [history, setHistory] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [report, setReport] = useState<any>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    async function load() {
      try {
        const res = await merchantApi.list({ take: 500 });
        setMerchants(res.items || []);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (!merchantId) return;
    async function load() {
      const [h, a, r] = await Promise.all([
        merchantApi
          .getPriceHistory(merchantId, { take: 200 })
          .catch(() => null),
        merchantApi.getPriceAlerts(merchantId, { take: 200 }).catch(() => null),
        merchantApi.getPriceFluctuationReport(merchantId).catch(() => null),
      ]);
      setHistory(Array.isArray((h as any)?.items) ? (h as any).items : []);
      setAlerts(Array.isArray((a as any)?.items) ? (a as any).items : []);
      setReport(r);
    }
    load();
  }, [merchantId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <AdminShell title="📉 Biến động giá">
      <div className="space-y-4">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <label className="block text-sm font-semibold text-gray-600 mb-2">
            Chọn nhà hàng
          </label>
          <select
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
            className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
          >
            <option value="">— Chọn nhà hàng —</option>
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {!merchantId && (
          <p className="text-sm text-gray-400 text-center py-8">
            Chọn một nhà hàng để xem lịch sử biến động giá và cảnh báo.
          </p>
        )}

        {merchantId && (
          <>
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
              <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b">
                      <th className="py-2 pr-3">Món</th>
                      <th className="py-2 pr-3">Thời gian</th>
                      <th className="py-2 pr-3">Giá cũ</th>
                      <th className="py-2 pr-3">Giá mới</th>
                      <th className="py-2 pr-3">Lý do</th>
                      <th className="py-2">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 min-w-[180px]">
                          <div className="font-medium text-gray-800">
                            {h.menuItemName || "—"}
                          </div>
                          <div className="text-xs text-gray-400">
                            {h.menuItemId}
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-gray-600">
                          {fmt(h.createdAt)}
                        </td>
                        <td className="py-2 pr-3">
                          {toNum(h.oldPrice).toLocaleString("vi-VN")}đ
                        </td>
                        <td className="py-2 pr-3 font-semibold text-[#ff6b35]">
                          {toNum(h.newPrice).toLocaleString("vi-VN")}đ
                        </td>
                        <td className="py-2 pr-3 text-gray-500">
                          {h.reason || "—"}
                        </td>
                        <td className="py-2">
                          <span
                            className={`text-xs px-2 py-1 rounded-full font-semibold ${
                              STATUS_META[h.status]?.cls ||
                              "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {STATUS_META[h.status]?.label || h.status}
                          </span>
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
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
