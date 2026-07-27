'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { driverApi, orderApi } from '@mythfood/api-client';
import { useAuthStore } from '@mythfood/frontend-shared';

const DriverMap = dynamic(
  () => import('@mythfood/frontend-shared').then(m => ({ default: m.MapView })),
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

  // Search state
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    async function load() {
      try {
        const dRes = await driverApi.getByUserId(user?.id || '');
        const d = (dRes as any).data ?? dRes;
        setDriver(d);
        if (d?.latitude) setLat(d.latitude);
        if (d?.longitude) setLng(d.longitude);

        try {
          const availRes = await orderApi.list({ status: 'READY_FOR_PICKUP', take: 10 });
          const items = (availRes as any).items || [];
          setNearbyOrders(Array.isArray(items) ? items : []);
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

  // Fetch address suggestions from Nominatim
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
      setStatus('Trinh duyet khong ho tro GPS');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setStatus('Da lay vi tri hien tai!');
      },
      () => setStatus('Khong the lay vi tri'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function updateLocation() {
    if (!driver?.id) return;
    setUpdating(true);
    setStatus('');
    try {
      await driverApi.updateLocation(driver.id, { latitude: lat, longitude: lng });
      setStatus('Cap nhat vi tri thanh cong!');
    } catch (err: any) {
      setStatus((err.message || 'Loi cap nhat'));
    } finally { setUpdating(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] max-w-[1400px] mx-auto pb-20 lg:pb-0 w-full">
      <header className="bg-[#1a1a2e] px-4 sm:px-6 py-4 text-white">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="text-white/60 text-lg">Back</Link>
          <h1 className="text-lg font-bold">Map</h1>
          <div className="w-6" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5 w-full">
        {/* Search Input */}
        <div className="relative" ref={suggestionRef}>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">Search</span>
            <input
              type="text"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search address..."
              className="w-full bg-white rounded-xl pl-11 pr-4 py-3.5 text-sm border border-gray-200 shadow-sm focus:border-[#ff6b35] focus:ring-2 focus:ring-orange-200 outline-none transition"
            />
            {search && (
              <button onClick={() => { setSearch(''); setSuggestions([]); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">x</button>
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

        {/* Quick actions */}
        <div className="flex gap-2">
          <button onClick={useCurrentLocation} className="flex-1 bg-white rounded-xl py-3 text-sm font-semibold text-gray-600 border border-gray-200 shadow-sm hover:bg-gray-50 transition">
            GPS
          </button>
          <button
            onClick={() => { setLat(10.770); setLng(106.700); }}
            className="flex-1 bg-white rounded-xl py-3 text-sm font-semibold text-gray-600 border border-gray-200 shadow-sm hover:bg-gray-50 transition"
          >
            Reset
          </button>
        </div>

        {/* Info Card */}
        <div className="bg-gradient-to-br from-[#1a1a2e] to-[#2d2d44] rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-white/60">Current</p>
            <span className="text-xs bg-white/15 px-2.5 py-1 rounded-full">{lat.toFixed(5)}, {lng.toFixed(5)}</span>
          </div>
          <div className="text-xs text-white/50 space-y-1">
            <p>Drag map to select position</p>
            <p>Or search above to find location</p>
          </div>
        </div>

        {/* Map */}
        <div className="rounded-2xl overflow-hidden border border-gray-100">
          <DriverMap
            locations={[{ latitude: lat, longitude: lng, label: 'My Location' }]}
            interactive
            height="350px"
            onLocationSelect={(newLat, newLng) => { setLat(newLat); setLng(newLng); }}
          />
        </div>

        {/* Update button */}
        <button
          onClick={updateLocation}
          disabled={updating}
          className="w-full bg-[#ff6b35] text-white py-4 rounded-2xl font-bold text-base hover:bg-orange-600 disabled:opacity-50 transition flex items-center justify-center gap-2"
        >
          {updating ? <><span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Updating...</> : <>Update Location</>}
        </button>

        {status && (
          <div className={`p-3 rounded-xl text-sm font-medium text-center ${status.includes('thanh cong') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {status}
          </div>
        )}

        {/* Nearby Orders */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-[#1a1a2e] mb-3">Nearby ({nearbyOrders.length})</h3>
          {nearbyOrders.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">No orders</p> : (
            <div className="space-y-2">
              {nearbyOrders.slice(0, 3).map((o: any) => (
                <div key={o.id} className="p-3 bg-gray-50 rounded-xl text-sm">
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold">#{o.id?.slice(0, 8)}</span>
                    <span className="text-[#ff6b35] font-bold">{toNum(o.totalAmount).toLocaleString('vi-VN')}d</span>
                  </div>
                  <p className="text-xs text-gray-500">{o.deliveryAddress}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mechanism */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <button onClick={() => setShowMechanism(!showMechanism)} className="w-full flex items-center justify-between font-bold text-[#1a1a2e]">
            <span>Dispatch Info</span>
            <span className="text-gray-400">{showMechanism ? 'Up' : 'Down'}</span>
          </button>
          {showMechanism && (
            <div className="mt-4 space-y-3 text-sm text-gray-600 leading-relaxed">
              <div className="bg-[#fff7ed] rounded-xl p-4 border border-orange-100">
                <p className="font-semibold text-[#ff6b35] mb-2">Dispatch based on:</p>
                <ol className="list-decimal pl-4 space-y-2">
                  <li><strong>Distance driver to restaurant</strong></li>
                  <li><strong>Driver ONLINE, not BUSY</strong></li>
                  <li><strong>Fatigue level</strong></li>
                  <li><strong>Wait time priority</strong></li>
                </ol>
              </div>
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                <p className="font-semibold text-blue-700 mb-2">Process:</p>
                <div className="space-y-1.5 text-xs">
                  <p>1. Order READY_FOR_PICKUP</p>
                  <p>2. Calculate distance (Haversine)</p>
                  <p>3. Filter nearest driver</p>
                  <p>4. Assign to driver</p>
                  <p>5. Driver notified</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 text-center">Update location often for faster matching!</p>
            </div>
          )}
        </div>
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        <Link href="/dashboard" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">Home</span><span>Home</span></Link>
        <Link href="/orders" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">Orders</span><span>Orders</span></Link>
        <Link href="/location" className="flex flex-col items-center text-[10px] text-[#ff6b35] no-underline"><span className="text-[22px]">Map</span><span>Map</span></Link>
        <Link href="/earnings" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">Money</span><span>Money</span></Link>
        <button onClick={() => { clearAuth(); router.push('/'); }} className="flex flex-col items-center text-[10px] text-gray-400 bg-transparent border-none font-sans cursor-pointer"><span className="text-[22px]">User</span><span>User</span></button>
      </nav>
    </div>
  );
}