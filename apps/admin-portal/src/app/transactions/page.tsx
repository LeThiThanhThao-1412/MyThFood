"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  driverApi,
  merchantApi,
  walletApi,
} from "@mythfood/api-client";
import type { PlatformLedgerLoan, PlatformLedgerTx } from "@mythfood/api-client";
import { useAuthStore } from "@mythfood/frontend-shared";
import {
  formatDateTime,
  formatVnd,
  VN_TIMEZONE,
} from "../../lib/format";
import AdminShell from "../../components/AdminShell";

type Ledger = Awaited<ReturnType<typeof walletApi.getPlatformLedger>>;
type RangeKey = "today" | "7d" | "30d" | "all";
type TabKey = "platform" | "loans" | "drivers";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Hôm nay" },
  { key: "7d", label: "7 ngày" },
  { key: "30d", label: "30 ngày" },
  { key: "all", label: "Tất cả" },
];

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "platform", label: "Sổ ví nền tảng", icon: "🏦" },
  { key: "loans", label: "Cho mượn & thu nợ", icon: "🤝" },
  { key: "drivers", label: "Thu chi ví tài xế", icon: "🛵" },
];

/** Nhãn tiếng Việt cho `referenceType` (nguồn tiền) của ví. */
const REFERENCE_LABEL: Record<string, string> = {
  PLATFORM_COMMISSION: "Hoa hồng nền tảng",
  PENALTY: "Thu tiền phạt / vi phạm",
  DEBT_RECOVERY: "Thu hồi nợ (clawback)",
  CLAWBACK_RECOVERY: "Thu nợ từ ví bên nợ",
  CLAWBACK_RECOVERY_REVERT: "Hoàn lại phần nợ chưa phân bổ",
  CLAWBACK_ADVANCE: "Ứng tiền hoàn/bồi thường (cho mượn)",
  ADMIN_WALLET_SEED: "Nạp ví khởi tạo (seed)",
  RESERVE_FUND_CONTRIBUTION: "Trích quỹ dự phòng",
  RESERVE_DISBURSE: "Chi quỹ dự phòng",
  SETTLEMENT: "Doanh thu ship",
  COD_SETTLEMENT: "Nộp tiền COD",
  REFUND: "Hoàn tiền khách",
  CASE_COMPENSATION: "Bồi thường khách",
  CASE_COMPENSATION_DEBT: "Ghi nợ bồi thường",
  FAILURE_MERCHANT_REFUND: "Hoàn tiền đơn lỗi",
  FAILURE_MERCHANT_LIABILITY: "Nợ đơn lỗi",
  TOPUP: "Nạp tiền",
  WITHDRAW: "Rút tiền",
  PAYMENT: "Thanh toán đơn",
};

const TYPE_LABEL: Record<string, string> = {
  CREDIT: "Cộng tiền",
  REVENUE: "Thu nhập",
  DEBIT: "Trừ tiền",
};

const LOAN_STATUS: Record<string, { label: string; className: string }> = {
  OPEN: { label: "Chưa thu được", className: "bg-red-100 text-red-700" },
  PARTIAL: {
    label: "Thu một phần",
    className: "bg-orange-100 text-orange-700",
  },
  SETTLED: { label: "Đã thu đủ", className: "bg-green-100 text-green-700" },
};

const LOAN_CATEGORY: Record<string, string> = {
  CUSTOMER_REFUND: "Hoàn tiền khách",
  CUSTOMER_COMPENSATION: "Bồi thường khách",
  DRIVER_COMPENSATION: "Bồi thường tài xế",
  PLATFORM_FUND: "Bù quỹ nền tảng",
  UNCATEGORIZED: "Chưa phân loại",
};

function refLabel(ref?: string | null): string {
  if (!ref) return "Khác";
  return REFERENCE_LABEL[ref] ?? ref;
}

function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type;
}

/**
 * Khoảng thời gian gửi lên API. Mốc "từ" tính theo **00:00 giờ VN** để khớp
 * cách admin đọc sổ (một ngày của quán tính theo giờ Việt Nam, không phải UTC).
 */
function rangeToParams(key: RangeKey): { from?: string; to?: string } {
  if (key === "all") return {};
  const now = new Date();
  const days = key === "today" ? 0 : key === "7d" ? 6 : 29;
  const startDay = new Date(now.getTime() - days * 86_400_000).toLocaleDateString(
    "en-CA",
    { timeZone: VN_TIMEZONE },
  );
  return { from: `${startDay}T00:00:00+07:00`, to: now.toISOString() };
}

