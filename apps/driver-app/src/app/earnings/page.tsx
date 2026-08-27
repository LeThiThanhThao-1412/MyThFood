"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { driverApi, orderApi } from "@mythfood/api-client";
import { useAuthStore } from "@mythfood/frontend-shared";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

// Tài xế giữ 80% phí ship (20% hoa hồng nền tảng)
const DRIVER_SHARE = 0.8;

function earnOf(order: any): number {
  return Math.round(toNum(order.deliveryFee) * DRIVER_SHARE);
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

type ChartPeriod = "day" | "week" | "month";

function buildChartData(orders: any[], period: ChartPeriod) {
  const now = new Date();
  const count = period === "day" ? 14 : period === "week" ? 8 : 6;
  const buckets: {
    label: string;
    start: Date;
    end: Date;
    cod: number;
    online: number;
  }[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(now);
    let end: Date;
    if (period === "day") {
      start.setDate(start.getDate() - i);
      start.setHours(0, 0, 0, 0);
      end = new Date(start.getTime() + 86400000);
    } else if (period === "week") {
      const day = start.getDay();
      const diff = (day + 6) % 7; // Monday as start of week
      start.setDate(start.getDate() - diff - i * 7);
      start.setHours(0, 0, 0, 0);
      end = new Date(start.getTime() + 7 * 86400000);
    } else {
      start.setDate(1);
      start.setMonth(start.getMonth() - i);
      start.setHours(0, 0, 0, 0);
      end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    }
    const label =
      period === "month"
        ? `${start.getMonth() + 1}/${start.getFullYear()}`
        : `${start.getDate()}/${start.getMonth() + 1}`;
    buckets.push({ label, start, end, cod: 0, online: 0 });
  }

  for (const o of orders) {
    const d = new Date(o.createdAt);
    const earned = earnOf(o);
    const isCOD = o.paymentMethod !== "CREDIT_CARD";
    const b = buckets.find((x) => d >= x.start && d < x.end);
    if (!b) continue;
    if (isCOD) b.cod += earned;
    else b.online += earned;
  }

  return buckets.map(({ label, cod, online }) => ({ label, cod, online }));
}

export default function DriverEarningsPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const [driver, setDriver] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<ChartPeriod>("day");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    async function load() {
      try {
        const dRes = await driverApi.getByUserId(user?.id || "");
        const d = (dRes as any).data ?? dRes;
        setDriver(d);
        if (d) {
          try {
            const oRes = await orderApi.listByDriver(d.id);
            setOrders(Array.isArray(oRes) ? oRes : []);
          } catch {}
        }
      } catch {
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isAuthenticated, user, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
      </div>
    );
  }

  const deliveredOrders = orders.filter((o) => o.status === "DELIVERED");
  const totalEarnings = deliveredOrders.reduce((sum, o) => sum + earnOf(o), 0);
  const totalOrders = deliveredOrders.length;

  const todayOrders = deliveredOrders.filter((o) => isToday(o.createdAt));
  const todayEarnings = todayOrders.reduce((sum, o) => sum + earnOf(o), 0);

  const codOrders = deliveredOrders.filter(
    (o) => o.paymentMethod !== "CREDIT_CARD",
  );
  const codEarnings = codOrders.reduce((sum, o) => sum + earnOf(o), 0);
  const onlineOrders = deliveredOrders.filter(
    (o) => o.paymentMethod === "CREDIT_CARD",
  );
  const onlineEarnings = onlineOrders.reduce((sum, o) => sum + earnOf(o), 0);

  const sortedDelivered = [...deliveredOrders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const chartData = buildChartData(deliveredOrders, period);

  return (
    <div className="min-h-screen bg-[#f0f2f5] max-w-[1400px] mx-auto pb-20 lg:pb-0 w-full">
      <header className="bg-[#1a1a2e] px-4 sm:px-6 py-4 text-white">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="text-white/60 text-lg">
            ←
          </Link>
          <h1 className="text-lg font-bold">💰 Thu nhập</h1>
          <div className="w-6" />
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-5 w-full">
        {/* Summary Card */}
        <div className="bg-gradient-to-br from-[#2ecc71] to-[#27ae60] rounded-2xl p-6 text-white">
          <p className="text-sm text-white/80">Tổng thu nhập (80% phí ship)</p>
          <p className="text-3xl font-extrabold mt-1">
            {totalEarnings.toLocaleString("vi-VN")}₫
          </p>
          <div className="mt-4 pt-4 border-t border-white/20 flex justify-between">
            <div>
              <p className="text-xs text-white/60">Đơn đã giao</p>
              <p className="text-lg font-bold">{totalOrders}</p>
            </div>
            <div>
              <p className="text-xs text-white/60">TB mỗi đơn</p>
              <p className="text-lg font-bold">
                {totalOrders > 0
                  ? Math.round(totalEarnings / totalOrders).toLocaleString(
                      "vi-VN",
                    )
                  : 0}
                ₫
              </p>
            </div>
            <div>
              <p className="text-xs text-white/60">Hôm nay</p>
              <p className="text-lg font-bold">
                {todayEarnings.toLocaleString("vi-VN")}₫
              </p>
            </div>
          </div>
        </div>

        {/* Breakdown COD vs Online */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-sm font-semibold text-gray-500 mb-1">
              💵 COD (tiền mặt)
            </p>
            <p className="text-xl font-bold text-[#1a1a2e]">
              {codEarnings.toLocaleString("vi-VN")}₫
            </p>
            <p className="text-xs text-gray-400 mt-1">{codOrders.length} đơn</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-sm font-semibold text-gray-500 mb-1">
              💳 Online (thẻ)
            </p>
            <p className="text-xl font-bold text-[#1a1a2e]">
              {onlineEarnings.toLocaleString("vi-VN")}₫
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {onlineOrders.length} đơn
            </p>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-[#1a1a2e]">📊 Biểu đồ thu nhập</h3>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {(["day", "week", "month"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${period === p ? "bg-white text-[#ff6b35] shadow-sm" : "text-gray-500"}`}
                >
                  {p === "day" ? "Ngày" : p === "week" ? "Tuần" : "Tháng"}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#888" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "#888" }}
                  tickFormatter={(v: any) => `${Math.round(Number(v) / 1000)}k`}
                  width={44}
                />
                <Tooltip
                  formatter={(v: any, name: any) => [
                    `${Number(v).toLocaleString("vi-VN")}₫`,
                    name === "cod" ? "COD" : "Online",
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="cod" name="COD" stackId="a" fill="#2ecc71" />
                <Bar
                  dataKey="online"
                  name="Online"
                  stackId="a"
                  fill="#9b59b6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Delivered Orders List */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-[#1a1a2e] mb-3">Đơn đã giao</h3>
          {sortedDelivered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              Chưa có đơn nào đã giao
            </p>
          ) : (
            <div className="space-y-2">
              {sortedDelivered.map((o) => {
                const isCard = o.paymentMethod === "CREDIT_CARD";
                return (
                  <div
                    key={o.id}
                    className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">
                          #{o.id?.slice(0, 8)}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isCard ? "bg-purple-100 text-purple-700" : "bg-green-100 text-green-700"}`}
                        >
                          {isCard ? "💳 Thẻ" : "💵 COD"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {new Date(o.createdAt).toLocaleDateString("vi-VN")} ·{" "}
                        {o.deliveryAddress}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-[#ff6b35] ml-3 whitespace-nowrap">
                      +{earnOf(o).toLocaleString("vi-VN")}₫
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Link to Wallet */}
        <Link
          href="/wallet"
          className="block bg-white rounded-2xl shadow-sm p-5 hover:shadow-md transition"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-[#1a1a2e]">Ví & Rút tiền</p>
              <p className="text-sm text-gray-400 mt-0.5">
                Quản lý ví và rút thu nhập
              </p>
            </div>
            <span className="text-[#ff6b35] text-xl">→</span>
          </div>
        </Link>
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        <Link
          href="/dashboard"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">Home</span>
          <span>Home</span>
        </Link>
        <Link
          href="/orders"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">Orders</span>
          <span>Orders</span>
        </Link>
        <Link
          href="/location"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">Map</span>
          <span>Map</span>
        </Link>
        <Link
          href="/wallet"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">Wallet</span>
          <span>Wallet</span>
        </Link>
        <button
          onClick={() => {
            clearAuth();
            router.push("/");
          }}
          className="flex flex-col items-center text-[10px] text-gray-400 bg-transparent border-none font-sans cursor-pointer"
        >
          <span className="text-[22px]">Account</span>
          <span>Account</span>
        </button>
      </nav>
    </div>
  );
}
