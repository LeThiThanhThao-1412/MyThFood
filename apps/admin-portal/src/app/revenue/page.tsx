"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { orderApi, paymentApi, walletApi } from "@mythfood/api-client";
import { useAuthStore } from "@mythfood/frontend-shared";
import { formatVnd, toNum } from "../../lib/format";
import AdminShell from "../../components/AdminShell";

export default function AdminRevenuePage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  const [orderStats, setOrderStats] = useState<any>(null);
  const [payStats, setPayStats] = useState<any>(null);
  const [walletStats, setWalletStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    load();
  }, [isAuthenticated]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [oRes, pRes, wRes] = await Promise.all([
        orderApi.getDailyStats().catch(() => null),
        paymentApi.getDailyStats().catch(() => null),
        walletApi.getWalletStats().catch(() => null),
      ]);
      setOrderStats(oRes);
      setPayStats(pRes);
      setWalletStats(wRes);
    } catch {
      setError("Không thể tải dữ liệu doanh thu");
    } finally {
      setLoading(false);
    }
  }

  const summary = orderStats?.summary || {};
  const daily = Array.isArray(orderStats?.dailyStats)
    ? orderStats.dailyStats
    : [];
  const balanceByType = walletStats?.balanceByType || {};

  return (
    <AdminShell title="📈 Quản lý Doanh thu">
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm p-8 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card
                label="Tổng doanh thu"
                value={formatVnd(summary.totalRevenue)}
                sub="đã giao"
                accent="text-green-600"
              />
              <Card
                label="Tổng đơn hàng"
                value={(summary.totalOrders ?? 0).toLocaleString("vi-VN")}
                sub="đơn"
              />
              <Card
                label="Giá trị TB / đơn"
                value={formatVnd(summary.averageOrderValue)}
                sub=""
              />
              <Card
                label="Số dư ví Platform"
                value={formatVnd(balanceByType.PLATFORM)}
                sub="10% nền tảng"
                accent="text-[#ff6b35]"
              />
            </div>

            <DailyRevenueChart daily={daily} />

            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="font-bold text-lg mb-4">👛 Số dư ví theo loại</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card
                  label="Platform"
                  value={formatVnd(balanceByType.PLATFORM)}
                />
                <Card
                  label="Merchant"
                  value={formatVnd(balanceByType.MERCHANT)}
                />
                <Card label="Driver" value={formatVnd(balanceByType.DRIVER)} />
                <Card
                  label="Consumer"
                  value={formatVnd(balanceByType.CONSUMER)}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}

