"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { merchantApi } from "@mythfood/api-client";
import { useAuthStore } from "@mythfood/frontend-shared";

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

export default function AdminMerchantsPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const [merchants, setMerchants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    async function load() {
      try {
        const res = await merchantApi.list({ take: 200 });
        setMerchants(res.items || []);
      } catch {
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isAuthenticated, router]);

  async function handleApprove(id: string) {
    try {
      await merchantApi.approve(id);
      setMerchants((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: "ACTIVE" } : m)),
      );
    } catch {}
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
      </div>
    );
  }

  const pending = merchants.filter(
    (m) => m.status === "INACTIVE" || m.status === "PENDING",
  );
  const active = merchants.filter((m) => m.status === "ACTIVE");

  return (
    <div className="min-h-screen bg-[#f0f2f5] max-w-[1400px] mx-auto pb-20 lg:pb-0 w-full">
      <header className="bg-[#1a1a2e] px-4 sm:px-6 py-4 text-white">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-white/60 text-lg">
            ←
          </Link>
          <h1 className="text-lg font-bold">🏪 Quản lý nhà hàng</h1>
          <div className="w-6" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-xs text-gray-400">Chờ duyệt</p>
            <p className="text-2xl font-bold text-[#e67e22]">
              {pending.length}
            </p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-xs text-gray-400">Đã kích hoạt</p>
            <p className="text-2xl font-bold text-[#2ecc71]">{active.length}</p>
          </div>
        </div>

        {/* Pending approval */}
        {pending.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-[#1a1a2e] mb-3">
              ⏳ Chờ duyệt ({pending.length})
            </h2>
            <div className="space-y-3">
              {pending.map((m: any) => (
                <div key={m.id} className="bg-white rounded-2xl shadow-sm p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-800">{m.name}</p>
                      <p className="text-xs text-gray-400">
                        {m.email} · {m.phone}
                      </p>
                    </div>
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2.5 py-1 rounded-full font-semibold">
                      ⏳ Chờ duyệt
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">📍 {m.address}</p>
                  <button
                    onClick={() => handleApprove(m.id)}
                    className="w-full bg-[#2ecc71] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-green-600 transition"
                  >
                    ✅ Phê duyệt
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active merchants */}
        <div>
          <h2 className="text-lg font-bold text-[#1a1a2e] mb-3">
            ✅ Đã kích hoạt ({active.length})
          </h2>
          <div className="space-y-2">
            {active.map((m: any) => (
              <div
                key={m.id}
                className="bg-white rounded-2xl shadow-sm p-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    {m.name}
                  </p>
                  <p className="text-xs text-gray-400">{m.address}</p>
                </div>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">
                  ✓ Active
                </span>
              </div>
            ))}
            {active.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">
                Chưa có nhà hàng nào được kích hoạt
              </p>
            )}
          </div>
        </div>
      </main>

      {/* Mobile Nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        <Link
          href="/"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">📊</span>
          <span>Dashboard</span>
        </Link>
        <Link
          href="/merchants"
          className="flex flex-col items-center text-[10px] text-[#ff6b35] no-underline"
        >
          <span className="text-[22px]">🏪</span>
          <span>Merchants</span>
        </Link>
        <Link
          href="/orders"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">📋</span>
          <span>Orders</span>
        </Link>
        <Link
          href="/transactions"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">💰</span>
          <span>Tx</span>
        </Link>
        <Link
          href="/users"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">👥</span>
          <span>Users</span>
        </Link>
      </nav>
    </div>
  );
}
