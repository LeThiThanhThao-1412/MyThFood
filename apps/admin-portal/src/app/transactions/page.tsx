"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@mythfood/frontend-shared";
import { walletApi } from "@mythfood/api-client";
import { httpClient } from "@mythfood/api-client";
import { formatDateTime } from "../../lib/format";
import AdminShell from "../../components/AdminShell";

// ─── Nhãn tiếng Việt cho loại giao dịch & đối tượng ví ───────────────
const TYPE_LABEL: Record<string, string> = {
  TOPUP: "Nạp tiền",
  WITHDRAW: "Rút tiền",
  SETTLEMENT: "Quyết toán",
  COD_SETTLEMENT: "Quyết toán COD",
  REGULAR_SETTLEMENT: "Quyết toán thường",
  REFUND: "Hoàn tiền",
  ORDER: "Thanh toán đơn",
  PENALTY: "Phạt",
  COD_HOLD: "Giữ COD",
  COD_RELEASE: "Nhả giữ COD",
  RESERVE_DISBURSE: "Chi quỹ dự phòng",
  CREDIT: "Cộng tiền",
  DEBIT: "Trừ tiền",
};

const TYPE_BADGE: Record<string, string> = {
  TOPUP: "bg-green-100 text-green-700",
  WITHDRAW: "bg-red-100 text-red-700",
  SETTLEMENT: "bg-blue-100 text-blue-700",
  COD_SETTLEMENT: "bg-orange-100 text-orange-700",
  REGULAR_SETTLEMENT: "bg-blue-100 text-blue-700",
  REFUND: "bg-purple-100 text-purple-700",
  ORDER: "bg-cyan-100 text-cyan-700",
  PENALTY: "bg-rose-100 text-rose-700",
  COD_HOLD: "bg-amber-100 text-amber-700",
  COD_RELEASE: "bg-teal-100 text-teal-700",
  RESERVE_DISBURSE: "bg-indigo-100 text-indigo-700",
  CREDIT: "bg-green-100 text-green-700",
  DEBIT: "bg-red-100 text-red-700",
};

const OWNER_TYPE_LABEL: Record<string, string> = {
  DRIVER: "Tài xế",
  MERCHANT: "Nhà hàng",
  CONSUMER: "Khách hàng",
  PLATFORM: "Nền tảng",
};

export default function AdminTransactionsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [ownerTypeFilter, setOwnerTypeFilter] = useState("");

  function formatVnd(amount: number): string {
    return amount.toLocaleString("vi-VN") + "₫";
  }

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    load();
  }, [isAuthenticated, typeFilter, ownerTypeFilter]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ skip: "0", take: "50" });
      if (typeFilter) params.set("type", typeFilter);
      if (ownerTypeFilter) params.set("ownerType", ownerTypeFilter);
      const res = await httpClient.get<any>(
        3009,
        `/wallets/transactions/admin?${params.toString()}`,
      );
      setTransactions(res.items || []);
      setStats({ ...(res.summary || {}), total: res.total ?? 0 });
    } catch {
      setError("Không thể tải giao dịch");
    } finally {
      setLoading(false);
    }
  }

  const typeBadge = (t: any) => {
    // Ưu tiên hiển thị theo referenceType (TOPUP/WITHDRAW/SETTLEMENT...) rồi
    // fallback về type gốc (CREDIT/DEBIT) để người dùng cuối dễ hiểu.
    const key = t.referenceType || t.type;
    const label = TYPE_LABEL[key] || key;
    const cls = TYPE_BADGE[key] || "bg-gray-100 text-gray-600";
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
        {label}
      </span>
    );
  };

  if (!isAuthenticated) return null;

  return (
    <AdminShell title="💰 Quản lý Giao dịch">
      <div className="space-y-4">
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              {
                label: "Tổng nạp",
                value: formatVnd(stats.totalTopupVolume || 0),
                color: "bg-green-500",
              },
              {
                label: "Tổng quyết toán",
                value: formatVnd(stats.totalSettlementVolume || 0),
                color: "bg-orange-500",
              },
              {
                label: "Tổng rút",
                value: formatVnd(stats.totalWithdrawVolume || 0),
                color: "bg-red-500",
              },
              {
                label: "Số giao dịch",
                value: Number(stats.total ?? 0).toLocaleString("vi-VN"),
                color: "bg-blue-500",
              },
            ].map((s, i) => (
              <div
                key={i}
                className={`${s.color} text-white rounded-2xl p-5 shadow-sm`}
              >
                <p className="text-sm opacity-80">{s.label}</p>
                <p className="text-3xl font-extrabold mt-1">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Tất cả loại</option>
            <option value="TOPUP">Nạp tiền</option>
            <option value="WITHDRAW">Rút tiền</option>
            <option value="SETTLEMENT">Quyết toán</option>
            <option value="COD_SETTLEMENT">Quyết toán COD</option>
            <option value="ORDER">Thanh toán đơn</option>
            <option value="PENALTY">Phạt</option>
          </select>
          <select
            value={ownerTypeFilter}
            onChange={(e) => setOwnerTypeFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Tất cả đối tượng</option>
            <option value="DRIVER">Tài xế</option>
            <option value="MERCHANT">Nhà hàng</option>
            <option value="CONSUMER">Khách hàng</option>
          </select>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm p-8 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
            💰 Chưa có giao dịch nào
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Owner
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Loại
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Số tiền
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase hidden md:table-cell">
                    Mô tả
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Số dư
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase hidden lg:table-cell">
                    Ngày
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transactions.map((t: any) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      <p className="font-medium">
                        {t.ownerName || t.ownerId?.slice(0, 8)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {OWNER_TYPE_LABEL[t.ownerType] || t.ownerType}
                      </p>
                    </td>
                    <td className="px-4 py-3">{typeBadge(t)}</td>
                    <td
                      className={`px-4 py-3 text-sm text-right font-semibold ${t.amount < 0 ? "text-red-600" : "text-green-600"}`}
                    >
                      {t.amount > 0 ? "+" : ""}
                      {Number(t.amount).toLocaleString("vi-VN")}₫
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell max-w-[200px] truncate">
                      {t.description}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">
                      {Number(t.balanceAfter).toLocaleString("vi-VN")}₫
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">
                      {t.createdAt ? formatDateTime(t.createdAt) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
