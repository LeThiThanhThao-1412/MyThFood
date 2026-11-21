"use client";

import { useMemo, useState } from "react";
import { formatVnd } from "../lib/format";

/**
 * Một dòng trong bảng quyết toán **theo đơn** do wallet-service trả về
 * (`orders` của preview dry-run, lô thật, hoặc chi tiết lô lịch sử).
 */
export type SettlementOrderRow = {
  orderId: string;
  merchantId?: string | null;
  driverId?: string | null;
  /** Tiền món nhà hàng được nhận (`MERCHANT_FOOD_REVENUE`). */
  merchantAmount?: number;
  /** Thu nhập ship của tài xế (`DRIVER_SHIPPING_FEE`). */
  driverAmount?: number;
  /** Hoa hồng nền tảng (`PLATFORM_COMMISSION`). */
  platformAmount?: number;
  /** Trích quỹ dự phòng (`RESERVE_FUND_CONTRIBUTION`). */
  reserveAmount?: number;
  /** Loại dòng khác (giữ lại để tổng không hụt). */
  otherAmount?: number;
  gross?: number;
  merchantRecovered?: number;
  driverRecovered?: number;
  /** Nợ clawback đã thu từ chính đơn này. */
  recovered?: number;
  /** Nợ còn lại của chủ ví sau đơn này; null = lô cũ không còn số liệu. */
  openDebtAfter?: number | null;
  hasOpenDebtAfter?: boolean;
};

export type SettlementSummary = {
  totalGross?: number;
  totalCredit?: number;
  totalRecovered?: number;
  /** Số dư ròng tăng thêm sau thu hồi nợ (chỉ có ở preview). */
  netAfterRecovery?: number;
  /** Nợ còn lại của các chủ ví sau lô (null = không có số liệu). */
  openDebtAfterTotal?: number | null;
  orderCount?: number;
  ownerCount?: number;
} | null;

type Props = {
  orders?: SettlementOrderRow[] | null;
  summary?: SettlementSummary;
  /** id → tên nhà hàng (lấy từ merchant-service). */
  merchants?: Record<string, string>;
  /** id → tên tài xế (lấy từ driver-service). */
  drivers?: Record<string, string>;
  /** preview = số dự kiến (dry-run); settled = số thật của lô đã chạy. */
  mode?: "preview" | "settled";
};

function shortId(id?: string | null): string {
  return id ? `#${id.slice(0, 8)}` : "—";
}

function sum(
  rows: SettlementOrderRow[],
  pick: (r: SettlementOrderRow) => number | undefined,
): number {
  return rows.reduce((s, r) => s + (Number(pick(r)) || 0), 0);
}

/**
 * Bảng quyết toán theo đơn + bộ lọc nhà hàng / tài xế / mã đơn.
 *
 * Dùng chung cho cả 3 chỗ để admin không phải học lại giao diện:
 *  - xem trước (dry-run) trước khi chạy,
 *  - kết quả lô vừa chạy,
 *  - chi tiết lô trong lịch sử.
 */
