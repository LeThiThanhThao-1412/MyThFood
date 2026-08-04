'use client';
import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { authApi, merchantApi } from '@mythfood/api-client';
import { useAuth } from '@mythfood/frontend-shared';

const MerchantMap = dynamic(
  () => import('@mythfood/frontend-shared/components/MapView'),
  { ssr: false },
);

interface Suggestion {
  display_name: string;
  lat: string;
  lon: string;
}

export default function MerchantRegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [step, setStep] = useState<'account' | 'merchant' | 'done'>('account');
  const [account, setAccount] = useState({ phone: '', name: '', email: '', password: '' });
  const [merchant, setMerchant] = useState({ name: '', phone: '', address: '', description: '', latitude: 10.775, longitude: 106.7 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState('');

  // Location search state
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionRef = useRef<HTMLDivElement | null>(null);

  const fetchSuggestions = useCallback((query: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (query.length < 3) { setSuggestions([]); setShowSuggestions(false); return; }
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1&countrycodes=VN`,
        );
        const data = await res.json();
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch { setSuggestions([]); }
    }, 400);
  }, []);

  function selectSuggestion(s: Suggestion) {
    const newLat = parseFloat(s.lat);
    const newLng = parseFloat(s.lon);
    setMerchant({ ...merchant, latitude: newLat, longitude: newLng, address: s.display_name });
    setSearch(s.display_name);
    setShowSuggestions(false);
  }

  // Step 1: Create account
  async function createAccount(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await authApi.register({
        phoneNumber: account.phone, fullName: account.name,
        email: account.email, password: account.password,
        roles: ['MERCHANT_OWNER'],
      });
      const data = (res as any).data;
      const uid = data?.id || data?.user?.id || '';
      if (!uid) throw new Error('Không lấy được user ID');
      setUserId(uid);
      await login({ phoneNumber: account.phone, password: account.password });
      setStep('merchant');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Đăng ký thất bại');
    } finally { setLoading(false); }
  }

  // Step 2: Create merchant
  async function createMerchant(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await (merchantApi as any).create({
        userId, name: merchant.name, phone: merchant.phone,
        address: merchant.address, description: merchant.description,
        latitude: merchant.latitude, longitude: merchant.longitude,
      });
      setStep('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Tạo nhà hàng thất bại');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        {/* Step 1: Account */}
        {step === 'account' && (
          <>
            <h1 className="text-2xl font-bold text-blue-600 text-center mb-2">🏪 Đăng ký nhà hàng</h1>
            <p className="text-gray-500 text-center mb-6">Bước 1/2: Tạo tài khoản</p>
            <form onSubmit={createAccount} className="space-y-4">
              {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Họ tên chủ quán</label>
                <input value={account.name} onChange={e=>setAccount({...account,name:e.target.value})} placeholder="Nguyễn Văn A" className="w-full rounded-lg border px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại</label>
                <input value={account.phone} onChange={e=>setAccount({...account,phone:e.target.value})} placeholder="+84901234567" className="w-full rounded-lg border px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input value={account.email} onChange={e=>setAccount({...account,email:e.target.value})} placeholder="email@example.com" type="email" className="w-full rounded-lg border px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
                <input type="password" value={account.password} onChange={e=>setAccount({...account,password:e.target.value})} placeholder="Ít nhất 6 ký tự" className="w-full rounded-lg border px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none" required minLength={6} />
              </div>
              <button disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
                {loading ? 'Đang xử lý...' : 'Tiếp tục →'}
              </button>
              <p className="text-center text-sm text-gray-500">Đã có tài khoản? <a href="/login" className="text-blue-500">Đăng nhập</a></p>
            </form>
          </>
        )}

        {/* Step 2: Merchant info */}
        {step === 'merchant' && (
          <>
            <h1 className="text-2xl font-bold text-blue-600 text-center mb-2">🏪 Thông tin nhà hàng</h1>
            <p className="text-gray-500 text-center mb-6">Bước 2/2: Đăng ký nhà hàng</p>
            <form onSubmit={createMerchant} className="space-y-4">
              {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên nhà hàng</label>
                <input value={merchant.name} onChange={e=>setMerchant({...merchant,name:e.target.value})} placeholder="Phở 24" className="w-full rounded-lg border px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SĐT nhà hàng</label>
                <input value={merchant.phone} onChange={e=>setMerchant({...merchant,phone:e.target.value})} placeholder="02838231234" className="w-full rounded-lg border px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none" required />
              </div>

              {/* Location Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">📍 Vị trí nhà hàng trên bản đồ</label>
                <p className="text-xs text-gray-400 mb-2">Tìm địa chỉ hoặc kéo thả điểm trên bản đồ để chọn vị trí chính xác</p>
                
                {/* Search bar */}
                <div className="relative mb-2" ref={suggestionRef}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                    <input
                      type="text"
                      value={search}
                      onChange={e => { setSearch(e.target.value); fetchSuggestions(e.target.value); }}
                      placeholder="Tìm địa chỉ nhà hàng..."
                      className="w-full rounded-lg border pl-9 pr-9 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                    />
                    {search && (
                      <button type="button" onClick={() => { setSearch(''); setSuggestions([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">✕</button>
                    )}
                  </div>
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white rounded-xl shadow-lg border border-gray-100 max-h-48 overflow-y-auto">
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => selectSuggestion(s)}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0 transition"
                        >
                          <p className="text-gray-800 line-clamp-2">{s.display_name}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Map */}
                <div className="rounded-xl overflow-hidden border border-gray-200">
                  <MerchantMap
                    locations={[{ latitude: merchant.latitude, longitude: merchant.longitude, label: '🏪 Nhà hàng của bạn' }]}
                    interactive
                    height="260px"
                    onLocationSelect={(newLat, newLng) => setMerchant({ ...merchant, latitude: newLat, longitude: newLng })}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  📍 {merchant.latitude.toFixed(5)}, {merchant.longitude.toFixed(5)} — Kéo thả điểm trên bản đồ để chọn vị trí
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ</label>
                <input value={merchant.address} onChange={e=>setMerchant({...merchant,address:e.target.value})} placeholder="123 Lê Lợi, Q.1, TP.HCM" className="w-full rounded-lg border px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                <textarea value={merchant.description} onChange={e=>setMerchant({...merchant,description:e.target.value})} placeholder="Mô tả về nhà hàng của bạn" className="w-full rounded-lg border px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none" rows={3} />
              </div>
              <button disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
                {loading ? 'Đang xử lý...' : 'Đăng ký nhà hàng'}
              </button>
            </form>
          </>
        )}

        {/* Step 3: Done */}
        {step === 'done' && (
          <div className="text-center py-8">
            <p className="text-5xl mb-4">🎉</p>
            <h2 className="text-xl font-bold text-green-600 mb-2">Đăng ký thành công!</h2>
            <p className="text-gray-500 mb-4">Nhà hàng của bạn đang chờ Admin duyệt.</p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 text-sm text-yellow-800">
              <p className="font-medium mb-1">⏳ Trạng thái: PENDING</p>
              <p>Admin sẽ duyệt nhà hàng của bạn trong vòng 24-48h. Bạn có thể đăng nhập để theo dõi trạng thái.</p>
            </div>
            <button onClick={()=>router.push('/dashboard')} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition">
              Về Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}