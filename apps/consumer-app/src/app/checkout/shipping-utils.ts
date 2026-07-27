/**
 * Shipping Fee Calculator (client-side)
 * 
 * Implements the same logic as the backend shipping service:
 * - Haversine distance
 * - Rush hour multiplier (7-9h, 17-19h)
 * - Weather multiplier (OpenWeatherMap API)
 * 
 * Falls back to shippingApi.getFee() when backend is available.
 */

export interface ShippingFeeInfo {
  distanceKm: number;
  baseFee: number;
  distanceFee: number;
  rushHourSurcharge: number;
  weatherSurcharge: number;
  totalFee: number;
  breakdown: {
    baseFee: number;
    distanceFee: number;
    rushHourMultiplier: number;
    weatherMultiplier: number;
    total: number;
  };
}

const BASE_FEE = 10000;
const PER_KM_RATE = 3000;
const MIN_FEE = 8000;
const MAX_FEE = 80000;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getRushHourMultiplier(): number {
  const hour = new Date().getHours();
  if ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 19)) {
    return 1.5;
  }
  return 1.0;
}

async function getWeatherMultiplier(lat: number, lng: number): Promise<number> {
  try {
    const apiKey = 'e3238768c07b4d77897565c7bb6a42b5';
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.weather?.length > 0) {
      const condition = data.weather[0].main as string;
      const desc = (data.weather[0].description || '').toLowerCase();

      if (condition === 'Thunderstorm' || condition === 'Rain' || condition === 'Drizzle' || desc.includes('rain') || desc.includes('mưa')) {
        return 1.3;
      }
      if (condition === 'Snow' || condition === 'Extreme') return 1.5;
      if (condition === 'Fog' || condition === 'Mist' || condition === 'Haze') return 1.1;

      if (data.main?.temp) {
        const temp = data.main.temp as number;
        if (temp > 35 || temp < 10) return 1.15;
      }
    }
  } catch { /* ignore */ }
  return 1.0;
}

export async function calculateShippingFee(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<ShippingFeeInfo> {
  const distanceKm = haversineKm(originLat, originLng, destLat, destLng);
  const distanceFee = Math.round(distanceKm * PER_KM_RATE);
  const rawFee = BASE_FEE + distanceFee;

  const rushMultiplier = getRushHourMultiplier();
  const afterRush = Math.round(rawFee * rushMultiplier);

  const weatherMultiplier = await getWeatherMultiplier(destLat, destLng);
  const totalFee = Math.round(afterRush * weatherMultiplier);
  const finalFee = Math.max(MIN_FEE, Math.min(MAX_FEE, totalFee));

  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    baseFee: BASE_FEE,
    distanceFee,
    rushHourSurcharge: afterRush - rawFee,
    weatherSurcharge: totalFee - afterRush,
    totalFee: finalFee,
    breakdown: {
      baseFee: BASE_FEE,
      distanceFee,
      rushHourMultiplier: rushMultiplier,
      weatherMultiplier,
      total: finalFee,
    },
  };
}