export default function SettlementOrdersTable({
  orders,
  summary,
  merchants = {},
  drivers = {},
  mode = "preview",
}: Props) {
  const rows = useMemo(() => (Array.isArray(orders) ? orders : []), [orders]);

  const [q, setQ] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [onlyDebt, setOnlyDebt] = useState(false);

  const merchantLabel = (id?: string | null) =>
    id ? merchants[id] || `NH • ${id.slice(0, 8)}` : "—";
  const driverLabel = (id?: string | null) =>
    id ? drivers[id] || `TX • ${id.slice(0, 8)}` : "—";

  // Danh sách lọc suy ra từ chính dữ liệu của lô (không gọi thêm API).
  const merchantOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rows) if (r.merchantId) ids.add(r.merchantId);
    return [...ids].sort((a, b) =>
      merchantLabel(a).localeCompare(merchantLabel(b), "vi"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, merchants]);

  const driverOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rows) if (r.driverId) ids.add(r.driverId);
    return [...ids].sort((a, b) =>
      driverLabel(a).localeCompare(driverLabel(b), "vi"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, drivers]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (merchantId && r.merchantId !== merchantId) return false;
      if (driverId && r.driverId !== driverId) return false;
      if (onlyDebt) {
        const hasRecovered = (Number(r.recovered) || 0) > 0;
        const stillDebt = (Number(r.openDebtAfter) || 0) > 0;
        if (!hasRecovered && !stillDebt) return false;
      }
      if (!needle) return true;
      const haystack = [
        r.orderId,
        merchantLabel(r.merchantId),
        driverLabel(r.driverId),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, merchantId, driverId, onlyDebt, merchants, drivers]);

  const isFiltered = Boolean(q.trim() || merchantId || driverId || onlyDebt);
  const filteredTotal = useMemo(
    () => ({
      merchant: sum(filtered, (r) => r.merchantAmount),
      driver: sum(filtered, (r) => r.driverAmount),
      recovered: sum(filtered, (r) => r.recovered),
      platform: sum(filtered, (r) => r.platformAmount),
      reserve: sum(filtered, (r) => r.reserveAmount),
      gross: sum(filtered, (r) => r.gross),
    }),
    [filtered],
  );

  const debtSuffix = mode === "preview" ? " (dự kiến)" : "";
  const totalOrders = rows.length;

  function resetFilters() {
    setQ("");
    setMerchantId("");
    setDriverId("");
    setOnlyDebt(false);
  }

  return (
    <div className="space-y-3">
      {/* ───────── KPI của cả lô ───────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3">
          <p className="text-xs text-gray-400">Số đơn trong lô</p>
          <p className="text-lg font-bold text-[#1a1a2e]">
            {summary?.orderCount ?? totalOrders}
          </p>
          <p className="text-[11px] text-gray-400">
            {summary?.ownerCount != null
              ? `${summary.ownerCount} chủ ví (NH/TX/nền tảng)`
              : "Theo từng đơn"}
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3">
          <p className="text-xs text-gray-400">Tổng doanh thu quyết toán</p>
          <p className="text-lg font-bold text-[#1a1a2e]">
            {formatVnd(summary?.totalGross ?? filteredTotal.gross)}
          </p>
          <p className="text-[11px] text-gray-400">
            NH + TX + nền tảng + quỹ dự phòng
          </p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3">
          <p className="text-xs text-amber-700">Nợ đã thu{debtSuffix}</p>
          <p className="text-lg font-bold text-amber-700">
            {formatVnd(summary?.totalRecovered ?? filteredTotal.recovered)}
          </p>
          <p className="text-[11px] text-amber-600/80">
            Trừ ngay vào ví khi quyết toán
          </p>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50/70 px-4 py-3">
          <p className="text-xs text-red-700">Nợ còn lại{debtSuffix}</p>
          <p className="text-lg font-bold text-red-700">
            {summary?.openDebtAfterTotal == null
              ? "—"
              : formatVnd(summary.openDebtAfterTotal)}
          </p>
          <p className="text-[11px] text-red-600/80">
            Tính theo chủ ví, không theo đơn
          </p>
        </div>
      </div>

      {/* ───────── Bộ lọc ───────── */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔎 Tìm mã đơn / nhà hàng / tài xế"
          className="flex-1 min-w-[220px] px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff6b35]/30"
        />
        <select
          value={merchantId}
          onChange={(e) => setMerchantId(e.target.value)}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white max-w-[240px]"
        >
          <option value="">🏪 Tất cả nhà hàng</option>
          {merchantOptions.map((id) => (
            <option key={id} value={id}>
              {merchantLabel(id)}
            </option>
          ))}
        </select>
        <select
          value={driverId}
          onChange={(e) => setDriverId(e.target.value)}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white max-w-[220px]"
        >
          <option value="">🛵 Tất cả tài xế</option>
          {driverOptions.map((id) => (
            <option key={id} value={id}>
              {driverLabel(id)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer px-2">
          <input
            type="checkbox"
            checked={onlyDebt}
            onChange={(e) => setOnlyDebt(e.target.checked)}
            className="w-4 h-4 accent-[#ff6b35]"
          />
          Chỉ đơn có nợ
        </label>
        {isFiltered && (
          <button
            onClick={resetFilters}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
          >
            ✕ Bỏ lọc
          </button>
        )}
        <span className="text-xs text-gray-400 ml-auto">
          Hiện {filtered.length}/{totalOrders} đơn
        </span>
      </div>

      {/* ───────── Bảng theo đơn ───────── */}
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase">
                  Mã đơn
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase">
                  Nhà hàng
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase">
                  Tài xế
                </th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-amber-600 uppercase whitespace-nowrap">
                  Nợ đã thu{debtSuffix}
                </th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-red-500 uppercase whitespace-nowrap">
                  Nợ còn lại{debtSuffix}
                </th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase whitespace-nowrap">
                  Nền tảng
                </th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-400 uppercase whitespace-nowrap">
                  Quỹ dự phòng
                </th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-[#1a1a2e] uppercase whitespace-nowrap">
                  Tổng credit
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((r) => {
                const merchantRecovered = Number(r.merchantRecovered) || 0;
                const driverRecovered = Number(r.driverRecovered) || 0;
                const debtAfter =
                  r.openDebtAfter == null ? null : Number(r.openDebtAfter);
                return (
                  <tr key={r.orderId} className="hover:bg-gray-50/70">
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-600 whitespace-nowrap">
                      <span title={r.orderId}>{shortId(r.orderId)}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-[#1a1a2e] leading-tight">
                        {merchantLabel(r.merchantId)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatVnd(r.merchantAmount)}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-[#1a1a2e] leading-tight">
                        {driverLabel(r.driverId)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatVnd(r.driverAmount)}
                      </p>
                    </td>
                    <td
                      className="px-3 py-2.5 text-right whitespace-nowrap"
                      title={`Nhà hàng: ${formatVnd(merchantRecovered)} · Tài xế: ${formatVnd(driverRecovered)}`}
                    >
                      {merchantRecovered + driverRecovered > 0 ? (
                        <span className="font-semibold text-amber-600">
                          {formatVnd(merchantRecovered + driverRecovered)}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {debtAfter == null ? (
                        <span
                          className="text-gray-300"
                          title="Lô lịch sử không còn số nợ tại thời điểm chạy"
                        >
                          —
                        </span>
                      ) : debtAfter > 0 ? (
                        <span className="font-semibold text-red-600">
                          {formatVnd(debtAfter)}
                        </span>
                      ) : (
                        <span className="text-green-600 text-xs">Đủ</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600 whitespace-nowrap">
                      {formatVnd(r.platformAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600 whitespace-nowrap">
                      {formatVnd(r.reserveAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-[#1a1a2e] whitespace-nowrap">
                      {formatVnd(r.gross)}
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-gray-400"
                  >
                    {totalOrders
                      ? "Không có đơn nào khớp bộ lọc"
                      : "Không có đơn nào trong lô này"}
                  </td>
                </tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-gray-50 border-t">
                <tr className="text-xs">
                  <td
                    className="px-3 py-2.5 font-semibold text-gray-500"
                    colSpan={3}
                  >
                    Tổng {filtered.length} đơn
                    {isFiltered ? " (đang lọc)" : ""}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-amber-700 whitespace-nowrap">
                    {formatVnd(filteredTotal.recovered)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-red-600 whitespace-nowrap">
                    {isFiltered || summary?.openDebtAfterTotal == null
                      ? "—"
                      : formatVnd(summary.openDebtAfterTotal)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">
                    {formatVnd(filteredTotal.platform)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">
                    {formatVnd(filteredTotal.reserve)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-[#1a1a2e] whitespace-nowrap">
                    {formatVnd(filteredTotal.gross)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 leading-relaxed">
        “Nợ đã thu” phân bổ về đơn cũ trước (mỗi đơn gánh tối đa doanh thu của
        chính nó) nên tổng luôn khớp số nợ thu hồi của lô. “Nợ còn lại” là nợ
        của chủ ví sau đơn này — không phải khoản nợ riêng của đơn, vì vậy dòng
        tổng chỉ hiển thị khi không lọc và không cộng trùng theo đơn.
      </p>
    </div>
  );
}




