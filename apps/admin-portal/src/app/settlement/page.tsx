"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@mythfood/frontend-shared";
import { driverApi, merchantApi, walletApi } from "@mythfood/api-client";
import { formatDate, formatDateTime } from "../../lib/format";
import AdminShell from "../../components/AdminShell";
import SettlementOrdersTable from "../../components/SettlementOrdersTable";

function formatVnd(n: unknown): string {
  return (Number(n) || 0).toLocaleString("vi-VN") + "₫";
}

/** Nhãn từng dòng nợ clawback (khớp `category` của wallet-service). */
const DEBT_CATEGORY_LABEL: Record<string, string> = {
  CUSTOMER_REFUND: "Hoàn tiền khách",
  DRIVER_COMPENSATION: "Bồi thường tài xế",
  PLATFORM_FUND: "Bù quỹ nền tảng",
  UNCATEGORIZED: "Chưa phân loại",
};

function debtCategoryLabel(category?: string | null): string {
  return DEBT_CATEGORY_LABEL[category || "UNCATEGORIZED"] ?? "Chưa phân loại";
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

/**
 * Cửa sổ quyết toán của HÔM NAY — y hệt cron 23:00:
 * `[23:00 hôm qua → 23:00 hôm nay]` giờ VN (= 16:00 UTC). `settleDaily` không
 * truyền period cũng tự tính đúng cửa sổ này, nên "xem trước hôm nay" trùng
 * khít lô mà 23:00 sẽ chạy (không lẫn doanh thu của ngày khác).
 */
function todaySettlementWindow(): { periodStart: string; periodEnd: string } {
  const now = new Date();
  const end = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      16,
      0,
      0,
      0,
    ),
  );
  return {
    periodStart: new Date(end.getTime() - 24 * 3600 * 1000).toISOString(),
    periodEnd: end.toISOString(),
  };
}

/** Ngày quyết toán (dd/mm/yyyy, giờ VN) — lấy từ mốc `periodEnd` của lô. */
function settlementDayLabel(batch: any): string {
  return formatDate(batch?.periodEnd || batch?.periodStart || batch?.createdAt);
}

