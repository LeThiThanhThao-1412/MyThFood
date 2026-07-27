'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@mythfood/frontend-shared';
import { walletApi } from '@mythfood/api-client';
import { httpClient } from '@mythfood/api-client';

export default function AdminTransactionsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [ownerTypeFilter, setOwnerTypeFilter] = useState('');

  useEffect(() => { if (!isAuthenticated) { router.push('/login'); return; } load(); }, [isAuthenticated, typeFilter, ownerTypeFilter]);

  async function load() {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ skip: '0', take: '50' });
      if (typeFilter) params.set('type', typeFilter);
      if (ownerTypeFilter) params.set('ownerType', ownerTypeFilter);
      const res = await httpClient.get<any>(3009, `/wallets/transactions/admin?${params.toString()}`);
      setTransactions(res.items || []);
      if (res.summary) setStats(res.summary);
    } catch { setError('Không thể tải giao dịch'); } finally { setLoading(false); }
  }

  const typeBadge = (t: string) => {
    const m: Record<string, string> = {
      TOPUP: 'bg-green-100 text-green-700', WITHDRAW: 'bg-red-100 text-red-700',
      COD_SETTLEMENT: 'bg-orange-100 text-orange-700', REGULAR_SETTLEMENT: 'bg-blue-100 text-blue-700',
      REFUND: 'bg-purple-100 text-purple-700',
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${m[t] || 'bg-gray-100 text-gray-600'}`}>{t}</span>;
  };

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <header className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/')} className="text-gray-400 hover:text-gray-600">← Quay lại</button>
          <h1 className="text-xl font-bold">💰 Quản lý Giao dịch</h1>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 py-6">
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Tổng Top-up', value: (stats.totalTopupVolume / 1e6).toFixed(1) + 'trđ', color: 'bg-green-500' },
              { label: 'Tổng Withdraw', value: (stats.totalWithdrawVolume / 1e6).toFixed(1) + 'trđ', color: 'bg-red-500' },
              { label: 'Tổng COD', value: (stats.totalCodVolume / 1e6).toFixed(1) + 'trđ', color: 'bg-orange-500' },
              { label: 'Tổng Fees', value: ((stats.totalFees || 0) / 1e6).toFixed(1) + 'trđ', color: 'bg-blue-500' },
            ].map((s, i) => (
              <div key={i} className={`${s.color} text-white rounded-2xl p-5 shadow-sm`}>
                <p className="text-sm opacity-80">{s.label}</p>
                <p className="text-3xl font-extrabold mt-1">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-2">
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">Tất cả loại</option>
            <option value="TOPUP">TOPUP</option>
            <option value="WITHDRAW">WITHDRAW</option>
            <option value="COD_SETTLEMENT">COD_SETTLEMENT</option>
            <option value="REGULAR_SETTLEMENT">REGULAR_SETTLEMENT</option>
            <option value="REFUND">REFUND</option>
          </select>
          <select value={ownerTypeFilter} onChange={e => setOwnerTypeFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">Tất cả owner</option>
            <option value="DRIVER">DRIVER</option>
            <option value="MERCHANT">MERCHANT</option>
            <option value="CONSUMER">CONSUMER</option>
          </select>
        </div>

        {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm mb-4">{error}</div>}

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm p-8 space-y-3">
            {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : transactions.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">💰 Chưa có giao dịch nào</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Owner</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Loại</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Số tiền</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase hidden md:table-cell">Mô tả</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Số dư</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase hidden lg:table-cell">Ngày</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transactions.map((t: any) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      <p className="font-medium">{t.ownerName || t.ownerId?.slice(0, 8)}</p>
                      <p className="text-xs text-gray-400">{t.ownerType}</p>
                    </td>
                    <td className="px-4 py-3">{typeBadge(t.type)}</td>
                    <td className={`px-4 py-3 text-sm text-right font-semibold ${t.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {t.amount > 0 ? '+' : ''}{Number(t.amount).toLocaleString('vi-VN')}₫
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell max-w-[200px] truncate">{t.description}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">{Number(t.balanceAfter).toLocaleString('vi-VN')}₫</td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">{t.createdAt ? new Date(t.createdAt).toLocaleString('vi-VN') : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}