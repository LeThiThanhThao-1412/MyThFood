'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { driverApi, orderApi } from '@mythfood/api-client';
import { useAuthStore } from '@mythfood/frontend-shared';

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

export default function DriverEarningsPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const [driver, setDriver] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    async function load() {
      try {
        const dRes = await driverApi.getByUserId(user?.id || '');
        const d = (dRes as any).data ?? dRes;
        setDriver(d);
        if (d) {
          try {
            const oRes = await orderApi.listByDriver(d.id);
            setOrders(Array.isArray(oRes) ? oRes : []);
          } catch {}
        }
      } catch {} finally { setLoading(false); }
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

  const deliveredOrders = orders.filter(o => o.status === 'DELIVERED');
  const totalEarnings = deliveredOrders.reduce((sum, o) => sum + toNum(o.deliveryFee || 0), 0);
  const totalOrders = deliveredOrders.length;

  return (
    <div className="min-h-screen bg-[#f0f2f5] max-w-[1400px] mx-auto pb-20 lg:pb-0 w-full">
      <header className="bg-[#1a1a2e] px-4 sm:px-6 py-4 text-white">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="text-white/60 text-lg">←</Link>
          <h1 className="text-lg font-bold">Earnings</h1>
          <div className="w-6" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5 w-full">
        {/* Summary Card */}
        <div className="bg-gradient-to-br from-[#2ecc71] to-[#27ae60] rounded-2xl p-6 text-white">
          <p className="text-sm text-white/80">Total Earnings</p>
          <p className="text-3xl font-extrabold mt-1">{totalEarnings.toLocaleString('vi-VN')} VND</p>
          <div className="mt-4 pt-4 border-t border-white/20 flex justify-between">
            <div><p className="text-xs text-white/60">Delivered</p><p className="text-lg font-bold">{totalOrders}</p></div>
            <div><p className="text-xs text-white/60">Per Order Avg</p><p className="text-lg font-bold">{totalOrders > 0 ? Math.round(totalEarnings / totalOrders).toLocaleString('vi-VN') : 0} VND</p></div>
          </div>
        </div>

        {/* Delivered Orders List */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-[#1a1a2e] mb-3">Completed Deliveries</h3>
          {deliveredOrders.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No completed deliveries yet</p>
          ) : (
            <div className="space-y-2">
              {deliveredOrders.map(o => (
                <div key={o.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">#{o.id?.slice(0, 8)}</span>
                      <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">DONE</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{o.deliveryAddress}</p>
                  </div>
                  <span className="text-sm font-bold text-[#ff6b35] ml-3 whitespace-nowrap">
                    {toNum(o.deliveryFee || 15000).toLocaleString('vi-VN')} VND
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Link to Wallet */}
        <Link href="/wallet" className="block bg-white rounded-2xl shadow-sm p-5 hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-[#1a1a2e]">Wallet & Withdraw</p>
              <p className="text-sm text-gray-400 mt-0.5">Manage your wallet and withdraw earnings</p>
            </div>
            <span className="text-[#ff6b35] text-xl">→</span>
          </div>
        </Link>
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        <Link href="/dashboard" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">Home</span><span>Home</span></Link>
        <Link href="/orders" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">Orders</span><span>Orders</span></Link>
        <Link href="/location" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">Map</span><span>Map</span></Link>
        <Link href="/wallet" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">Wallet</span><span>Wallet</span></Link>
        <button onClick={() => { clearAuth(); router.push('/'); }} className="flex flex-col items-center text-[10px] text-gray-400 bg-transparent border-none font-sans cursor-pointer"><span className="text-[22px]">Account</span><span>Account</span></button>
      </nav>
    </div>
  );
}