export default function AdminSettlementPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [runLoading, setRunLoading] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);

  /** Cửa sổ quyết toán của HÔM NAY — xem trước/chạy tay chỉ áp dụng cho ngày này. */
  const today = todaySettlementWindow();
  /** Lô của hôm nay (nếu 23:00 đã chạy) — nhắc admin khỏi chạy lại. */
  const todayBatch = batches.find(
    (b: any) =>
      b?.periodEnd &&
      new Date(b.periodEnd).getTime() === new Date(today.periodEnd).getTime(),
  );

  const [viewOwnerId, setViewOwnerId] = useState("");
  const [viewOwnerType, setViewOwnerType] = useState("MERCHANT");
  const [pending, setPending] = useState<any>(null);
  const [clawback, setClawback] = useState<any>(null);

  /** id → tên để bảng theo đơn hiển thị "Nhà hàng / Tài xế" thay vì UUID. */
  const [merchantNames, setMerchantNames] = useState<Record<string, string>>(
    {},
  );
  const [driverNames, setDriverNames] = useState<Record<string, string>>({});

  /** Chi tiết lô lịch sử — hiển thị trong POPUP khi bấm 1 dòng. */
  const [batchDetail, setBatchDetail] = useState<any>(null);
  const [batchDetailId, setBatchDetailId] = useState("");
  const [batchDetailLoading, setBatchDetailLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    loadBatches();
  }, [isAuthenticated, statusFilter]);

  // Tên nhà hàng/tài xế chỉ để hiển thị — lỗi API không được chặn màn quyết toán.
  useEffect(() => {
    if (!isAuthenticated) return;
    let alive = true;
    (async () => {
      try {
        const res: any = await merchantApi.list({ take: 500 } as any);
        if (!alive) return;
        const map: Record<string, string> = {};
        for (const m of res?.items || []) {
          if (m?.id) map[m.id] = m.name || m.businessName || m.id;
        }
        setMerchantNames(map);
      } catch {
        /* hiển thị fallback NH • <id> */
      }
      try {
        const res: any = await driverApi.list({});
        if (!alive) return;
        const map: Record<string, string> = {};
        for (const d of (res as any)?.data || []) {
          if (d?.id) map[d.id] = d.fullName || d.name || d.id;
        }
        setDriverNames(map);
      } catch {
        /* hiển thị fallback TX • <id> */
      }
    })();
    return () => {
      alive = false;
    };
  }, [isAuthenticated]);

  async function loadBatches() {
    setLoading(true);
    setError("");
    try {
      const res = await walletApi.getSettlementBatches({
        status: statusFilter || undefined,
      });
      setBatches(res || []);
      // Lô đang mở popup có thể không còn trong danh sách (đổi bộ lọc / retry)
      // ⇒ đóng popup để không hiện dữ liệu cũ.
      if (
        batchDetailId &&
        !(res || []).some((b: any) => b.id === batchDetailId)
      ) {
        setBatchDetailId("");
        setBatchDetail(null);
      }
    } catch {
      setError("Không thể tải lịch sử quyết toán");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Xem trước (dry-run) hoặc chạy lô **của hôm nay**.
   *
   * Luôn gửi kèm cửa sổ `[23:00 hôm qua → 23:00 hôm nay]` (giờ VN) để preview
   * chỉ tính doanh thu phát sinh trong ngày và lô tạo ra trùng đúng period của
   * cron 23:00 (idempotent theo `(periodStart, periodEnd)`).
   */
  async function runSettlement(asDryRun: boolean) {
    setRunLoading(true);
    setRunResult(null);
    try {
      const r = await walletApi.runSettlementBatch({
        dryRun: asDryRun,
        periodStart: today.periodStart,
        periodEnd: today.periodEnd,
      });
      setRunResult(r);
      if (!asDryRun) loadBatches();
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

  /**
   * Mở POPUP chi tiết quyết toán của một ngày trong lịch sử
   * (bảng theo đơn + bộ lọc nhà hàng / tài xế / mã đơn).
   */
  async function openBatchDetail(id: string) {
    setBatchDetailId(id);
    setBatchDetail(null);
    setBatchDetailLoading(true);
    try {
      const r = await walletApi.getSettlementBatchDetail(id);
      setBatchDetail(r);
    } catch (e: any) {
      setBatchDetail({
        error: e?.message || "Không thể tải chi tiết lô quyết toán",
      });
    } finally {
      setBatchDetailLoading(false);
    }
  }

  function closeBatchDetail() {
    setBatchDetailId("");
    setBatchDetail(null);
  }

  // ESC đóng popup chi tiết + khoá cuộn trang phía sau khi popup mở.
  useEffect(() => {
    if (!batchDetailId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeBatchDetail();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchDetailId]);

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
    <AdminShell title="💼 Quản lý Quyết toán">
      <div className="space-y-4">
        {/* ───────── Manual trigger ───────── */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="font-bold text-[#1a1a2e] mb-1">
            ▶️ Quyết toán ngày {formatDate(today.periodEnd)}
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            Chỉ xem trước / chạy lô của <b>hôm nay</b> — cửa sổ 23:00 hôm qua →
            23:00 hôm nay (giờ VN), đúng bằng lô cron 23:00 sẽ chạy. Xem trước
            chỉ đọc, không ghi DB.
          </p>
          {todayBatch && (
            <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 mb-3">
              ✅ Lô hôm nay đã chạy ({todayBatch.status}). Bấm vào dòng trong
              lịch sử bên dưới để xem chi tiết từng đơn.
            </p>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => runSettlement(true)}
              disabled={runLoading}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#ff6b35] text-white hover:bg-[#e85a26] disabled:opacity-50 transition"
            >
              {runLoading ? "Đang tính..." : "👁 Xem trước quyết toán hôm nay"}
            </button>
            <button
              onClick={() => runSettlement(false)}
              disabled={runLoading}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#1a1a2e] text-white hover:bg-black disabled:opacity-50 transition"
            >
              {runLoading ? "Đang chạy..." : "⚡ Chạy quyết toán hôm nay"}
            </button>
            <button
              onClick={manualRun}
              disabled={runLoading}
              title="Quét toàn bộ dòng PENDING (kể cả tồn đọng nếu cron 23:00 bị lỗi)"
              className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition"
            >
              🔄 Quét tồn đọng
            </button>
          </div>
          <p className="mt-3 text-[11px] text-gray-400">
            Lưu ý: 23:00 hệ thống tự chạy lô của ngày. “Chạy quyết toán hôm nay”
            chỉ gồm doanh thu trong cửa sổ ngày; nếu cron từng lỗi, bấm “Quét
            tồn đọng” để gom toàn bộ dòng còn PENDING.
          </p>

          {runResult && (
            <div className="mt-4 bg-gray-50 rounded-xl p-4">
              {runResult.error ? (
                <p className="text-red-600 text-sm">⚠️ {runResult.error}</p>
              ) : (
                <div className="space-y-3">
                  <p className="font-semibold text-[#1a1a2e]">
                    {runResult.status === "DRY_RUN"
                      ? "👁 Xem trước"
                      : "✅ Kết quả quyết toán"}{" "}
                    — ngày {settlementDayLabel(runResult)}
                  </p>
                  <div className="flex flex-wrap gap-2 text-sm items-center">
                    <span className="font-semibold">
                      Batch:{" "}
                      <span className="text-gray-500">
                        {runResult.batchId || "Xem trước (chưa ghi DB)"}
                      </span>
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[runResult.status] || "bg-gray-100 text-gray-600"}`}
                    >
                      {runResult.status}
                    </span>
                    {runResult.status === "ALREADY_SETTLED" &&
                      runResult.batchId && (
                        <button
                          onClick={() => openBatchDetail(runResult.batchId)}
                          className="text-xs font-semibold text-[#ff6b35] hover:underline"
                        >
                          Xem chi tiết từng đơn →
                        </button>
                      )}
                    {runResult.periodStart && (
                      <span className="text-xs text-gray-500">
                        {formatDateTime(runResult.periodStart)} →{" "}
                        {runResult.periodEnd
                          ? formatDateTime(runResult.periodEnd)
                          : "—"}
                      </span>
                    )}
                    {runResult.summary && (
                      <span className="text-xs text-gray-500">
                        Tổng credit:{" "}
                        <b>{formatVnd(runResult.summary.totalCredit)}</b>
                        {" · "}Đối soát:{" "}
                        <b
                          className={
                            runResult.summary.reconciled
                              ? "text-green-600"
                              : "text-red-600"
                          }
                        >
                          {runResult.summary.reconciled
                            ? "KHỚP ✓"
                            : "LỆCH ✗"}
                        </b>
                      </span>
                    )}
                  </div>

                  {/* Quyết toán XEM THEO ĐƠN — dùng chung bảng với lô thật */}
                  {Array.isArray(runResult.orders) ? (
                    <SettlementOrdersTable
                      orders={runResult.orders}
                      summary={runResult.summary}
                      merchants={merchantNames}
                      drivers={driverNames}
                      mode={
                        runResult.status === "DRY_RUN" ? "preview" : "settled"
                      }
                    />
                  ) : null}

                  <details className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2 overflow-x-auto">
                    <summary className="cursor-pointer text-xs font-semibold text-gray-500">
                      🧾 Tổng theo chủ ví (đối soát sổ) —{" "}
                      {Array.isArray(runResult.groups)
                        ? runResult.groups.length
                        : 0}{" "}
                      chủ ví
                    </summary>
                  {Array.isArray(runResult.groups) &&
                    runResult.groups.length > 0 && (
                      <table className="w-full min-w-[640px] text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-400 uppercase">
                            <th className="py-2 pr-4">Chủ thể</th>
                            <th className="py-2 pr-4 text-right">Doanh thu</th>
                            <th className="py-2 pr-4 text-right">
                              {runResult.status === "DRY_RUN"
                                ? "Nợ đã thu (dự kiến)"
                                : "Nợ đã thu"}
                            </th>
                            <th className="py-2 pr-4 text-right">
                              {runResult.status === "DRY_RUN"
                                ? "Nợ còn lại (dự kiến)"
                                : "Nợ còn lại"}
                            </th>
                            <th className="py-2 text-right">Credit</th>
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
                                {formatVnd(g.recovered ?? 0)}
                              </td>
                              <td className="py-2 pr-4 text-right text-red-500">
                                {formatVnd(g.openDebtAfter ?? g.openDebt ?? 0)}
                              </td>
                              <td className="py-2 text-right font-semibold text-green-600">
                                {formatVnd(g.netCredit)}
                                {g.netAfterRecovery != null &&
                                  g.netAfterRecovery !== g.netCredit && (
                                    <p className="text-[11px] font-normal text-gray-400">
                                      Sau thu nợ:{" "}
                                      {formatVnd(g.netAfterRecovery)}
                                    </p>
                                  )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </details>
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
                          <span className="text-gray-500 min-w-0">
                            <span className="inline-flex items-center gap-2">
                              <span>#{c.sourceOrderId?.slice(0, 8)}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                                {debtCategoryLabel(c.category)}
                              </span>
                            </span>
                            {c.description && (
                              <span className="block text-xs text-gray-400 truncate">
                                {c.description}
                              </span>
                            )}
                          </span>
                          <span className="font-semibold text-red-600 whitespace-nowrap ml-2">
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
                    Ngày quyết toán
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
                  <tr
                    key={b.id}
                    onClick={() => openBatchDetail(b.id)}
                    title="Bấm để xem chi tiết quyết toán ngày này"
                    className={`cursor-pointer transition ${
                      batchDetailId === b.id ? "bg-orange-50/60" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="px-4 py-3 text-sm">
                      <p className="font-semibold text-[#1a1a2e]">
                        Quyết toán ngày {settlementDayLabel(b)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {b.periodStart ? formatDateTime(b.periodStart) : "-"} →{" "}
                        {b.periodEnd ? formatDateTime(b.periodEnd) : "-"}
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
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-xs font-semibold text-[#ff6b35] whitespace-nowrap">
                          Chi tiết →
                        </span>
                        {(b.status === "FAILED" ||
                          b.status === "PROCESSING") && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              retryBatch(b.id);
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#ff6b35] text-white hover:bg-[#e85a26]"
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

        </div>
      </div>

      {/* ───────── POPUP: chi tiết quyết toán của một ngày trong lịch sử ───────── */}
      {batchDetailId && (
        <div
          className="fixed inset-0 z-50 bg-black/40 overflow-y-auto flex items-start justify-center p-3 sm:p-6"
          onClick={closeBatchDetail}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white w-full max-w-6xl rounded-2xl shadow-2xl my-4 sm:my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b">
              <div className="min-w-0">
                <h3 className="font-bold text-[#1a1a2e]">
                  🧾 Chi tiết quyết toán ngày{" "}
                  {settlementDayLabel(
                    batchDetail ||
                      batches.find((x: any) => x.id === batchDetailId),
                  )}
                </h3>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500">
                  {batchDetail?.status && (
                    <span
                      className={`px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE[batchDetail.status] || "bg-gray-100 text-gray-600"}`}
                    >
                      {batchDetail.status}
                    </span>
                  )}
                  <span>
                    {batchDetail?.periodStart
                      ? formatDateTime(batchDetail.periodStart)
                      : "—"}{" "}
                    →{" "}
                    {batchDetail?.periodEnd
                      ? formatDateTime(batchDetail.periodEnd)
                      : "—"}
                  </span>
                  <span className="text-gray-400">Batch: {batchDetailId}</span>
                  {batchDetail?.triggeredBy && (
                    <span>Bởi: {batchDetail.triggeredBy}</span>
                  )}
                </div>
                {batchDetail?.failureReason && (
                  <p className="mt-1 text-xs text-red-600">
                    ⚠️ {batchDetail.failureReason}
                  </p>
                )}
              </div>
              <button
                onClick={closeBatchDetail}
                aria-label="Đóng"
                className="shrink-0 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="px-5 sm:px-6 py-4">
              {batchDetailLoading ? (
                <div className="space-y-3">
                  <div className="h-24 bg-gray-100 rounded-xl animate-pulse" />
                  <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
                </div>
              ) : batchDetail?.error ? (
                <p className="text-sm text-red-600">⚠️ {batchDetail.error}</p>
              ) : batchDetail ? (
                <>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500 mb-4">
                    <span>
                      Tài xế:{" "}
                      <b className="text-[#1a1a2e]">
                        {formatVnd(batchDetail.totalDriverPayout)}
                      </b>
                    </span>
                    <span>
                      Nhà hàng:{" "}
                      <b className="text-[#1a1a2e]">
                        {formatVnd(batchDetail.totalMerchantPayout)}
                      </b>
                    </span>
                    <span>
                      Nền tảng:{" "}
                      <b className="text-[#1a1a2e]">
                        {formatVnd(batchDetail.totalPlatformPayout)}
                      </b>
                    </span>
                    <span>
                      Nợ đã thu:{" "}
                      <b className="text-amber-700">
                        {formatVnd(batchDetail.summary?.totalRecovered)}
                      </b>
                    </span>
                    <span className="text-gray-400">
                      Lô lịch sử không còn số nợ tại thời điểm chạy nên “Nợ còn
                      lại” để “—”.
                    </span>
                  </div>
                  <SettlementOrdersTable
                    orders={batchDetail.orders}
                    summary={batchDetail.summary}
                    merchants={merchantNames}
                    drivers={driverNames}
                    mode="settled"
                  />
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
