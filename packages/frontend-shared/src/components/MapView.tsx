"use client";

// ============================================================================
// MapView — component bản đồ dùng chung.
//
// Engine: MapLibre GL JS (vector tile + WebGL), style lấy từ MapTiler.
//
// Vì sao đổi từ Leaflet: Leaflet render raster tile bằng thẻ <img> lấy từ server
// public của OpenStreetMap. Server đó bị rate-limit rất chặt nên tile thường
// không tải được (bản đồ chỉ còn một khung xám), và mỗi bậc zoom lại phải tải
// một lưới ảnh mới nên pan/zoom bị giật. MapLibre vẽ vector trên GPU: zoom liên
// tục ở 60fps, một lần tải dữ liệu dùng cho nhiều mức zoom, và không còn dính
// lỗi Tailwind preflight (`img { max-width: 100% }`) bóp méo tile.
//
// API của component giữ NGUYÊN so với bản Leaflet để 6 nơi đang dùng không phải
// sửa gì: mọi toạ độ trong props theo thứ tự [latitude, longitude].
// (MapLibre dùng [lng, lat] — mọi chỗ chuyển đổi đều đi qua `toLngLat`.)
//
// Component chỉ chạy phía client (WebGL + `window`) → luôn nạp qua
// `next/dynamic` với `{ ssr: false }`, xem ghi chú trong src/index.ts.
// ============================================================================

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  NavigationControl,
  Popup as MapLibrePopup,
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./map-view.css";

/** TP. Hồ Chí Minh — [latitude, longitude]. */
const DEFAULT_CENTER: [number, number] = [10.775, 106.7];

/**
 * Khoá MapTiler. Đây là khoá dùng phía client nên LUÔN nhìn thấy được trong
 * DevTools — cách bảo vệ đúng là giới hạn theo domain trong dashboard MapTiler,
 * không phải cố che trong code. Ưu tiên đọc từ `.env.local`; giá trị dưới chỉ là
 * fallback để môi trường dev chạy được ngay mà không cần cấu hình.
 */
const MAPTILER_KEY =
  process.env.NEXT_PUBLIC_MAPTILER_KEY || "0IruJT6AiirBuSwVhleE";

/** Có thể trỏ sang style khác (hoặc bản self-host Protomaps) qua env. */
const MAP_STYLE_URL =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
  `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;

const ROUTE_SOURCE_ID = "mythfood-route";
const ROUTE_LAYER_ID = "mythfood-route-line";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** Props dùng [lat, lng]; MapLibre dùng [lng, lat]. */
function toLngLat(point: [number, number]): [number, number] {
  return [point[1], point[0]];
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Popup của MapLibre nhận HTML thô → phải escape nội dung do người dùng nhập. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Chỉ cho phép ký tự an toàn của một giá trị màu CSS (chống HTML injection). */
function safeColor(value: string, fallback = "#ff6b35"): string {
  return /^[#a-zA-Z0-9(),.%\s-]+$/.test(value) ? value : fallback;
}

/** Marker emoji (🛵 tài xế, 🏪 nhà hàng, 🏠 khách hàng…). */
function emojiMarkerElement(emoji: string, draggable: boolean): HTMLElement {
  const el = document.createElement("div");
  el.className = draggable
    ? "mythfood-emoji-marker mythfood-emoji-marker--draggable"
    : "mythfood-emoji-marker";
  el.textContent = emoji;
  return el;
}

/**
 * Pin mặc định — SVG nội tuyến nên không phải tải ảnh từ CDN nào
 * (bản Leaflet cũ lấy 3 file PNG từ cdnjs.cloudflare.com).
 */
function pinMarkerElement(color: string, draggable: boolean): HTMLElement {
  const el = document.createElement("div");
  el.className = draggable
    ? "mythfood-pin-marker mythfood-pin-marker--draggable"
    : "mythfood-pin-marker";
  el.innerHTML =
    `<svg width="26" height="38" viewBox="0 0 26 38" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M13 0C5.82 0 0 5.82 0 13c0 9.1 11.02 23.2 11.49 23.79a1.93 1.93 0 0 0 3.02 0` +
    `C14.98 36.2 26 22.1 26 13 26 5.82 20.18 0 13 0Z" fill="${safeColor(color)}"/>` +
    `<circle cx="13" cy="13" r="4.8" fill="#fff"/></svg>`;
  return el;
}

/** GeoJSON của tuyến đường; `coordinates` đã ở dạng [lng, lat]. */
function routeFeature(coordinates: [number, number][]) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates },
  };
}

