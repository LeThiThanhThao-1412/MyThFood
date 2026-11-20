"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@mythfood/frontend-shared";
import { orderApi } from "@mythfood/api-client";
import AdminShell from "../../components/AdminShell";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Chờ xác nhận", cls: "bg-yellow-100 text-yellow-700" },
  CONFIRMED: { label: "Đã xác nhận", cls: "bg-blue-100 text-blue-700" },
  PREPARING: { label: "Đang chuẩn bị", cls: "bg-purple-100 text-purple-700" },
  READY_FOR_PICKUP: {
    label: "Sẵn sàng lấy",
    cls: "bg-orange-100 text-orange-700",
  },
  OUT_FOR_DELIVERY: { label: "Đang giao", cls: "bg-cyan-100 text-cyan-700" },
  DELIVERED: { label: "Đã giao", cls: "bg-green-100 text-green-700" },
  CANCELLED: { label: "Đã hủy", cls: "bg-red-100 text-red-700" },
  REJECTED: { label: "Bị từ chối", cls: "bg-gray-100 text-gray-600" },
  CANCELLED_NO_DRIVER: {
    label: "Hủy (không có tài xế)",
    cls: "bg-red-100 text-red-700",
  },
  DELIVERY_FAILED: { label: "Giao thất bại", cls: "bg-red-100 text-red-700" },
};

export default function AdminOrdersPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    load();
  }, [isAuthenticated, statusFilter]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params: any = { take: 100 };
      if (statusFilter) params.status = statusFilter;
      const [ordRes, statsRes] = await Promise.all([
        orderApi.list(params),
        (orderApi as any).getDailyStats
          ? (orderApi as any).getDailyStats()
          : Promise.resolve(null),
      ]);
      setOrders((ordRes as any).items || []);
      if (statsRes) setStats(statsRes);
    } catch {
      setError("Không thể tải đơn hàng");
    } finally {
      setLoading(false);
    }
  }

  const statusBadge = (s: string) => {
    const meta = STATUS_META[s] || { label: s, cls: "bg-gray-100" };
    return (
      <span
        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${meta.cls}`}
      >
        {meta.label}
      </span>
    );
  };

  const formatVnd = (n: number) => n.toLocaleString("vi-VN") + "₫";

  if (!isAuthenticated) return null;

  return (
    <AdminShell title="📦 Quản lý Đơn hàng">
      <div className="space-y-4">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              {
                label: "Tổng đơn",
                value: stats.summary?.totalOrders?.toLocaleString() || "0",
                color: "bg-blue-500",
              },
              {
                label: "Doanh thu",
                value: formatVnd(stats.summary?.totalRevenue || 0),
                color: "bg-green-500",
              },
              {
                label: "TB/đơn",
                value: formatVnd(stats.summary?.averageOrderValue || 0),
                color: "bg-orange-500",
              },
              {
                label: "Đơn hủy",
                value: stats.dailyStats?.[0]?.cancelledOrders || "0",
                color: "bg-red-500",
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

        {/* Filter */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-2">
          {[
            "",
            "PENDING",
            "CONFIRMED",
            "PREPARING",
            "READY_FOR_PICKUP",
            "OUT_FOR_DELIVERY",
            "DELIVERED",
            "CANCELLED",
          ].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${statusFilter === s ? "bg-[#ff6b35] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {s ? STATUS_META[s]?.label || s : "Tất cả"}
            </button>
          ))}
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
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
            📦 Chưa có đơn hàng nào
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Mã đơn
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    KH
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase hidden md:table-cell">
                    Merchant
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Tổng tiền
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Trạng thái
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase hidden lg:table-cell">
                    Ngày
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map((o: any) => (
                  <tr
                    key={o.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/orders/${o.id}`)}
                  >
                    <td className="px-4 py-3 text-sm font-mono">
                      #{o.id?.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {o.consumerId?.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">
                      {o.merchantId?.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold">
                      {o.totalAmount?.toLocaleString("vi-VN")}₫
                    </td>
                    <td className="px-4 py-3">{statusBadge(o.status)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">
                      {o.createdAt
                        ? new Date(o.createdAt).toLocaleDateString("vi-VN")
                        : "-"}
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