function shortId(id?: string | null): string {
  return id ? `${id.slice(0, 8)}…` : "—";
}

/** Tên chủ ví: tài xế/nhà hàng lấy từ service tương ứng, còn lại hiển thị mã. */
function ownerLabel(
  ownerType: string,
  ownerId: string,
  names: { drivers: Record<string, string>; merchants: Record<string, string> },
): string {
  if (ownerId === "PLATFORM_DEFAULT") return "Ví nền tảng";
  if (ownerId === "RESERVE_FUND") return "Quỹ dự phòng";
  if (ownerType === "DRIVER")
    return names.drivers[ownerId] ?? `Tài xế • ${shortId(ownerId)}`;
  if (ownerType === "MERCHANT")
    return names.merchants[ownerId] ?? `Nhà hàng • ${shortId(ownerId)}`;
  if (ownerType === "CONSUMER") return `Khách • ${shortId(ownerId)}`;
  return `${ownerType} • ${shortId(ownerId)}`;
}

type OwnerNames = {
  drivers: Record<string, string>;
  merchants: Record<string, string>;
};

function StatCard({
  icon,
  label,
  value,
  sub,
  accent = "text-gray-900",
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        <span className="text-sm">{icon}</span>
        {label}
      </div>
      <p className={`mt-2 text-xl font-bold leading-tight ${accent}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-gray-400">{sub}</p> : null}
    </div>
  );
}

/** Bảng phân rã "tiền vào/ra đến từ đâu" theo `referenceType`. */
function SourceBreakdown({
  title,
  hint,
  rows,
  tone,
}: {
  title: string;
  hint?: string;
  rows: { referenceType: string; count: number; total: number }[];
  tone: "in" | "out";
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      {hint ? <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p> : null}
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-gray-400">Chưa có giao dịch trong kỳ.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li
              key={r.referenceType}
              className="flex items-center gap-3 text-sm"
            >
              <span className="flex-1 truncate text-gray-600">
                {refLabel(r.referenceType)}
              </span>
              <span className="shrink-0 text-[11px] text-gray-400">
                {r.count} GD
              </span>
              <span
                className={`shrink-0 font-semibold ${
                  tone === "in" ? "text-green-600" : "text-red-600"
                }`}
              >
                {tone === "in" ? "+" : "−"}
                {formatVnd(r.total)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const className =
    type === "DEBIT"
      ? "bg-red-50 text-red-600"
      : type === "REVENUE"
        ? "bg-blue-50 text-blue-600"
        : "bg-green-50 text-green-600";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap ${className}`}
    >
      {typeLabel(type)}
    </span>
  );
}

