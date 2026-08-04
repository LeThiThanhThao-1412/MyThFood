'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { driverApi, orderApi, walletApi, dispatchApi } from '@mythfood/api-client';
import { useAuthStore } from '@mythfood/frontend-shared';

const MIN_COD_BALANCE = 2_000_000;

const DriverMap = dynamic(
  () => import('@mythfood/frontend-shared/components/MapView'),
  { ssr: false },
);

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

interface Suggestion {
  display_name: string;
  lat: string;
  lon: string;
}

export default function DriverLocationPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const [driver, setDriver] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lat, setLat] = useState(10.775);
  const [lng, setLng] = useState(106.7);
  const [updating, setUpdating] = useState(false);
  const [status, setStatus] = useState('');
  const [nearbyOrders, setNearbyOrders] = useState<any[]>([]);
  const [showMechanism, setShowMechanism] = useState(false);

  // Online/Offline toggle
  const [togglingOnline, setTogglingOnline] = useState(false);

  // COD eligibility
  const [codBalance, setCodBalance] = useState(0);
  const [codEligible, setCodEligible] = useState(false);

  // Active dispatch
  const [activeDispatch, setActiveDispatch] = useState<any>(null);
  const [dispatchLoading, setDispatchLoading] = useState(false);

  // Search state
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionRef = useRef<HTMLDivElement | null>(null);

  const isOnline = driver?.onlineStatus === 'ONLINE';

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    async function load() {
      try {
        const dRes = await driverApi.getByUserId(user?.id || '');
        const d = (dRes as any).data ?? dRes;
        setDriver(d);
        if (d?.latitude) setLat(d.latitude);
        if (d?.longitude) setLng(d.longitude);

        // Load COD eligibility
        try {
          const codCheck = await walletApi.checkCodEligibility(d.id);
          setCodBalance(codCheck.balance);
          setCodEligible(codCheck.eligible);
        } catch {}

        // Load nearby orders
        try {
          const availRes = await orderApi.list({ status: 'READY_FOR_PICKUP', take: 10 });
          const items = (availRes as any).items || [];
          setNearbyOrders(Array.isArray(items) ? items : []);
        } catch {}

        // Load active dispatch
        try {
          const dispatches = await dispatchApi.getByDriver(d.id);
          const active = Array.isArray(dispatches)
            ? dispatches.find((dp: any) => ['DRIVER_ASSIGNED', 'DRIVER_ACCEPTED', 'DRIVER_ARRIVED', 'PICKED_UP', 'DELIVERING'].includes(dp.status))
            : null;
          setActiveDispatch(active || null);
        } catch {}
      } catch {} finally { setLoading(false); }
    }
    load();
  }, [isAuthenticated, user, router]);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (suggestionRef.current && !suggestionRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

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

  function handleSearchChange(value: string) {
    setSearch(value);
    fetchSuggestions(value);
  }

  function selectSuggestion(s: Suggestion) {
    const newLat = parseFloat(s.lat);
    const newLng = parseFloat(s.lon);
    setLat(newLat);
    setLng(newLng);
    setSearch(s.display_name);
    setShowSuggestions(false);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setStatus('Trình duyệt không hỗ trợ GPS');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setStatus('✅ Đã lấy vị trí hiện tại');
      },
      () => setStatus('❌ Không thể lấy vị trí'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function updateLocation() {
    if (!driver?.id) return;
    setUpdating(true);
    setStatus('');
    try {
      await driverApi.updateLocation(driver.id, { latitude: lat, longitude: lng });
      setStatus('✅ Cập nhật vị trí thành công!');
      // Reload nearby orders after update
      try {
        const availRes = await orderApi.list({ status: 'READY_FOR_PICKUP', take: 10 });
        const items = (availRes as any).items || [];
        setNearbyOrders(Array.isArray(items) ? items : []);
      } catch {}
      // Reload COD
      try {
        const codCheck = await walletApi.checkCodEligibility(driver.id);
        setCodBalance(codCheck.balance);
        setCodEligible(codCheck.eligible);
      } catch {}
    } catch (err: any) {
      setStatus('❌ ' + (err.message || 'Lỗi cập nhật'));
    } finally { setUpdating(false); }
  }

  async function toggleOnline() {
    if (!driver?.id || togglingOnline) return;
    setTogglingOnline(true);
    try {
      if (isOnline) {
        const res = await driverApi.goOffline(driver.id);
        setDriver((res as any).data ?? res);
      } else {
        // Check COD eligibility before going online
        const res = await driverApi.goOnline(driver.id);
        setDriver((res as any).data ?? res);
      }
    } catch (err: any) {
      setStatus('❌ ' + (err.message || 'Lỗi chuyển trạng thái'));
    } finally { setTogglingOnline(false); }
  }

  async function acceptDispatch(orderId: string) {
    if (!driver?.id || dispatchLoading) return;
    setDispatchLoading(true);
    try {
      // Create dispatch = driver accepts
      await dispatchApi.create({ orderId });
      setStatus('✅ Đã nhận đơn #' + orderId.slice(0, 8));
      // Remove from nearby list
      setNearbyOrders(prev => prev.filter(o => o.id !== orderId));
    } catch (err: any) {
      setStatus('❌ ' + (err.message || 'Lỗi nhận đơn'));
    } finally { setDispatchLoading(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
      </div>
    );
  }

  const driverId = driver?.id || '';

  return (
    <div className="min-h-screen bg-[#f0f2f5] max-w-[1400px] mx-auto pb-20 lg:pb-0 w-full">
      {/* Header */}
      <header className="bg-[#1a1a2e] px-4 sm:px-6 py-3 text-white">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="text-white/60 text-lg">←</Link>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold">🗺️ Bản đồ</h1>
            {/* COD badge */}
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${codEligible ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
              {codEligible ? '✅ COD' : `⚠️ Thiếu ${(MIN_COD_BALANCE - codBalance).toLocaleString('vi-VN')}đ`}
            </span>
            {/* Online/Offline toggle */}
            <button
              onClick={toggleOnline}
              disabled={togglingOnline}
              className={`px-3 py-1 rounded-full text-xs font-bold transition ${isOnline ? 'bg-green-500 text-white' : 'bg-gray-600 text-gray-300'}`}
            >
              {togglingOnline ? '...' : isOnline ? '🟢 ONLINE' : '⚫ OFFLINE'}
            </button>
          </div>
          {/* Info icon */}
          <button onClick={() => setShowMechanism(!showMechanism)} className="text-white/60 w-6 text-center text-lg" title="Dispatch Info">ℹ️</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-4 space-y-4 w-full">
        {/* Search Input */}
        <div className="relative" ref={suggestionRef}>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Tìm địa chỉ..."
              className="w-full bg-white rounded-xl pl-11 pr-10 py-3 text-sm border border-gray-200 shadow-sm focus:border-[#ff6b35] focus:ring-2 focus:ring-orange-200 outline-none transition"
            />
            {search && (
              <button onClick={() => { setSearch(''); setSuggestions([]); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">✕</button>
            )}
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white rounded-2xl shadow-lg border border-gray-100 max-h-60 overflow-y-auto">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectSuggestion(s)}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-orange-50 border-b border-gray-50 last:border-0 transition"
                >
                  <p className="text-gray-800 line-clamp-2">{s.display_name}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Dispatch Info Panel (collapsed by default) */}
        {showMechanism && (
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3 text-sm text-gray-600">
            <div className="bg-[#fff7ed] rounded-xl p-3 border border-orange-100">
              <p className="font-semibold text-[#ff6b35] mb-2">🔄 Cách dispatch tìm tài xế:</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Khoảng cách tài xế → nhà hàng</li>
                <li>Tài xế ONLINE, không BUSY</li>
                <li>Đơn COD: ví ≥ 2.000.000đ</li>
                <li>Độ mệt mỏi (fatigue level)</li>
              </ol>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
              <p className="font-semibold text-blue-700 mb-1">📋 Quy trình:</p>
              <p className="text-xs">Đơn READY_FOR_PICKUP → Tính khoảng cách → Lọc tài xế gần nhất → Gán đơn → Tài xế nhận thông báo</p>
            </div>
          </div>
        )}

        {/* Quick actions + Info */}
        <div className="flex gap-2">
          <button onClick={useCurrentLocation} className="flex-1 bg-white rounded-xl py-3 text-sm font-semibold text-gray-700 border border-gray-200 shadow-sm hover:bg-gray-50 transition flex items-center justify-center gap-1.5">
            <span>📍</span> Lấy GPS
          </button>
          <button
            onClick={updateLocation}
            disabled={updating}
            className="flex-[2] bg-[#ff6b35] text-white py-3 rounded-xl font-bold text-sm hover:bg-orange-600 disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {updating ? (
              <><span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Đang cập nhật...</>
            ) : (
              <>🔄 Cập nhật vị trí</>
            )}
          </button>
        </div>

        {/* Coordinates display */}
        <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
          <span>📍</span>
          <span className="font-mono">{lat.toFixed(5)}, {lng.toFixed(5)}</span>
          <button onClick={() => { setLat(10.770); setLng(106.700); }} className="text-[#ff6b35] hover:underline ml-2">↺ Reset</button>
        </div>

        {status && (
          <div className={`p-3 rounded-xl text-sm font-medium text-center ${status.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {status}
          </div>
        )}

        {/* Map */}
        <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
          <DriverMap
            locations={[{ latitude: lat, longitude: lng, label: '📍 Vị trí của tôi' }]}
            interactive
            height="calc(55vh - 100px)"
            onLocationSelect={(newLat, newLng) => { setLat(newLat); setLng(newLng); }}
          />
        </div>

        {/* Active Dispatch */}
        {activeDispatch && (
          <div className="bg-gradient-to-r from-[#ff6b35] to-[#ff8f65] rounded-2xl p-4 text-white">
            <p className="text-xs text-white/70">🚚 Đơn đang giao</p>
            <div className="flex items-center justify-between mt-1">
              <div>
                <p className="font-bold">#{activeDispatch.orderId?.slice(0, 8)}</p>
                <p className="text-xs text-white/70">{activeDispatch.status === 'DRIVER_ASSIGNED' ? '📩 Chờ nhận' : activeDispatch.status === 'DRIVER_ACCEPTED' ? '✅ Đã nhận' : activeDispatch.status === 'DRIVER_ARRIVED' ? '📍 Đã đến' : activeDispatch.status === 'PICKED_UP' ? '📦 Đã lấy' : activeDispatch.status === 'DELIVERING' ? '🛵 Đang giao' : activeDispatch.status}</p>
              </div>
              <Link href={`/delivery/${activeDispatch.orderId}`} className="bg-white/20 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/30 transition">
                Xem →
              </Link>
            </div>
          </div>
        )}

        {/* Nearby Orders */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <h3 className="font-bold text-[#1a1a2e] mb-3">📋 Đơn gần đây ({nearbyOrders.length})</h3>
          {nearbyOrders.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Chưa có đơn nào gần đây</p>
          ) : (
            <div className="space-y-2">
              {nearbyOrders.slice(0, 5).map((o: any) => (
                <div key={o.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-sm">#{o.id?.slice(0, 8)}</span>
                      <span className="text-[#ff6b35] font-bold text-sm">{toNum(o.totalAmount).toLocaleString('vi-VN')}₫</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{o.deliveryAddress}</p>
                  </div>
                  <button
                    onClick={() => acceptDispatch(o.id)}
                    disabled={!isOnline || dispatchLoading}
                    className={`ml-3 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${!isOnline ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#ff6b35] text-white hover:bg-orange-600'}`}
                  >
                    {!isOnline ? '⚠️ Offline' : '📥 Nhận đơn'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        <Link href="/dashboard" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">🏠</span><span>Trang chủ</span></Link>
        <Link href="/orders" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">📦</span><span>Đơn hàng</span></Link>
        <Link href="/location" className="flex flex-col items-center text-[10px] text-[#ff6b35] no-underline"><span className="text-[22px]">🗺️</span><span>Bản đồ</span></Link>
        <Link href="/wallet" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">💰</span><span>Ví</span></Link>
        <button onClick={() => { clearAuth(); router.push('/'); }} className="flex flex-col items-center text-[10px] text-gray-400 bg-transparent border-none font-sans cursor-pointer"><span className="text-[22px]">👤</span><span>Tài khoản</span></button>
      </nav>
    </div>
  );
}