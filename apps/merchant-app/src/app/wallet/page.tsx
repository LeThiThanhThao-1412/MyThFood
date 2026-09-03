"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@mythfood/frontend-shared";
import TopNav from "@/components/TopNav";
import { merchantApi, orderApi, walletApi } from "@mythfood/api-client";

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

export default function MerchantWalletPage() {
  const router = useRouter();
  const { isAuthenticated, clearAuth, user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [merchant, setMerchant] = useState<any>(null);

  // Real wallet data
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletTx, setWalletTx] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawStatus, setWithdrawStatus] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    async function load() {
      try {
        // Find merchant
        const res = await merchantApi.list({ take: 200 });
        const m = (res.items || []).find((m2: any) => m2.userId === user?.id);
        setMerchant(m);

        if (m?.id) {
          // Load wallet from backend
          try {
            const wallet = await walletApi.getWallet(m.id, "MERCHANT");
            setWalletBalance(wallet.balance);
            setWalletTx(wallet.transactions || []);
          } catch {
            /* wallet service may not be running */
          }

          // Load orders for revenue calculation
          try {
            const oRes = await orderApi.listByMerchant(m.id);
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

  const merchantId = merchant?.id || user?.id || "";
  const deliveredOrders = orders.filter((o) => o.status === "DELIVERED");
  const todayRevenue = deliveredOrders.reduce((sum, o) => {
    const foodTotal =
      o.items?.reduce(
        (s: number, i: any) => s + toNum(i.unitPrice) * (i.quantity || 1),
        0,
      ) || 0;
    return sum + Math.round(foodTotal * 0.75); // 70% (thuế 10% & nền tảng 20% đã tách riêng)
  }, 0);

  return (
    <div className="min-h-screen bg-[#f0f2f5] max-w-[1400px] mx-auto pb-20 lg:pb-0">
      <TopNav />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <h1 className="text-2xl font-extrabold text-[#1a1a2e] mb-4">
          💰 Ví doanh thu
        </h1>
        {/* Balance Card */}
        <div className="bg-gradient-to-br from-[#ff6b35] to-[#ff8f65] rounded-2xl p-6 text-white">
          <p className="text-sm text-white/80">Số dư ví doanh thu</p>
          <p className="text-3xl font-extrabold mt-1">
            {walletBalance.toLocaleString("vi-VN")}₫
          </p>
          <div className="mt-4 pt-4 border-t border-white/20">
            <p className="text-xs text-white/60">Doanh thu hôm nay</p>
            <p className="text-lg font-bold">
              +{todayRevenue.toLocaleString("vi-VN")}₫
            </p>
          </div>
        </div>

        {/* Settlement Formula */}
        <div className="bg-[#f8fafb] rounded-2xl p-4 border border-gray-200 text-sm text-gray-600">
          <p className="font-semibold text-[#1a1a2e] mb-2">
            📊 Cách tính tiền về ví:
          </p>
          <div className="space-y-1.5">
            <p>
              🏪 <strong>Nhà hàng nhận:</strong> 75% tiền món (sau chiết khấu
              25%)
            </p>
            <p className="text-xs text-gray-400 ml-4">
              VD: Món 100k → Nhận 75k
            </p>
            <p>
              🏢 <strong>Nền tảng:</strong> 25% tiền món + 20% phí ship
            </p>
          </div>
        </div>

        {/* Withdraw */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-[#1a1a2e] mb-3">🏦 Rút tiền</h3>
          <p className="text-xs text-gray-400 mb-3">
            Số dư tối thiểu để rút: 100.000đ
          </p>
          <div className="flex gap-2 mb-2">
            <input
              type="number"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="Tối thiểu 100.000đ"
              className="flex-1 bg-gray-50 rounded-xl px-4 py-3 text-sm border outline-none focus:border-[#ff6b35]"
            />
            <button
              onClick={async () => {
                const amt = Number(withdrawAmount);
                if (!amt || amt < 100000) {
                  setWithdrawStatus("❌ Tối thiểu 100.000đ");
                  return;
                }
                try {
                  const result = await walletApi.withdraw(
                    merchantId,
                    "MERCHANT",
                    amt,
                  );
                  setWalletBalance(result.balance);
                  setWithdrawStatus(
                    `✅ Yêu cầu rút ${amt.toLocaleString("vi-VN")}đ đã gửi (24-48h)`,
                  );
                  setWithdrawAmount("");
                } catch (err: any) {
                  setWithdrawStatus("❌ " + (err.message || "Lỗi rút tiền"));
                }
              }}
              className="bg-[#ff6b35] text-white px-5 py-3 rounded-xl font-semibold text-sm hover:bg-orange-600 transition whitespace-nowrap"
            >
              Rút tiền
            </button>
          </div>
          {withdrawStatus && (
            <p
              className={`text-sm font-medium ${withdrawStatus.startsWith("✅") ? "text-green-600" : "text-red-500"}`}
            >
              {withdrawStatus}
            </p>
          )}
        </div>

        {/* Transaction History */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-[#1a1a2e] mb-3">
            📋 Lịch sử giao dịch (ví)
          </h3>
          <div className="space-y-2">
            {walletTx.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">
                Chưa có giao dịch
              </p>
            )}
            {walletTx.map((tx: any) => (
              <div
                key={tx.id}
                className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-medium ${tx.type === "CREDIT" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}
                    >
                      {tx.type === "CREDIT" ? "NHẬN" : "RÚT"}
                    </span>
                    <span className="text-sm text-gray-700 truncate">
                      {tx.description}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(tx.createdAt).toLocaleString("vi-VN")}
                  </p>
                </div>
                <span
                  className={`text-sm font-semibold ml-3 ${tx.type === "CREDIT" ? "text-green-600" : "text-red-500"}`}
                >
                  {tx.type === "CREDIT" ? "+" : "-"}
                  {tx.amount?.toLocaleString("vi-VN")}₫
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Order Revenue History */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-[#1a1a2e] mb-3">📦 Đơn đã giao</h3>
          <div className="space-y-2">
            {deliveredOrders.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">
                Chưa có đơn nào
              </p>
            )}
            {deliveredOrders.slice(0, 10).map((o: any) => {
              const foodTotal =
                o.items?.reduce(
                  (s: number, i: any) =>
                    s + toNum(i.unitPrice) * (i.quantity || 1),
                  0,
                ) || 0;
              const revenue = Math.round(foodTotal * 0.75);
              return (
                <div
                  key={o.id}
                  className="flex justify-between text-sm py-2 border-b border-gray-50"
                >
                  <span className="text-gray-700">#{o.id?.slice(0, 8)}</span>
                  <span className="text-green-600 font-semibold">
                    +{revenue.toLocaleString("vi-VN")}₫
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