function EmptyTable({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-gray-400">{text}</div>;
}

/** Bảng dòng giao dịch ví (dùng cho ví nền tảng và ví tài xế). */
function TxTable({
  rows,
  names,
  caption,
}: {
  rows: PlatformLedgerTx[];
  names: OwnerNames;
  caption?: string;
}) {
  if (rows.length === 0) {
    return <EmptyTable text="Chưa có giao dịch nào trong kỳ." />;
  }
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wide text-gray-400">
              <th className="py-2 pr-3 font-semibold">Thời gian</th>
              <th className="py-2 pr-3 font-semibold">Chủ ví</th>
              <th className="py-2 pr-3 font-semibold">Loại</th>
              <th className="py-2 pr-3 text-right font-semibold">Số tiền</th>
              <th className="py-2 pr-3 text-right font-semibold">Số dư sau</th>
              <th className="py-2 pr-3 font-semibold">Nguồn</th>
              <th className="py-2 font-semibold">Mô tả</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((t) => {
              const isCredit = t.type !== "DEBIT";
              return (
                <tr key={t.id} className="hover:bg-gray-50/70">
                  <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">
                    {formatDateTime(t.createdAt)}
                  </td>
                  <td className="py-2 pr-3 text-gray-700">
                    {ownerLabel(t.ownerType, t.ownerId, names)}
                  </td>
                  <td className="py-2 pr-3">
                    <TypeBadge type={t.type} />
                  </td>
                  <td
                    className={`py-2 pr-3 text-right font-semibold whitespace-nowrap ${
                      isCredit ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {isCredit ? "+" : "−"}
                    {formatVnd(t.amount)}
                  </td>
                  <td className="py-2 pr-3 text-right text-gray-500 whitespace-nowrap">
                    {formatVnd(t.balanceAfter)}
                  </td>
                  <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">
                    {refLabel(t.referenceType)}
                  </td>
                  <td
                    className="py-2 text-gray-500 max-w-[24rem] truncate"
                    title={t.description}
                  >
                    {t.description || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {caption ? (
        <p className="mt-2 text-[11px] text-gray-400">{caption}</p>
      ) : null}
    </>
  );
}

function LoanStatusBadge({ status }: { status: string }) {
  const cfg = LOAN_STATUS[status] ?? {
    label: status,
    className: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

/** Bảng khoản nền tảng ứng tiền bồi thường (bên vi phạm đang nợ). */
function LoanTable({
  rows,
  names,
}: {
  rows: PlatformLedgerLoan[];
  names: OwnerNames;
}) {
  if (rows.length === 0) {
    return <EmptyTable text="Không có khoản cho mượn nào trong kỳ." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wide text-gray-400">
            <th className="py-2 pr-3 font-semibold">Thời gian</th>
            <th className="py-2 pr-3 font-semibold">Bên nợ</th>
            <th className="py-2 pr-3 font-semibold">Khoản nợ</th>
            <th className="py-2 pr-3 text-right font-semibold">Đã ứng</th>
            <th className="py-2 pr-3 text-right font-semibold">Còn nợ</th>
            <th className="py-2 pr-3 font-semibold">Trạng thái</th>
            <th className="py-2 font-semibold">Ghi chú</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-gray-50/70">
              <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">
                {formatDateTime(c.createdAt)}
              </td>
              <td className="py-2 pr-3 text-gray-700">
                {ownerLabel(c.ownerType, c.ownerId, names)}
              </td>
              <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">
                {LOAN_CATEGORY[c.category ?? ""] ?? c.category ?? "Khác"}
              </td>
              <td className="py-2 pr-3 text-right font-semibold text-gray-700 whitespace-nowrap">
                {formatVnd(c.originalAmount)}
              </td>
              <td
                className={`py-2 pr-3 text-right font-semibold whitespace-nowrap ${
                  c.remainingAmount > 0 ? "text-red-600" : "text-green-600"
                }`}
              >
                {formatVnd(c.remainingAmount)}
              </td>
              <td className="py-2 pr-3">
                <LoanStatusBadge status={c.status} />
              </td>
              <td
                className="py-2 text-gray-500 max-w-[24rem] truncate"
                title={c.description ?? ""}
              >
                {c.description ||
                  (c.sourceOrderId ? `Đơn ${shortId(c.sourceOrderId)}` : "—")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminPlatformWalletPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  const [range, setRange] = useState<RangeKey>("30d");
  const [tab, setTab] = useState<TabKey>("platform");
  const [data, setData] = useState<Ledger | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [driverNames, setDriverNames] = useState<Record<string, string>>({});
  const [merchantNames, setMerchantNames] = useState<Record<string, string>>(
    {},
  );

  // Bộ lọc ví tài xế — áp dụng ở server để totals/byDriver cùng một phạm vi.
  const [driverId, setDriverId] = useState("");
  const [driverType, setDriverType] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [driverSearch, setDriverSearch] = useState("");

  // Lọc phía client cho 2 bảng của ví nền tảng (không đổi số tổng đã tính).
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");
  const [loanStatus, setLoanStatus] = useState<"all" | "open" | "settled">(
    "all",
  );

  const names = useMemo<OwnerNames>(
    () => ({ drivers: driverNames, merchants: merchantNames }),
    [driverNames, merchantNames],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await walletApi.getPlatformLedger({
        ...rangeToParams(range),
        take: 200,
        driverId: driverId || undefined,
        driverType: driverType || undefined,
        driverSearch: driverSearch || undefined,
      });
      setData(res);
    } catch (err) {
      // Hiển thị lý do thật để admin biết là 404 (service chưa có route mới),
      // 401 (token hết hạn) hay 500 (lỗi dữ liệu) thay vì chỉ "thử lại".
      const status = err instanceof ApiError ? err.status : 0;
      const reason = err instanceof Error ? err.message : "";
      const detail =
        status === 404
          ? "Máy chủ ví chưa có endpoint sổ ví nền tảng (cần build lại wallet-service)."
          : status === 401 || status === 403
            ? "Phiên đăng nhập không có quyền ADMIN hoặc đã hết hạn."
            : status
              ? `Máy chủ ví trả lỗi ${status}${reason ? `: ${reason}` : ""}.`
              : reason || "Không kết nối được máy chủ ví.";
      setError(`Không thể tải sổ ví nền tảng. ${detail}`);
    } finally {
      setLoading(false);
    }
  }, [range, driverId, driverType, driverSearch]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    load();
  }, [isAuthenticated, load]);

  // Tên nhà hàng/tài xế chỉ để hiển thị — lỗi API không được chặn màn hình.
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
        /* hiển thị fallback Nhà hàng • <id> */
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
        /* hiển thị fallback Tài xế • <id> */
      }
    })();
    return () => {
      alive = false;
    };
  }, [isAuthenticated]);

  const driverOptions = useMemo(
    () =>
      Object.entries(driverNames)
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, "vi")),
    [driverNames],
  );

  /** Gộp 2 chiều tiền của ví nền tảng thành 1 sổ, mới nhất lên đầu. */
  const platformRows = useMemo(() => {
    if (!data) return [];
    const rows = [...data.inflow.items, ...data.outflow.items];
    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    if (direction === "in") return rows.filter((t) => t.type !== "DEBIT");
    if (direction === "out") return rows.filter((t) => t.type === "DEBIT");
    return rows;
  }, [data, direction]);

  const loanRows = useMemo(() => {
    if (!data) return [];
    if (loanStatus === "open")
      return data.loans.items.filter(
        (c) => c.remainingAmount > 0 && c.status !== "SETTLED",
      );
    if (loanStatus === "settled")
      return data.loans.items.filter((c) => c.status === "SETTLED");
    return data.loans.items;
  }, [data, loanStatus]);

  const driverNet = data
    ? data.drivers.totals.revenue +
      data.drivers.totals.credit -
      data.drivers.totals.debit
    : 0;

  return (
    <AdminShell title="🏦 Ví nền tảng">
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Kỳ báo cáo */}
        <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mr-1">
            Kỳ
          </span>
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                range === r.key
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {r.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-400">
            {loading
              ? "Đang tải…"
              : data
                ? `Cập nhật ${formatDateTime(data.generatedAt)}`
                : ""}
          </span>
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#ff6b35] hover:bg-[#e85a26] disabled:opacity-50"
          >
            ↻ Làm mới
          </button>
        </div>

        {loading && !data ? (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-sm text-gray-400">
            Đang tải sổ ví…
          </div>
        ) : data ? (
          <>
            {/* Số dư & 4 nhóm dòng tiền */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <StatCard
                icon="🏦"
                label="Ví nền tảng"
                value={formatVnd(data.wallets.platform.balance)}
                sub={`Đang giữ hộ ${formatVnd(data.wallets.platform.heldBalance)}`}
                accent="text-[#ff6b35]"
              />
              <StatCard
                icon="🛡️"
                label="Quỹ dự phòng"
                value={formatVnd(data.wallets.reserve.balance)}
                sub={`Đang giữ hộ ${formatVnd(data.wallets.reserve.heldBalance)}`}
              />
              <StatCard
                icon="📥"
                label="Tiền nhận vào (kỳ)"
                value={formatVnd(data.inflow.total)}
                sub={`${data.inflow.count} giao dịch`}
                accent="text-green-600"
              />
              <StatCard
                icon="📤"
                label="Tiền chi ra (kỳ)"
                value={formatVnd(data.outflow.total)}
                sub={
                  data.outflow.advanceTotal > 0
                    ? `${data.outflow.count} GD · ứng ${formatVnd(data.outflow.advanceTotal)}`
                    : `${data.outflow.count} giao dịch`
                }
                accent="text-red-600"
              />
              <StatCard
                icon="🤝"
                label="Cho mượn bồi thường"
                value={formatVnd(data.loans.openRemaining)}
                sub={`Đã ứng ${formatVnd(data.loans.totalOriginal)} · ${data.loans.openCount} khoản chưa thu`}
                accent="text-orange-600"
              />
              <StatCard
                icon="💵"
                label="Đã thu nợ (kỳ)"
                value={formatVnd(data.recovery.total)}
                sub={`${data.recovery.count} lần trừ vào ví bên nợ`}
                accent="text-blue-600"
              />
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                    tab === t.key
                      ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                      : "text-gray-500 hover:bg-white/70"
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {tab === "platform" && (
              <>
                <div className="grid gap-4 lg:grid-cols-2">
                  <SourceBreakdown
                    title="Tiền nhận vào theo nguồn"
                    hint="Hoa hồng, tiền phạt, thu nợ, nạp ví khởi tạo…"
                    rows={data.inflow.byReferenceType}
                    tone="in"
                  />
                  <SourceBreakdown
                    title="Tiền chi ra theo nguồn"
                    hint="Ứng hoàn/bồi thường, trích quỹ dự phòng…"
                    rows={data.outflow.byReferenceType}
                    tone="out"
                  />
                </div>
                <p className="text-[11px] leading-relaxed text-gray-400">
                  “Tiền chi ra” = {formatVnd(data.outflow.total)} đã trừ thẳng
                  khỏi ví nền tảng/quỹ dự phòng
                  {data.outflow.advanceTotal > 0 ? (
                    <>
                      , trong đó{" "}
                      <b>{formatVnd(data.outflow.advanceTotal)}</b> là tiền nền
                      tảng ứng hoàn/bồi thường cho người nhận (
                      {data.outflow.advanceCount} khoản)
                    </>
                  ) : null}
                  . Khoản ứng ghi <b>DEBIT CLAWBACK_ADVANCE</b> trên ví nền tảng;
                  khi ví bên nợ có tiền, hệ thống thu hồi và hoàn lại bằng{" "}
                  <b>CREDIT DEBT_RECOVERY</b> — chi tiết ở tab “Cho mượn &amp;
                  thu nợ”.
                </p>
              </>
            )}

            {tab === "loans" && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-gray-900">
                    Nền tảng ứng tiền bồi thường trước
                  </h3>
                  <span className="text-[11px] text-gray-400">
                    ({loanRows.length} khoản)
                  </span>
                  <div className="ml-auto flex gap-1.5">
                    {(
                      [
                        { key: "all", label: "Tất cả" },
                        { key: "open", label: "Còn nợ" },
                        { key: "settled", label: "Đã thu đủ" },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.key}
                        onClick={() => setLoanStatus(f.key)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                          loanStatus === f.key
                            ? "bg-gray-900 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">
                      Đã ứng · {data.loans.totalCount} khoản
                    </p>
                    <p className="mt-1 font-bold text-gray-800">
                      {formatVnd(data.loans.totalOriginal)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-green-50 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-green-600/70">
                      Đã thu từ ví bên nợ (kỳ)
                    </p>
                    <p className="mt-1 font-bold text-green-700">
                      {formatVnd(data.recovery.total)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-red-50 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-red-500/80">
                      Còn phải thu · {data.loans.openCount} khoản
                    </p>
                    <p className="mt-1 font-bold text-red-600">
                      {formatVnd(data.loans.openRemaining)}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <LoanTable rows={loanRows} names={names} />
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
                  Nền tảng ứng tiền trả bên bị hại trước — tiền ứng được trừ thẳng
                  khỏi ví nền tảng (<b>DEBIT CLAWBACK_ADVANCE</b>), bên vi phạm ghi
                  nợ clawback. Khi ví bên nợ có tiền vào, hệ thống tự trừ (DEBIT
                  CLAWBACK_RECOVERY) và ghi có vào ví nền tảng (CREDIT
                  DEBT_RECOVERY) — hai số này luôn khớp 1-1.
                </p>
              </div>
            )}

            {tab === "platform" && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-gray-900">
                    Sổ chi tiết ví nền tảng + quỹ dự phòng
                  </h3>
                  <span className="text-[11px] text-gray-400">
                    ({platformRows.length} dòng mới nhất)
                  </span>
                  <div className="ml-auto flex gap-1.5">
                    {(
                      [
                        { key: "all", label: "Tất cả" },
                        { key: "in", label: "Tiền vào" },
                        { key: "out", label: "Tiền ra" },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.key}
                        onClick={() => setDirection(f.key)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                          direction === f.key
                            ? "bg-gray-900 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-4">
                  <TxTable
                    rows={platformRows}
                    names={names}
                    caption="Số tổng phía trên tính trên toàn kỳ; bảng chỉ hiển thị tối đa 200 bút toán ví gần nhất. Khoản nền tảng ứng hoàn/bồi thường nằm ngay trong bảng này với nhãn CLAWBACK_ADVANCE và được hoàn lại bằng DEBT_RECOVERY khi thu hồi nợ."
                  />
                </div>
              </div>
            )}

            {tab === "drivers" && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard
                    icon="📈"
                    label="Doanh thu ship"
                    value={formatVnd(data.drivers.totals.revenue)}
                    sub="Tiền lô quyết toán 23:00"
                    accent="text-green-600"
                  />
                  <StatCard
                    icon="➕"
                    label="Cộng thêm"
                    value={formatVnd(data.drivers.totals.credit)}
                    sub="Bồi thường, hoàn tiền, nạp ví"
                    accent="text-blue-600"
                  />
                  <StatCard
                    icon="➖"
                    label="Trừ khỏi ví"
                    value={formatVnd(data.drivers.totals.debit)}
                    sub="Nộp COD, tiền phạt, thu nợ"
                    accent="text-red-600"
                  />
                  <StatCard
                    icon="⚖️"
                    label="Dòng tiền ròng"
                    value={formatVnd(driverNet)}
                    sub={`${data.drivers.totals.count} giao dịch`}
                    accent={driverNet >= 0 ? "text-green-600" : "text-red-600"}
                  />
                </div>

                <div className="bg-white rounded-2xl shadow-sm p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-gray-900">
                      Thu chi từng tài xế
                    </h3>
                    <span className="text-[11px] text-gray-400">
                      ({data.drivers.byDriver.length} tài xế)
                    </span>
                    <span className="ml-auto text-[11px] text-gray-400">
                      Bấm vào tài xế để lọc sổ chi tiết
                    </span>
                  </div>
                  {data.drivers.byDriver.length === 0 ? (
                    <p className="mt-3 text-xs text-gray-400">
                      Chưa có giao dịch nào trong kỳ.
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {data.drivers.byDriver.map((d) => (
                        <button
                          key={d.ownerId}
                          onClick={() =>
                            setDriverId(driverId === d.ownerId ? "" : d.ownerId)
                          }
                          className={`rounded-xl border p-3 text-left transition ${
                            driverId === d.ownerId
                              ? "border-[#ff6b35] bg-orange-50/40"
                              : "border-gray-100 hover:border-[#ff6b35]/60"
                          }`}
                        >
                          <p className="truncate text-sm font-semibold text-gray-800">
                            {driverNames[d.ownerId] ??
                              `Tài xế • ${shortId(d.ownerId)}`}
                          </p>
                          <p className="mt-0.5 text-[11px] text-gray-400">
                            {d.count} giao dịch · còn trên ví{" "}
                            {formatVnd(d.balance)}
                          </p>
                          <div className="mt-2 flex items-center justify-between text-xs font-semibold">
                            <span className="text-green-600">
                              +{formatVnd(d.revenue + d.credit)}
                            </span>
                            <span className="text-red-600">
                              −{formatVnd(d.debit)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {tab === "drivers" && (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-gray-900">
                    Sổ chi tiết ví tài xế
                  </h3>
                  <span className="text-[11px] text-gray-400">
                    ({data.drivers.items.length} dòng mới nhất)
                  </span>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <select
                      value={driverId}
                      onChange={(e) => setDriverId(e.target.value)}
                      className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white"
                    >
                      <option value="">Tất cả tài xế</option>
                      {driverId && !driverNames[driverId] ? (
                        <option value={driverId}>
                          Tài xế • {shortId(driverId)}
                        </option>
                      ) : null}
                      {driverOptions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={driverType}
                      onChange={(e) => setDriverType(e.target.value)}
                      className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white"
                    >
                      <option value="">Mọi loại</option>
                      <option value="REVENUE">Thu nhập</option>
                      <option value="CREDIT">Cộng tiền</option>
                      <option value="DEBIT">Trừ tiền</option>
                    </select>
                    <input
                      value={searchDraft}
                      onChange={(e) => setSearchDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setDriverSearch(searchDraft.trim());
                      }}
                      placeholder="Tìm theo mô tả…"
                      className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 w-48"
                    />
                    <button
                      onClick={() => setDriverSearch(searchDraft.trim())}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#ff6b35] hover:bg-[#e85a26]"
                    >
                      Tìm
                    </button>
                  </div>
                </div>
                <div className="mt-4">
                  <TxTable
                    rows={data.drivers.items}
                    names={names}
                    caption="Số tổng và xếp hạng tính theo bộ lọc tài xế/loại/mô tả ở trên; bảng hiển thị tối đa 200 dòng gần nhất."
                  />
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </AdminShell>
  );
}


