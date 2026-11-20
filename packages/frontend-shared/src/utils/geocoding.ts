// ============================================================================
// Geocoding dùng MapTiler Geocoding API (cùng key với bản đồ).
//
// Nominatim cũ thường bị chặn / rate-limit giống như tile server OSM, dẫn tới
// "không có gợi ý địa chỉ". MapTiler trả kết quả ổn định, hỗ trợ tiếng Việt và
// giới hạn theo quốc gia VN. Vẫn giữ Nominatim làm fallback cho trường hợp key
// MapTiler chưa bật gói geocoding.
// ============================================================================

export interface GeocodingSuggestion {
  display_name: string;
  lat: string;
  lon: string;
}

/** Khoá public dùng phía client — giới hạn thật sự nằm ở dashboard MapTiler. */
const MAPTILER_KEY =
  process.env.NEXT_PUBLIC_MAPTILER_KEY || "0IruJT6AiirBuSwVhleE";

async function mapTilerGeocode(path: string): Promise<any> {
  const res = await fetch(`https://api.maptiler.com/${path}`);
  if (!res.ok) {
    throw new Error(`MapTiler geocoding ${res.status}`);
  }
  return res.json();
}

async function nominatimSearch(query: string): Promise<GeocodingSuggestion[]> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1&countrycodes=VN&accept-language=vi`,
  );
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = (await res.json()) as Array<{
    display_name?: string;
    lat?: string;
    lon?: string;
  }>;
  return (Array.isArray(data) ? data : [])
    .filter((item) => item?.lat && item?.lon)
    .map((item) => ({
      display_name: item.display_name || query,
      lat: String(item.lat),
      lon: String(item.lon),
    }));
}

/** Tìm kiếm địa chỉ → danh sách gợi ý theo thứ tự phù hợp. */
export async function searchAddress(
  query: string,
): Promise<GeocodingSuggestion[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    const data = await mapTilerGeocode(
      `geocoding/${encodeURIComponent(q)}.json?key=${MAPTILER_KEY}&language=vi&country=vn&limit=5`,
    );
    const features = Array.isArray(data?.features) ? data.features : [];
    return features
      .filter(
        (feature: any) =>
          Array.isArray(feature?.center) && feature.center.length >= 2,
      )
      .map((feature: any) => ({
        display_name: feature.place_name || feature.text || q,
        lat: String(feature.center[1]),
        lon: String(feature.center[0]),
      }));
  } catch {
    // fallback sang Nominatim nếu key MapTiler chưa bật geocoding.
    try {
      return await nominatimSearch(q);
    } catch {
      return [];
    }
  }
}

/** Đảo ngược toạ độ → địa chỉ hiển thị. */
export async function reverseGeocodeAddress(
  latitude: number,
  longitude: number,
): Promise<string> {
  const fallback = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

  try {
    const data = await mapTilerGeocode(
      `geocoding/${longitude},${latitude}.json?key=${MAPTILER_KEY}&language=vi`,
    );
    const feature = data?.features?.[0];
    if (feature?.place_name) return feature.place_name;
  } catch {
    // fallback xuống Nominatim.
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1&accept-language=vi`,
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.display_name) return data.display_name;
    }
  } catch {
    // bỏ qua — trả về toạ độ thô.
  }

  return fallback;
}