/**
 * Id của layer nhãn (tên đường, tên địa điểm) đầu tiên trong style.
 * Chèn đường đi XUỐNG DƯỚI layer này để nhãn không bị vạch route che mất.
 */
function firstLabelLayerId(map: MapLibreMap): string | undefined {
  const layers = map.getStyle()?.layers ?? [];
  return layers.find((layer) => layer.type === "symbol")?.id;
}

export interface MapLocation {
  latitude: number;
  longitude: number;
  label?: string;
  address?: string;
  /** Emoji thay cho pin mặc định (vd: 🛵 tài xế, 🏪 nhà hàng, 🏠 khách hàng). */
  emoji?: string;
}

/** Một điểm trên tuyến đường: `[latitude, longitude]`. */
export type RoutePoint = [number, number];

interface MapViewProps {
  locations?: MapLocation[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  className?: string;
  /** Cho phép click / kéo thả trên bản đồ để chọn toạ độ. */
  interactive?: boolean;
  onLocationSelect?: (lat: number, lng: number) => void;
  /** Tuyến đường dẫn đường (nối các điểm thành polyline). */
  route?: RoutePoint[];
  routeColor?: string;
  /** Màu pin mặc định (khi location không có `emoji`). Mặc định = `routeColor`. */
  markerColor?: string;
  /** Tự động zoom vừa khít marker + tuyến đường (mặc định: bật khi có route). */
  autoFit?: boolean;
  /**
   * Tự pan bản đồ theo marker đầu tiên khi toạ độ của nó thay đổi từ bên ngoài
   * (chọn địa chỉ từ Nominatim, bấm "Lấy GPS"…).
   * Mặc định: bật khi chỉ có 1 marker và không có tuyến đường.
   */
  follow?: boolean;
  /** Cho kéo thả marker đầu tiên. Mặc định: bật khi `interactive` + 1 marker. */
  draggableMarker?: boolean;
  /** Zoom bằng con lăn chuột (mặc định bật). */
  scrollWheelZoom?: boolean;
}

// ---------------------------------------------------------------------------
// Hook & type nội bộ
// ---------------------------------------------------------------------------

/** Ref luôn trỏ tới giá trị mới nhất — để effect không phải phụ thuộc callback. */
function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

interface MarkerSpec {
  key: string;
  lngLat: [number, number];
  emoji?: string | undefined;
  label?: string | undefined;
  address?: string | undefined;
  draggable: boolean;
}

/**
 * Giữ nguyên tham chiếu mảng khi nội dung không đổi.
 *
 * Các trang gọi `<MapView locations={[{...}]} />` bằng array literal → mỗi
 * render là một tham chiếu mới. Nếu để nguyên, effect đồng bộ marker sẽ chạy lại
 * theo mỗi nhịp poll/socket. Hook này chuẩn hoá tham chiếu để việc tối ưu không
 * phụ thuộc vào việc phía gọi có bọc `useMemo` hay không.
 */
function useStableList<T>(list: T[], signature: string): T[] {
  const ref = useRef<{ signature: string; list: T[] }>({ signature, list });
  if (ref.current.signature !== signature) {
    ref.current = { signature, list };
  }
  return ref.current.list;
}

function MapViewBase({
  locations = [],
  center,
  zoom = 13,
  height = "400px",
  className = "",
  interactive = false,
  onLocationSelect,
  route,
  routeColor = "#ff6b35",
  markerColor,
  autoFit,
  follow,
  draggableMarker,
  scrollWheelZoom = true,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef(new Map<string, MapLibreMarker>());

  /** Bật sau sự kiện `load`; trước đó chưa được thêm source/layer vào style. */
  const [styleReady, setStyleReady] = useState(false);
  const [error, setError] = useState("");

  const onSelectRef = useLatestRef(onLocationSelect);

  /**
   * Đánh dấu toạ độ mới phát sinh từ chính bản đồ (click / kéo marker), để
   * `follow` không kéo khung nhìn về giữa mỗi lần người dùng chọn điểm.
   */
  const selfUpdateRef = useRef(false);

  // ── Chuẩn hoá dữ liệu đầu vào ───────────────────────────────────────────
  const locationSignature = locations
    .map(
      (l) =>
        `${l.latitude},${l.longitude},${l.emoji ?? ""},${l.label ?? ""},${l.address ?? ""}`,
    )
    .join("|");
  const stableLocations = useStableList(locations, locationSignature);
  const firstLocation = stableLocations[0];

  const routePoints = useMemo<RoutePoint[]>(
    () => (route || []).filter(([lat, lng]) => lat != null && lng != null),
    [route],
  );
  const routeSignature = routePoints
    .map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`)
    .join("|");

  const allowDrag =
    draggableMarker ??
    (interactive && !!onLocationSelect && stableLocations.length === 1);

  const markerSpecs = useMemo<MarkerSpec[]>(
    () =>
      stableLocations.map((loc, index) => ({
        // Key theo emoji + label: ở trang giao hàng, marker tại cùng một index
        // đổi ý nghĩa theo từng bước (🛵 tài xế → 🛵 đang ở quán → 🏠 khách).
        // Với picker 1 điểm, label không đổi nên marker chỉ dịch chuyển bằng
        // `setLngLat()` thay vì bị dựng lại DOM — đây là nguồn gốc nhấp nháy.
        key: `${loc.emoji ?? ""}|${loc.label ?? ""}|${index}`,
        lngLat: [loc.longitude, loc.latitude] as [number, number],
        emoji: loc.emoji,
        label: loc.label,
        address: loc.address,
        draggable: allowDrag && index === 0,
      })),
    [stableLocations, allowDrag],
  );

  const fitPoints = useMemo<RoutePoint[]>(
    () => [
      ...stableLocations.map((l) => [l.latitude, l.longitude] as RoutePoint),
      ...routePoints,
    ],
    [stableLocations, routePoints],
  );
  const fitPointsRef = useLatestRef(fitPoints);
  const fitSignature = fitPoints
    .map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`)
    .join("|");

  // Bật auto-fit khi có tuyến đường HOẶC nhiều marker — nhờ đó trang giao hàng
  // đã thấy đủ cả 2 điểm ngay, không phải chờ OSRM trả tuyến về.
  const shouldAutoFit =
    autoFit ?? (routePoints.length > 1 || stableLocations.length > 1);

  // Chỉ auto-pan cho bản đồ 1 điểm (picker vị trí); nhiều điểm thì để auto-fit lo.
  const shouldFollow =
    follow ?? (stableLocations.length === 1 && routePoints.length === 0);

  const pinColor = safeColor(markerColor ?? routeColor);
  const lineColor = safeColor(routeColor);

  /** Khung nhìn ban đầu — chỉ dùng một lần lúc khởi tạo map. */
  const initialViewRef = useRef({
    center: toLngLat(
      center ??
        (firstLocation
          ? [firstLocation.latitude, firstLocation.longitude]
          : DEFAULT_CENTER),
    ),
    zoom,
  });

  // ── Khởi tạo map (chạy một lần) ─────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container,
        style: MAP_STYLE_URL,
        center: initialViewRef.current.center,
        zoom: initialViewRef.current.zoom,
        // Xoay/nghiêng bản đồ không có ý nghĩa với app giao đồ ăn và rất dễ bị
        // kích hoạt ngoài ý muốn trên mobile → tắt hẳn.
        dragRotate: false,
        pitchWithRotate: false,
      });
    } catch {
      setError("Trình duyệt không hỗ trợ WebGL nên không vẽ được bản đồ.");
      return;
    }

    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => setStyleReady(true));
    map.on("error", (event) => {
      const message =
        event?.error instanceof Error ? event.error.message : String(event);
      // Style không tải được hầu như luôn do khoá MapTiler sai / bị chặn domain.
      if (/style|401|403|jwt|key/i.test(message)) {
        setError(
          "Không tải được bản đồ — kiểm tra NEXT_PUBLIC_MAPTILER_KEY trong .env.local.",
        );
      }
      console.warn("[MapView]", message);
    });

    // Đo lại kích thước: nhiều bản đồ nằm trong khối lúc đầu bị ẩn hoặc cao 0px
    // (step 2 form đăng ký merchant, modal LocationGate). Khởi tạo trong khung
    // 0px mà không gọi `resize()` thì canvas ở lại 0px → chỉ thấy khung xám.
    const raf = requestAnimationFrame(() => map.resize());
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => map.resize());
    observer?.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
      setStyleReady(false);
    };
  }, []);

  // ── Zoom bằng con lăn chuột ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (scrollWheelZoom) map.scrollZoom.enable();
    else map.scrollZoom.disable();
  }, [scrollWheelZoom, styleReady]);

  // ── Click trên bản đồ để chọn toạ độ ────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !interactive || !onLocationSelect) return;

    const handler = (event: MapMouseEvent) => {
      selfUpdateRef.current = true;
      onSelectRef.current?.(event.lngLat.lat, event.lngLat.lng);
    };
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [interactive, onLocationSelect, onSelectRef, styleReady]);

  // ── Đồng bộ marker: thêm / xoá / dịch chuyển, không dựng lại DOM ────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const store = markersRef.current;
    const wantedKeys = new Set(markerSpecs.map((spec) => spec.key));

    for (const [key, marker] of store) {
      if (!wantedKeys.has(key)) {
        marker.remove();
        store.delete(key);
      }
    }

    for (const spec of markerSpecs) {
      const existing = store.get(spec.key);
      if (existing) {
        existing.setLngLat(spec.lngLat);
        continue;
      }

      const marker = new MapLibreMarker({
        element: spec.emoji
          ? emojiMarkerElement(spec.emoji, spec.draggable)
          : pinMarkerElement(pinColor, spec.draggable),
        anchor: "bottom",
        draggable: spec.draggable,
      }).setLngLat(spec.lngLat);

      if (spec.label) {
        const body = spec.address ? `<p>${escapeHtml(spec.address)}</p>` : "";
        marker.setPopup(
          new MapLibrePopup({ offset: 14, closeButton: false }).setHTML(
            `<div class="mythfood-popup"><strong>${escapeHtml(spec.label)}</strong>${body}</div>`,
          ),
        );
      }

      if (spec.draggable) {
        marker.on("dragend", () => {
          const { lat, lng } = marker.getLngLat();
          selfUpdateRef.current = true;
          onSelectRef.current?.(lat, lng);
        });
      }

      marker.addTo(map);
      store.set(spec.key, marker);
    }
  }, [markerSpecs, pinColor, onSelectRef, styleReady]);

  // ── Tuyến đường: GeoJSON source + line layer ────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;

    const coordinates = routePoints.map(toLngLat);
    const source = map.getSource(ROUTE_SOURCE_ID) as GeoJSONSource | undefined;

    if (coordinates.length < 2) {
      source?.setData(routeFeature([]));
      return;
    }

    if (source) {
      source.setData(routeFeature(coordinates));
      if (map.getLayer(ROUTE_LAYER_ID)) {
        map.setPaintProperty(ROUTE_LAYER_ID, "line-color", lineColor);
      }
      return;
    }

    map.addSource(ROUTE_SOURCE_ID, {
      type: "geojson",
      data: routeFeature(coordinates),
    });
    map.addLayer(
      {
        id: ROUTE_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": lineColor,
          "line-width": 5,
          "line-opacity": 0.85,
        },
      },
      firstLabelLayerId(map),
    );
    // `routeSignature` là chữ ký của `routePoints` (làm tròn ~1m), dùng thay cho
    // chính mảng để effect không chạy lại chỉ vì có tham chiếu mới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleReady, routeSignature, lineColor]);
  // ── Auto-fit khung nhìn theo toàn bộ marker + tuyến đường ───────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !shouldAutoFit || !fitSignature) return;

    const points = fitPointsRef.current;
    const first = points[0];
    if (!first) return;

    if (points.length === 1) {
      map.easeTo({
        center: toLngLat(first),
        zoom: Math.max(map.getZoom(), 15),
        duration: 500,
      });
      return;
    }

    const bounds = points.reduce(
      (acc, point) => acc.extend(toLngLat(point)),
      new LngLatBounds(toLngLat(first), toLngLat(first)),
    );
    map.fitBounds(bounds, { padding: 48, maxZoom: 16, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleReady, shouldAutoFit, fitSignature]);

  // ── Auto-pan theo marker đầu tiên (dùng cho picker vị trí) ──────────────
  useEffect(() => {
    // Toạ độ vừa đổi do người dùng click/kéo trên bản đồ → không kéo khung nhìn.
    if (selfUpdateRef.current) {
      selfUpdateRef.current = false;
      return;
    }
    const map = mapRef.current;
    if (!map || !styleReady || !shouldFollow || !firstLocation) return;

    const current = map.getCenter();
    // Lệch dưới ~1m thì không cần làm gì.
    if (
      Math.abs(current.lat - firstLocation.latitude) < 1e-5 &&
      Math.abs(current.lng - firstLocation.longitude) < 1e-5
    ) {
      return;
    }
    map.easeTo({
      center: [firstLocation.longitude, firstLocation.latitude],
      duration: 600,
    });
  }, [styleReady, shouldFollow, firstLocation]);

  return (
    <div
      style={{ height }}
      className={`relative rounded-lg overflow-hidden border ${
        interactive && onLocationSelect ? "mythfood-map--picking" : ""
      } ${className}`}
    >
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 p-4 text-center text-xs text-gray-500">
          🗺️ {error}
        </div>
      )}
    </div>
  );
}

/**
 * `memo` để bản đồ không re-render theo mỗi nhịp poll/socket của trang cha
 * (trang giao hàng của tài xế cập nhật GPS và trạng thái đơn liên tục).
 */
export default memo(MapViewBase);
