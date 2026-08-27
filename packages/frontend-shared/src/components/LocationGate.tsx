"use client";

import { useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useLocationStore } from "../stores/location.store";

const GateMap = dynamic(() => import("./MapView"), { ssr: false });

interface Suggestion {
  display_name: string;
  lat: string;
  lon: string;
}

export default function LocationGate() {
  const { hasLocation, setLocation } = useLocationStore();
  const [mode, setMode] = useState<"choose" | "manual">("choose");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [lat, setLat] = useState(10.775);
  const [lng, setLng] = useState(106.7);
  const [address, setAddress] = useState("");
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (hasLocation) return null;

  function useGps() {
    if (!navigator.geolocation) {
      setError("Trình duyệt không hỗ trợ định vị.");
      setMode("manual");
      return;
    }
    setLoading(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        let addr = `Vị trí ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1&accept-language=vi`,
          );
          const data = await res.json();
          if (data?.display_name) addr = data.display_name;
        } catch {}
        setLocation({ latitude, longitude, address: addr, source: "gps" });
        setLoading(false);
      },
      () => {
        setError("Không lấy được GPS. Nhập thủ công.");
        setLoading(false);
        setMode("manual");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const fetchSuggestions = useCallback((query: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1&countrycodes=VN`,
        );
        setSuggestions(await res.json());
      } catch {
        setSuggestions([]);
      }
    }, 400);
  }, []);

  function selectSuggestion(s: Suggestion) {
    setLat(parseFloat(s.lat));
    setLng(parseFloat(s.lon));
    setAddress(s.display_name);
    setSearch(s.display_name);
    setSuggestions([]);
  }

  function confirmManual() {
    if (!address.trim()) {
      setError("Vui lòng chọn hoặc nhập địa chỉ");
      return;
    }
    setLocation({
      latitude: lat,
      longitude: lng,
      address: address.trim(),
      source: "manual",
    });
  }

  function skip() {
    setLocation({
      latitude: 10.775,
      longitude: 106.7,
      address: "TP. Hồ Chí Minh",
      source: "manual",
    });
  }

  return (
    <div className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <p className="text-4xl text-center mb-2">📍</p>
        <h2 className="text-lg font-bold text-center text-[#1a1a2e] mb-1">
          Cho phép truy cập vị trí
        </h2>
        <p className="text-sm text-gray-500 text-center mb-5">
          Vị trí giúp tìm nhà hàng gần và ước tính phí ship chính xác
        </p>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-3">
            {error}
          </div>
        )}

        {mode === "choose" ? (
          <div className="space-y-3">
            <button
              onClick={useGps}
              disabled={loading}
              className="w-full bg-[#ff6b35] text-white py-3 rounded-xl font-semibold hover:bg-orange-600 disabled:opacity-50 transition"
            >
              {loading ? "Đang lấy vị trí..." : "📡 Dùng vị trí hiện tại (GPS)"}
            </button>
            <button
              onClick={() => setMode("manual")}
              className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-200 transition"
            >
              ✍️ Nhập địa chỉ thủ công
            </button>
            <button
              onClick={skip}
              className="w-full text-center text-xs text-gray-400 py-1 hover:text-gray-600"
            >
              Bỏ qua (vị trí mặc định)
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                fetchSuggestions(e.target.value);
              }}
              placeholder="Tìm địa chỉ của bạn..."
              className="w-full border rounded-xl px-4 py-3 text-sm focus:border-[#ff6b35] focus:ring-2 focus:ring-orange-200 outline-none"
            />
            {suggestions.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg border max-h-40 overflow-y-auto">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectSuggestion(s)}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-orange-50 border-b border-gray-50 last:border-0"
                  >
                    {s.display_name}
                  </button>
                ))}
              </div>
            )}
            <GateMap
              locations={[
                { latitude: lat, longitude: lng, label: "📍 Vị trí của bạn" },
              ]}
              interactive
              height="200px"
              onLocationSelect={(nLat, nLng) => {
                setLat(nLat);
                setLng(nLng);
                setAddress(`Vị trí ${nLat.toFixed(5)}, ${nLng.toFixed(5)}`);
              }}
            />
            <button
              onClick={confirmManual}
              className="w-full bg-[#ff6b35] text-white py-3 rounded-xl font-semibold hover:bg-orange-600 transition"
            >
              ✅ Xác nhận vị trí
            </button>
            <button
              onClick={() => setMode("choose")}
              className="w-full text-center text-xs text-gray-400 py-1 hover:text-gray-600"
            >
              ← Quay lại
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
