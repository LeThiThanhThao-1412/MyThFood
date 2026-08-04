'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { merchantApi } from '@mythfood/api-client';
import { useAuthStore } from '@mythfood/frontend-shared';

export default function SettingsPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const [merchant, setMerchant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  // Operating hours
  const [hours, setHours] = useState<any[]>([
    { dayOfWeek: 0, openTime: '08:00', closeTime: '22:00', label: 'CN' },
    { dayOfWeek: 1, openTime: '08:00', closeTime: '22:00', label: 'T2' },
    { dayOfWeek: 2, openTime: '08:00', closeTime: '22:00', label: 'T3' },
    { dayOfWeek: 3, openTime: '08:00', closeTime: '22:00', label: 'T4' },
    { dayOfWeek: 4, openTime: '08:00', closeTime: '22:00', label: 'T5' },
    { dayOfWeek: 5, openTime: '08:00', closeTime: '22:00', label: 'T6' },
    { dayOfWeek: 6, openTime: '08:00', closeTime: '22:00', label: 'T7' },
  ]);

  // Capacity
  const [capacity, setCapacity] = useState({ maxConcurrentOrders: 20, averagePreparationMinutes: 15 });

  // COD settings
  const [acceptsCod, setAcceptsCod] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    async function load() {
      try {
        const res = await merchantApi.list({ take: 200 });
        const m = (res.items || []).find((m2: any) => m2.userId === user?.id);
        setMerchant(m);
        if (m) {
          // Load COD setting from localStorage
          const codSetting = localStorage.getItem(`merchant_${m.id}_acceptsCod`);
          if (codSetting !== null) {
            setAcceptsCod(codSetting === 'true');
          }
          try {
            const h = await (merchantApi as any).getOperatingHours(m.id);
            if (Array.isArray(h) && h.length > 0) {
              setHours(h.map((hh: any) => ({ ...hh, label: ['CN','T2','T3','T4','T5','T6','T7'][hh.dayOfWeek] })));
            }
          } catch {}
          try {
            const c = await (merchantApi as any).getCapacity(m.id);
            if (c) setCapacity({ maxConcurrentOrders: c.maxConcurrentOrders || 20, averagePreparationMinutes: c.averagePreparationMinutes || 15 });
          } catch {}
        }
      } catch {} finally { setLoading(false); }
    }
    load();
  }, [isAuthenticated, user, router]);

  async function saveHours() {
    if (!merchant) return;
    setSaving(true); setStatus('');
    try {
      await (merchantApi as any).setOperatingHours(merchant.id, { hours: hours.map((h: any) => ({ dayOfWeek: h.dayOfWeek, openTime: h.openTime, closeTime: h.closeTime })) });
      setStatus('✅ Đã lưu giờ hoạt động');
    } catch { setStatus('❌ Lỗi lưu giờ hoạt động'); } finally { setSaving(false); }
  }

  async function saveCapacity() {
    if (!merchant) return;
    setSaving(true); setStatus('');
    try {
      await (merchantApi as any).updateCapacity(merchant.id, { maxConcurrentOrders: Number(capacity.maxConcurrentOrders), averagePreparationMinutes: Number(capacity.averagePreparationMinutes) });
      setStatus('✅ Đã lưu sức chứa');
    } catch { setStatus('❌ Lỗi lưu sức chứa'); } finally { setSaving(false); }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full" /></div>;
  if (!merchant) return null;

  return (
    <div className="min-h-screen bg-[#f0f2f5] max-w-[1400px] mx-auto pb-20 lg:pb-0">
      <header className="bg-[#1a1a2e] px-4 sm:px-6 py-4 text-white">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="text-white/60 text-lg">←</Link>
          <h1 className="text-lg font-bold">⚙️ Cài đặt nhà hàng</h1>
          <div className="w-6" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {status && <div className={`p-4 rounded-xl text-sm font-medium ${status.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{status}</div>}

        {/* Operating Hours */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-lg mb-4">🕐 Giờ hoạt động</h3>
          <div className="space-y-2">
            {hours.map((h, i) => (
              <div key={h.dayOfWeek} className="flex items-center gap-3 py-2">
                <span className="w-10 text-sm font-semibold text-gray-600">{h.label}</span>
                <input type="time" value={h.openTime} onChange={e => {
                  const nh = [...hours]; nh[i] = { ...nh[i], openTime: e.target.value }; setHours(nh);
                }} className="border rounded-lg px-3 py-2 text-sm w-32" />
                <span className="text-gray-400">đến</span>
                <input type="time" value={h.closeTime} onChange={e => {
                  const nh = [...hours]; nh[i] = { ...nh[i], closeTime: e.target.value }; setHours(nh);
                }} className="border rounded-lg px-3 py-2 text-sm w-32" />
              </div>
            ))}
          </div>
          <button onClick={saveHours} disabled={saving} className="mt-4 bg-[#ff6b35] text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-orange-600 disabled:opacity-50">
            {saving ? 'Đang lưu...' : 'Lưu giờ hoạt động'}
          </button>
        </div>

        {/* Capacity */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-lg mb-4">📊 Sức chứa & Chuẩn bị</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số đơn tối đa cùng lúc</label>
              <input type="number" value={capacity.maxConcurrentOrders} onChange={e => setCapacity({...capacity, maxConcurrentOrders: Number(e.target.value)})}
                className="w-full border rounded-lg px-3 py-2 text-sm" min={1} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Thời gian chuẩn bị TB (phút)</label>
              <input type="number" value={capacity.averagePreparationMinutes} onChange={e => setCapacity({...capacity, averagePreparationMinutes: Number(e.target.value)})}
                className="w-full border rounded-lg px-3 py-2 text-sm" min={5} />
            </div>
          </div>
          <button onClick={saveCapacity} disabled={saving} className="mt-4 bg-[#ff6b35] text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-orange-600 disabled:opacity-50">
            {saving ? 'Đang lưu...' : 'Lưu sức chứa'}
          </button>
        </div>

        {/* COD Settings */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-lg mb-4">💵 Cài đặt thanh toán COD</h3>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div>
              <p className="font-semibold text-gray-800">Nhận đơn COD</p>
              <p className="text-sm text-gray-500 mt-0.5">
                {acceptsCod
                  ? 'Khách hàng có thể chọn thanh toán khi nhận hàng'
                  : 'Chỉ chấp nhận thanh toán qua thẻ'}
              </p>
            </div>
            <button
              onClick={() => {
                const newValue = !acceptsCod;
                setAcceptsCod(newValue);
                if (merchant) {
                  localStorage.setItem(`merchant_${merchant.id}_acceptsCod`, String(newValue));
                }
                setStatus(`✅ Đã ${newValue ? 'bật' : 'tắt'} nhận đơn COD`);
              }}
              className={`relative w-14 h-7 rounded-full transition-colors duration-200 ${
                acceptsCod ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform duration-200 ${
                  acceptsCod ? 'translate-x-7' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <div className="mt-3 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
            <p className="font-semibold mb-1">ℹ️ Lưu ý về COD:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Tài xế cần số dư ví ≥ 2.000.000₫ để nhận đơn COD</li>
              <li>Tiền món sẽ được giữ trong ví tài xế đến khi giao thành công</li>
              <li>Nếu tắt COD, khách chỉ có thể thanh toán qua thẻ</li>
            </ul>
          </div>
        </div>
      </main>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        <Link href="/dashboard" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">🏠</span><span>Trang chủ</span></Link>
        <Link href="/orders" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">📦</span><span>Đơn hàng</span></Link>
        <Link href="/menu" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">📋</span><span>Menu</span></Link>
        <Link href="/wallet" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">💰</span><span>Ví</span></Link>
        <button onClick={() => { clearAuth(); router.push('/'); }} className="flex flex-col items-center text-[10px] text-gray-400 bg-transparent border-none font-sans cursor-pointer"><span className="text-[22px]">👤</span><span>Tài khoản</span></button>
      </nav>
    </div>
  );
}