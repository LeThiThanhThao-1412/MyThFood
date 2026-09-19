"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@mythfood/frontend-shared";
import { walletApi } from "@mythfood/api-client";

function formatVnd(n: unknown): string {
  return (Number(n) || 0).toLocaleString("vi-VN") + "₫";
}

const STATUS_BADGE: Record<string, string> = {
  SUCCESS: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
  NEEDS_REVIEW: "bg-orange-100 text-orange-700",
  PROCESSING: "bg-blue-100 text-blue-700",
  PENDING: "bg-gray-100 text-gray-600",
  ALREADY_SETTLED: "bg-green-100 text-green-700",
  DRY_RUN: "bg-purple-100 text-purple-700",
};

export default function AdminSettlementPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [dryRun, setDryRun] = useState(true);
  const [runLoading, setRunLoading] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);

  const [viewOwnerId, setViewOwnerId] = useState("");
  const [viewOwnerType, setViewOwnerType] = useState("MERCHANT");
  const [pending, setPending] = useState<any>(null);
  const [clawback, setClawback] = useState<any>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    loadBatches();
  }, [isAuthenticated, statusFilter]);

  async function loadBatches() {
    setLoading(true);
    setError("");
    try {
      const res = await walletApi.getSettlementBatches({
        status: statusFilter || undefined,
      });
      setBatches(res || []);
    } catch {
      setError("Không thể tải lịch sử quyết toán");
    } finally {
      setLoading(false);
    }
  }

  async function runSettlement() {
    setRunLoading(true);
    setRunResult(null);
    try {
      const r = await walletApi.runSettlementBatch({ dryRun });
      setRunResult(r);
      if (!dryRun) loadBatches();
    } catch (e: any) {
      setRunResult({ error: e?.message || "Chạy quyết toán thất bại" });
    } finally {
      setRunLoading(false);
    }
  }

  async function manualRun() {
    setRunLoading(true);
    setRunResult(null);
    try {
      const r = await walletApi.manualRunSettlement();
      setRunResult(r);
      loadBatches();
    } catch (e: any) {
      setRunResult({ error: e?.message || "Quyết toán thủ công thất bại" });
    } finally {
      setRunLoading(false);
    }
  }

  async function retryBatch(id: string) {
    try {
      const r = await walletApi.retrySettlementBatch(id);
      setRunResult(r);
      loadBatches();
    } catch (e: any) {
      setRunResult({ error: e?.message || "Retry thất bại" });
    }
  }

  async function viewPending() {
    if (!viewOwnerId) return;
    try {
      const r = await walletApi.getPendingSettlement(
        viewOwnerId,
        viewOwnerType,
      );
      setPending(r);
    } catch (e: any) {
      setPending({
        error: e?.message || "Không thể tải doanh thu chờ quyết toán",
      });
    }
  }

  async function viewClawback() {
    if (!viewOwnerId) return;
    try {
      const r = await walletApi.getOpenClawback(viewOwnerId, viewOwnerType);
      setClawback(r);
    } catch (e: any) {
      setClawback({ error: e?.message || "Không thể tải nợ clawback" });
    }
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <header className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="text-gray-400 hover:text-gray-600"
          >
            ← Quay lại
          </button>
          <h1 className="text-xl font-bold">💼 Quyết toán cuối ngày (23:00)</h1>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
        {/* ───────── Manual trigger ───────── */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="font-bold text-[#1a1a2e] mb-1">
            ▶️ Chạy quyết toán thủ công
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            Backfill batch cho cửa sổ hiện tại (idempotent theo chu kỳ). Bật
            Dry-run để xem trước mà không ghi DB.
          </p>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="w-4 h-4 accent-[#ff6b35]"
              />
              Dry-run (xem trước)
            </label>
            <button
              onClick={runSettlement}
              disabled={runLoading}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#ff6b35] text-white hover:bg-[#e85a26] disabled:opacity-50 transition"
            >
              {runLoading
                ? "Đang chạy..."
                : dryRun
                  ? "Xem trước (Dry-run)"
                  : "Chạy quyết toán"}
            </button>
            <button
              onClick={manualRun}
              disabled={runLoading}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#1a1a2e] text-white hover:bg-black disabled:opacity-50 transition"
            >
              ⚡ Quyết toán thủ công ngay
            </button>
          </div>

          {runResult && (
            <div className="mt-4 bg-gray-50 rounded-xl p-4 overflow-x-auto">
              {runResult.error ? (
                <p className="text-red-600 text-sm">⚠️ {runResult.error}</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span className="font-semibold">
                      Batch:{" "}
                      <span className="text-gray-500">
                        {runResult.batchId || "-"}
                      </span>
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[runResult.status] || "bg-gray-100 text-gray-600"}`}
                    >
                      {runResult.status}
                    </span>
                    {runResult.summary && (
                      <span className="text-gray-500">
                        Tổng credit:{" "}
                        <b>{formatVnd(runResult.summary.totalCredit)}</b> ·
                        Clawback:{" "}
                        <b>{formatVnd(runResult.summary.totalClawback)}</b> ·
                        Đối soát:{" "}
                        <b
                          className={
                            runResult.summary.reconciled
                              ? "text-green-600"
                              : "text-red-600"
                          }
                        >
                          {runResult.summary.reconciled ? "KHỚP ✓" : "LỆCH ✗"}
                        </b>
                      </span>
                    )}
                  </div>
                  {Array.isArray(runResult.groups) &&
                    runResult.groups.length > 0 && (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-400 uppercase">
                            <th className="py-2 pr-4">Chủ thể</th>
                            <th className="py-2 pr-4 text-right">Gross</th>
                            <th className="py-2 pr-4 text-right">Clawback</th>
                            <th className="py-2 text-right">Net credit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {runResult.groups.map((g: any, i: number) => (
                            <tr key={i}>
                              <td className="py-2 pr-4">
                                <p className="font-medium">{g.ownerType}</p>
                                <p className="text-xs text-gray-400">
                                  {g.ownerId?.slice(0, 12)}
                                </p>
                              </td>
                              <td className="py-2 pr-4 text-right">
                                {formatVnd(g.gross)}
                              </td>
                              <td className="py-2 pr-4 text-right text-orange-600">
                                {formatVnd(g.clawback)}
                              </td>
                              <td className="py-2 text-right font-semibold text-green-600">
                                {formatVnd(g.netCredit)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ───────── Pending + Clawback viewer ───────── */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="font-bold text-[#1a1a2e] mb-4">
            🔍 Tra cứu theo chủ thể
          </h2>
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <input
              value={viewOwnerId}
              onChange={(e) => setViewOwnerId(e.target.value)}
              placeholder="ownerId (UUID / id ví)"
              className="flex-1 min-w-[240px] px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff6b35]/30"
            />
            <select
              value={viewOwnerType}
              onChange={(e) => setViewOwnerType(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white"
            >
              <option value="MERCHANT">MERCHANT</option>
              <option value="DRIVER">DRIVER</option>
              <option value="PLATFORM">PLATFORM</option>
              <option value="CONSUMER">CONSUMER</option>
            </select>
            <button
              onClick={viewPending}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              Doanh thu chờ
            </button>
            <button
              onClick={viewClawback}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              Nợ clawback
            </button>
          </div>

          {(pending || clawback) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {pending && (
                <div className="border border-gray-100 rounded-xl p-4">
                  <p className="text-sm font-semibold mb-2">
                    ⏳ Doanh thu chờ quyết toán
                    {pending.totalPending != null && (
                      <span className="ml-2 text-[#ff6b35]">
                        {formatVnd(pending.totalPending)}
                      </span>
                    )}
                  </p>
                  {pending.error ? (
                    <p className="text-sm text-red-600">{pending.error}</p>
                  ) : (
                    <div className="max-h-64 overflow-auto text-sm">
                      {(pending.entries || []).map((e: any) => (
                        <div
                          key={e.id}
                          className="flex justify-between py-1.5 border-b border-gray-50"
                        >
                          <span className="text-gray-500">{e.kind}</span>
                          <span className="font-semibold text-green-600">
                            {formatVnd(e.amount)}
                          </span>
                        </div>
                      ))}
                      {!pending.entries?.length && (
                        <p className="text-gray-400 text-sm">Không có</p>
                      )}
                    </div>
                  )}
                </div>
              )}
              {clawback && (
                <div className="border border-gray-100 rounded-xl p-4">
                  <p className="text-sm font-semibold mb-2">
                    ↩️ Nợ clawback (refund sau settle)
                    {clawback.totalOpenClawback != null && (
                      <span className="ml-2 text-red-500">
                        {formatVnd(clawback.totalOpenClawback)}
                      </span>
                    )}
                  </p>
                  {clawback.error ? (
                    <p className="text-sm text-red-600">{clawback.error}</p>
                  ) : (
                    <div className="max-h-64 overflow-auto text-sm">
                      {(clawback.items || []).map((c: any) => (
                        <div
                          key={c.id}
                          className="flex justify-between py-1.5 border-b border-gray-50"
                        >
                          <span className="text-gray-500">
                            #{c.sourceOrderId?.slice(0, 8)}
                          </span>
                          <span className="font-semibold text-red-600">
                            {formatVnd(c.remainingAmount)}
                          </span>
                        </div>
                      ))}
                      {!clawback.items?.length && (
                        <p className="text-gray-400 text-sm">Không có</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ───────── Batches list ───────── */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h2 className="font-bold text-[#1a1a2e]">
              📦 Lịch sử lô quyết toán
            </h2>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white"
            >
              <option value="">Tất cả</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAILED">FAILED</option>
              <option value="NEEDS_REVIEW">NEEDS_REVIEW</option>
              <option value="PROCESSING">PROCESSING</option>
            </select>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 text-sm">{error}</div>
          )}

          {loading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-10 bg-gray-100 rounded animate-pulse"
                />
              ))}
            </div>
          ) : batches.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              💼 Chưa có lô quyết toán nào
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Cửa sổ (UTC)
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Trạng thái
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Driver
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Merchant
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Platform
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase hidden lg:table-cell">
                    Bởi
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {batches.map((b: any) => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      <p>
                        {b.periodStart
                          ? new Date(b.periodStart).toLocaleString("vi-VN")
                          : "-"}
                      </p>
                      <p className="text-xs text-gray-400">
                        →{" "}
                        {b.periodEnd
                          ? new Date(b.periodEnd).toLocaleString("vi-VN")
                          : "-"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[b.status] || "bg-gray-100 text-gray-600"}`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {formatVnd(b.totalDriverPayout)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {formatVnd(b.totalMerchantPayout)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {formatVnd(b.totalPlatformPayout)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">
                      {b.triggeredBy || "-"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(b.status === "FAILED" || b.status === "PROCESSING") && (
                        <button
                          onClick={() => retryBatch(b.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#ff6b35] text-white hover:bg-[#e85a26]"
                        >
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
