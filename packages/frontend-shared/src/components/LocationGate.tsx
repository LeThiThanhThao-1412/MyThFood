"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useLocationStore, type UserLocation } from "../stores/location.store";
import { searchAddress, reverseGeocodeAddress } from "../utils/geocoding";

const GateMap = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="h-[200px] w-full animate-pulse rounded-lg bg-gray-100" />
  ),
});

interface Suggestion {
  display_name: string;
  lat: string;
  lon: string;
}

export interface LocationGateProps {
  /**
   * Bỏ trống → chế độ "cổng chặn": hộp thoại tự hiện khi app chưa có vị trí và
   * tự ẩn ngay sau khi người dùng chọn xong.
   *
   * Truyền `true`/`false` → chế độ điều khiển từ bên ngoài, dùng cho luồng
   * "cập nhật lại vị trí": hộp thoại chỉ hiện khi `open === true` (kể cả khi đã
   * có vị trí) và được nạp sẵn vị trí đang dùng để chỉnh tiếp.
   */
  open?: boolean;
  /** Gọi sau khi lưu vị trí mới hoặc khi người dùng đóng hộp thoại. */
  onClose?: () => void;
}

/** TP. Hồ Chí Minh — dùng khi chưa có vị trí nào để nạp sẵn. */
const DEFAULT_LAT = 10.775;
const DEFAULT_LNG = 106.7;
const DEFAULT_ADDRESS = "TP. Hồ Chí Minh";

export default function LocationGate({
  open,
  onClose,
}: LocationGateProps = {}) {
  const { location, hasLocation, setLocation } = useLocationStore();
  const controlled = open !== undefined;
  const visible = controlled ? open === true : !hasLocation;
  /** Đang chỉnh lại vị trí đã có (không phải lần chọn đầu tiên). */
  const editing = controlled && hasLocation;

  const [mode, setMode] = useState<"choose" | "manual">("choose");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [lat, setLat] = useState(DEFAULT_LAT);
  const [lng, setLng] = useState(DEFAULT_LNG);
  const [address, setAddress] = useState("");
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seededRef = useRef(false);

  // Mỗi lần hộp thoại mở lại: nạp sẵn vị trí đang dùng để người dùng chỉnh tiếp
  // thay vì bắt đầu lại từ toạ độ mặc định. Chỉ nạp ở nhịp mở đầu tiên nên
  // không ghi đè những gì người dùng đang nhập.
  useEffect(() => {
    if (!visible) {
      seededRef.current = false;
      return;
    }
    if (seededRef.current) return;
    seededRef.current = true;
    setMode("choose");
    setError("");
    setLoading(false);
    setSuggestions([]);
    setLat(location?.latitude ?? DEFAULT_LAT);
    setLng(location?.longitude ?? DEFAULT_LNG);
    setAddress(location?.address ?? "");
    setSearch(location?.address ?? "");
  }, [visible, location]);

  /** Lưu vị trí rồi đóng hộp thoại (chế độ cổng chặn tự ẩn theo `hasLocation`). */
  const applyLocation = useCallback(
    (loc: UserLocation) => {
      setLocation(loc);
      onClose?.();
    },
    [setLocation, onClose],
  );

  /** Đóng mà không thay đổi vị trí (chỉ có ý nghĩa ở chế độ điều khiển). */
  const close = useCallback(() => {
    onClose?.();
  }, [onClose]);

  // Ở chế độ điều khiển người dùng chủ động mở hộp thoại → cho đóng bằng Esc.
  // Chế độ cổng chặn thì không, vì app cần toạ độ mới chạy đúng.
  useEffect(() => {
    if (!visible || !controlled) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, controlled, close]);

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
          addr = await reverseGeocodeAddress(latitude, longitude);
        } catch {}
        applyLocation({ latitude, longitude, address: addr, source: "gps" });
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
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setSuggestions(await searchAddress(query));
    }, 350);
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
    applyLocation({
      latitude: lat,
      longitude: lng,
      address: address.trim(),
      source: "manual",
    });
  }

  function skip() {
    applyLocation({
      latitude: DEFAULT_LAT,
      longitude: DEFAULT_LNG,
      address: DEFAULT_ADDRESS,
      source: "manual",
    });
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center p-4"
      onClick={controlled ? close : undefined}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {controlled && (
          <button
            type="button"
            onClick={close}
            aria-label="Đóng"
            className="absolute top-3 right-4 text-gray-300 hover:text-gray-500 text-lg leading-none"
          >
            ✕
          </button>
        )}
        <p className="text-4xl text-center mb-2">📍</p>
        <h2 className="text-lg font-bold text-center text-[#1a1a2e] mb-1">
          {editing ? "Cập nhật vị trí của bạn" : "Cho phép truy cập vị trí"}
        </h2>
        <p className="text-sm text-gray-500 text-center mb-5">
          {editing
            ? "Chọn lại vị trí để phí giao hàng và danh sách nhà hàng gần bạn được tính đúng"
            : "Vị trí giúp tìm nhà hàng gần và ước tính phí ship chính xác"}
        </p>

        {editing && location && (
          <div className="bg-orange-50 text-gray-600 rounded-xl p-3 text-xs mb-3">
            Đang dùng:{" "}
            <span className="font-semibold">
              {location.address || "Vị trí hiện tại"}
            </span>
            <span className="block font-mono text-gray-400 mt-0.5">
              {Number(location.latitude).toFixed(6)},{" "}
              {Number(location.longitude).toFixed(6)}
            </span>
          </div>
        )}

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
              ✍️{" "}
              {editing
                ? "Chọn địa chỉ khác trên bản đồ"
                : "Nhập địa chỉ thủ công"}
            </button>
            {editing ? (
              <button
                onClick={close}
                className="w-full text-center text-xs text-gray-400 py-1 hover:text-gray-600"
              >
                Giữ vị trí hiện tại
              </button>
            ) : (
              <button
                onClick={skip}
                className="w-full text-center text-xs text-gray-400 py-1 hover:text-gray-600"
              >
                Bỏ qua (vị trí mặc định)
              </button>
            )}
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
              {editing ? "✅ Lưu vị trí mới" : "✅ Xác nhận vị trí"}
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