function Card({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: any;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent || "text-gray-800"}`}>
        {value}
      </p>
      {sub ? <p className="text-xs text-gray-400 mt-1">{sub}</p> : null}
    </div>
  );
}

// ============================================================================
// Biểu đồ doanh thu theo ngày
//
// Vì sao phải viết lại: bản cũ đặt `style={{ height: "42%" }}` cho cột nằm
// trong một flex-item **không có chiều cao xác định** ⇒ trình duyệt tính ra 0px,
// nên biểu đồ luôn trống dù có dữ liệu. Ngoài ra dữ liệu thật rất lệch (một
// ngày 362.377.401₫, ngày khác 669.076₫) nên nếu chỉ vẽ theo tỷ lệ thật thì các
// ngày nhỏ cao chưa tới 1px, mắt thường không thấy.
//
// Cách làm mới: chiều cao cột tính bằng **px** trên khung có chiều cao cố định
// (luôn vẽ được), thêm lưới + nhãn trục Y, nhãn số tiền trên đầu cột và nút đổi
// thang đo "Tỷ lệ thật" / "Thang log" (log giúp ngày nhỏ vẫn đọc được).
// ============================================================================

/** 362377401 → "362,4tr₫" (nhãn trục Y / đầu cột, tránh chuỗi quá dài). */
function compactVnd(value: number): string {
  const v = Math.max(0, Math.round(value || 0));
  if (v === 0) return "0₫";
  if (v >= 1_000_000_000)
    return `${(v / 1_000_000_000).toLocaleString("vi-VN", {
      maximumFractionDigits: 1,
    })} tỷ`;
  if (v >= 1_000_000)
    return `${(v / 1_000_000).toLocaleString("vi-VN", {
      maximumFractionDigits: 1,
    })}tr₫`;
  if (v >= 1_000)
    return `${(v / 1_000).toLocaleString("vi-VN", {
      maximumFractionDigits: 0,
    })}k₫`;
  return `${v.toLocaleString("vi-VN")}₫`;
}

/** "2026-11-09" → "09/11". */
function dayLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date || "");
  return m ? `${m[3]}/${m[2]}` : date || "—";
}

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD (en-CA trả đúng thứ tự này). */
function todayInVN(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

/** Cộng/trừ ngày trên chuỗi YYYY-MM-DD (dùng UTC để không lệch vì múi giờ). */
function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, (m || 1) - 1, d || 1) + days * 86_400_000);
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(t.getUTCDate()).padStart(2, "0");
  return `${t.getUTCFullYear()}-${mm}-${dd}`;
}

/** Khung vẽ cao 150px, cột cao nhất 120px — chừa 30px cho nhãn số tiền. */
const PLOT_HEIGHT = 150;
const BAR_MAX_HEIGHT = 120;
const CHART_DAYS = 14;

function DailyRevenueChart({ daily }: { daily: any[] }) {
  // Dữ liệu thường lệch rất mạnh (một ngày 362tr, ngày khác 0,6tr). Nếu chênh
  // > 20 lần thì mặc định mở thang log, nếu không biểu đồ chỉ còn một cột cao
  // và các ngày còn lại dẹt xuống đáy — admin vẫn đổi lại "Tỷ lệ thật" được.
  const [scale, setScale] = useState<"linear" | "log">(() => {
    const values = (Array.isArray(daily) ? daily : [])
      .map((d: any) => toNum(d?.totalRevenue))
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    if (values.length < 2) return "linear";
    return values[values.length - 1] / values[0] > 20 ? "log" : "linear";
  });

  type ChartRow = {
    date: string;
    revenue: number;
    orders: number;
    completed: number;
    cancelled: number;
  };

  const rawRows: ChartRow[] = (Array.isArray(daily) ? daily : [])
    .map((d: any) => ({
      date: String(d?.date || ""),
      revenue: Math.max(0, toNum(d?.totalRevenue)),
      orders: toNum(d?.totalOrders),
      completed: toNum(d?.completedOrders),
      cancelled: toNum(d?.cancelledOrders),
    }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Trục thời gian phải liên tục: ngày không phát sinh đơn vẫn hiện cột 0₫.
  // Nếu chỉ vẽ các ngày có đơn thì biểu đồ "nhảy" ngày và rất khó đọc xu hướng.
  const byDate = new Map(rawRows.map((r) => [r.date, r]));
  const today = todayInVN();
  const lastDate = rawRows.length ? rawRows[rawRows.length - 1].date : today;
  const endDate = lastDate > today ? lastDate : today;

  const rows: ChartRow[] = [];
  for (let i = CHART_DAYS - 1; i >= 0; i--) {
    const date = shiftDate(endDate, -i);
    rows.push(
      byDate.get(date) ?? {
        date,
        revenue: 0,
        orders: 0,
        completed: 0,
        cancelled: 0,
      },
    );
  }

  const maxRevenue = Math.max(1, ...rows.map((r) => r.revenue));
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const best = rows.reduce<any>(
    (acc, r) => (!acc || r.revenue > acc.revenue ? r : acc),
    null,
  );

  // Thang log dùng log10(1 + doanh thu): ngày 0₫ vẫn nằm ở đáy, còn ngày nhỏ
  // không bị "dẹt" xuống 0px khi có một ngày doanh thu đột biến.
  const logMax = Math.log10(1 + maxRevenue);

  /** Doanh thu → chiều cao cột (px). Ngày có tiền luôn cao ≥ 6px để nhìn thấy. */
  const heightOf = (revenue: number): number => {
    if (revenue <= 0) return 0;
    const ratio =
      scale === "linear"
        ? revenue / maxRevenue
        : Math.log10(1 + revenue) / logMax;
    return Math.max(6, Math.round(ratio * BAR_MAX_HEIGHT));
  };

  /** Chiều cao cột → số tiền (đọc ngược đúng thang đo, nhãn trục Y không sai). */
  const valueAt = (px: number): number => {
    const ratio = px / BAR_MAX_HEIGHT;
    return scale === "linear"
      ? maxRevenue * ratio
      : Math.pow(10, logMax * ratio) - 1;
  };

  const ticks = [1, 0.5, 0].map((t) => {
    const px = t * BAR_MAX_HEIGHT;
    return { px, value: valueAt(px) };
  });

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-lg">📊 Doanh thu theo ngày</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {dayLabel(rows[0].date)} – {dayLabel(rows[rows.length - 1].date)} (
            {rows.length} ngày) · đơn huỷ / bị từ chối không tính vào doanh thu
          </p>
        </div>
        <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setScale("linear")}
            className={`px-3 py-1.5 rounded-md font-medium transition ${
              scale === "linear"
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Tỷ lệ thật
          </button>
          <button
            type="button"
            onClick={() => setScale("log")}
            title="Dùng thang log để ngày doanh thu nhỏ vẫn nhìn thấy — cột không còn đúng tỷ lệ"
            className={`px-3 py-1.5 rounded-md font-medium transition ${
              scale === "log"
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Thang log
          </button>
        </div>
      </div>

      {totalRevenue === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">
          Chưa có doanh thu trong {rows.length} ngày gần nhất
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
            <span>
              {rows.length} ngày:{" "}
              <b className="text-gray-800">{formatVnd(totalRevenue)}</b>
            </span>
            <span>
              Trung bình/ngày:{" "}
              <b className="text-gray-800">
                {formatVnd(Math.round(totalRevenue / rows.length))}
              </b>
            </span>
            {best && best.revenue > 0 && (
              <span>
                Cao nhất:{" "}
                <b className="text-[#ff6b35]">{formatVnd(best.revenue)}</b> (
                {dayLabel(best.date)})
              </span>
            )}
          </div>
          <div className="mt-4 grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2">
            {/* Trục Y: nhãn số tiền tại mức 100% / 50% / 0 của cột cao nhất */}
            <div className="relative" style={{ height: PLOT_HEIGHT }}>
              {ticks.map((t) => (
                <span
                  key={`axis-${t.px}`}
                  className="absolute right-0 w-full text-right text-[10px] leading-none text-gray-400"
                  style={{ bottom: t.px, transform: "translateY(50%)" }}
                >
                  {compactVnd(t.value)}
                </span>
              ))}
            </div>

            {/* Khung vẽ: lưới ngang + cột */}
            <div className="relative min-w-0" style={{ height: PLOT_HEIGHT }}>
              <div
                className="absolute inset-x-0 bottom-0 pointer-events-none"
                style={{ height: BAR_MAX_HEIGHT }}
              >
                {ticks.map((t) => (
                  <div
                    key={`grid-${t.px}`}
                    className={`absolute inset-x-0 border-t ${
                      t.px === 0
                        ? "border-gray-300"
                        : "border-dashed border-gray-200"
                    }`}
                    style={{ bottom: t.px }}
                  />
                ))}
              </div>

              <div className="relative flex items-end gap-1.5 h-full">
                {rows.map((r, i) => {
                  const h = heightOf(r.revenue);
                  const isBest = best === r && r.revenue > 0;
                  const fullDate = `${dayLabel(r.date)}/${r.date.slice(0, 4)}`;
                  return (
                    <div
                      key={`${r.date}-${i}`}
                      className="flex-1 h-full flex flex-col justify-end items-center min-w-0"
                      title={`${fullDate}: ${formatVnd(r.revenue)} · ${r.orders} đơn (${r.completed} hoàn tất, ${r.cancelled} huỷ)`}
                    >
                      <span
                        className={`mb-1 hidden sm:block text-[10px] leading-none truncate max-w-full ${
                          isBest
                            ? "font-semibold text-[#ff6b35]"
                            : "text-gray-500"
                        }`}
                      >
                        {compactVnd(r.revenue)}
                      </span>
                      <div
                        className={`w-full max-w-[38px] rounded-t-md transition-colors ${
                          r.revenue <= 0
                            ? "bg-gray-200"
                            : isBest
                              ? "bg-gradient-to-t from-[#ff6b35] to-[#ffb27a]"
                              : "bg-gradient-to-t from-[#ff8f65] to-[#ffc7ac] hover:from-[#ff6b35] hover:to-[#ff9d78]"
                        }`}
                        style={{ height: r.revenue <= 0 ? 2 : h }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Nhãn ngày dưới từng cột */}
            <div />
            <div className="mt-1.5 flex gap-1.5">
              {rows.map((r, i) => (
                <span
                  key={`day-${r.date}-${i}`}
                  className="flex-1 min-w-0 text-center text-[10px] text-gray-500 truncate"
                >
                  {dayLabel(r.date)}
                </span>
              ))}
            </div>
          </div>
          <p className="mt-3 text-[11px] text-gray-400">
            Rê chuột lên cột để xem số đơn ·{" "}
            {scale === "linear"
              ? "cột đang vẽ đúng tỷ lệ doanh thu."
              : "cột đang vẽ theo thang log (ngày nhỏ dễ thấy, không đúng tỷ lệ)."}
          </p>
        </>
      )}
    </div>
  );
}
