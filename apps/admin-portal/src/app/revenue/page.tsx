"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { orderApi, paymentApi, walletApi } from "@mythfood/api-client";
import { useAuthStore } from "@mythfood/frontend-shared";
import { formatVnd, toNum } from "../../lib/format";

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
  const maxDayRevenue = Math.max(
    1,
    ...daily.map((d: any) => toNum(d.totalRevenue)),
  );

  const balanceByType = walletStats?.balanceByType || {};

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <header className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-400 hover:text-gray-600">
            ← Quay lại
          </Link>
          <h1 className="text-xl font-bold">📈 Quản lý Doanh thu</h1>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
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

            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="font-bold text-lg mb-4">📊 Doanh thu theo ngày</h2>
              {daily.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">
                  Chưa có dữ liệu
                </p>
              ) : (
                <div className="flex items-end gap-2 h-56">
                  {daily.slice(-14).map((d: any, i: number) => {
                    const h = Math.round(
                      (toNum(d.totalRevenue) / maxDayRevenue) * 100,
                    );
                    return (
                      <div
                        key={i}
                        className="flex-1 flex flex-col items-center gap-1 min-w-0"
                      >
                        <span className="text-[10px] text-gray-400 truncate w-full text-center">
                          {formatVnd(toNum(d.totalRevenue))}
                        </span>
                        <div
                          className="w-full bg-gradient-to-t from-[#ff6b35] to-[#ff8f65] rounded-t-lg"
                          style={{ height: `${Math.max(h, 4)}%` }}
                        />
                        <span className="text-[10px] text-gray-500 truncate w-full text-center">
                          {(d.date || "").slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="font-bold text-lg mb-4">
                💼 Cơ cấu doanh thu (70/20/10)
              </h2>
              <div className="grid grid-cols-3 gap-3 text-center">
                <Split
                  label="Nhà hàng (70%)"
                  value={toNum(summary.totalRevenue) * 0.7}
                  color="bg-blue-500"
                />
                <Split
                  label="Tài xế (20%)"
                  value={toNum(summary.totalRevenue) * 0.2}
                  color="bg-green-500"
                />
                <Split
                  label="Nền tảng (10%)"
                  value={toNum(summary.totalRevenue) * 0.1}
                  color="bg-[#ff6b35]"
                />
              </div>
              <p className="text-xs text-gray-400 mt-4">
                * Ước tính theo tổng doanh thu đơn đã giao. Giá trị quyết toán
                thực tế xem tại trang Quyết toán.
              </p>
            </div>

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
    </div>
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

function Split({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <div className={`h-2 rounded-full ${color} mb-2`} />
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-800">{formatVnd(value)}</p>
    </div>
  );
}
