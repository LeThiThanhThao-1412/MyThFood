import { Injectable, Logger } from "@nestjs/common";

export interface ShippingFeeRequest {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
}

export interface ShippingFeeResponse {
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

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  // ─── Fee Constants ──────────────────────────────────────
  private readonly BASE_FEE = 10000; // 10,000 VND
  private readonly PER_KM_RATE = 3000; // 3,000 VND/km
  private readonly MIN_FEE = 8000; // 8,000 VND
  private readonly MAX_FEE = 80000; // 80,000 VND cap

  // Rush hour windows (local time, VN)
  private readonly RUSH_HOURS = [
    { start: 7, end: 9 }, // Morning
    { start: 17, end: 19 }, // Evening
  ];

  private readonly RUSH_HOUR_MULTIPLIER = 1.5;

  // ─── Haversine Distance (backup if OSRM fails) ───────────
  private haversineKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
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

  // ─── OSRM Distance ──────────────────────────────────────
  private async getOSRMDistance(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<number | null> {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=false`;
      const res = await fetch(url);
      const data = (await res.json()) as any;

      if (data.code === "Ok" && data.routes?.length > 0) {
        const distanceMeters = data.routes[0].distance; // meters
        return distanceMeters / 1000; // return km
      }
      return null;
    } catch (err) {
      this.logger.warn("OSRM routing failed, falling back to Haversine", err);
      return null;
    }
  }

  // ─── Rush Hour Detection ─────────────────────────────────
  private getRushHourMultiplier(): number {
    const now = new Date();
    const hour = now.getHours();

    for (const window of this.RUSH_HOURS) {
      if (hour >= window.start && hour < window.end) {
        return this.RUSH_HOUR_MULTIPLIER;
      }
    }
    return 1.0;
  }

  // ─── Weather Surcharge ───────────────────────────────────
  private async getWeatherMultiplier(lat: number, lng: number): Promise<number> {
    try {
      const apiKey = "e3238768c07b4d77897565c7bb6a42b5";
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`;
      const res = await fetch(url);
      const data = (await res.json()) as any;

      if (data.weather?.length > 0) {
        const condition = data.weather[0].main as string;
        const description = (data.weather[0].description as string).toLowerCase();

        // Heavy rain / storm → +30%
        if (
          condition === "Thunderstorm" ||
          condition === "Rain" ||
          condition === "Drizzle" ||
          description.includes("mưa") ||
          description.includes("rain")
        ) {
          this.logger.log(`Weather: ${condition}, applying rain surcharge x1.3`);
          return 1.3;
        }

        // Snow / extreme → +50%
        if (condition === "Snow" || condition === "Extreme") {
          this.logger.log(`Weather: ${condition}, applying extreme surcharge x1.5`);
          return 1.5;
        }

        // Fog / mist → +10%
        if (
          condition === "Fog" ||
          condition === "Mist" ||
          condition === "Haze"
        ) {
          this.logger.log(`Weather: ${condition}, applying fog surcharge x1.1`);
          return 1.1;
        }

        // Temperature extremes (>35°C or <10°C) → +15%
        if (data.main?.temp) {
          const temp = data.main.temp as number;
          if (temp > 35 || temp < 10) {
            this.logger.log(`Temperature: ${temp}°C, applying temp surcharge x1.15`);
            return 1.15;
          }
        }
      }
    } catch (err) {
      this.logger.warn("Weather API failed, using default multiplier", err);
    }
    return 1.0; // Normal weather
  }

  // ═════════════════════════════════════════════════════════
  // PUBLIC: Calculate Shipping Fee
  // ═════════════════════════════════════════════════════════
  async calculateFee(req: ShippingFeeRequest): Promise<ShippingFeeResponse> {
    // 1. Distance
    let distanceKm = await this.getOSRMDistance(
      req.originLat,
      req.originLng,
      req.destLat,
      req.destLng,
    );

    if (distanceKm === null) {
      distanceKm = this.haversineKm(
        req.originLat,
        req.originLng,
        req.destLat,
        req.destLng,
      );
      this.logger.log(`OSRM failed, using Haversine: ${distanceKm.toFixed(2)} km`);
    } else {
      this.logger.log(`OSRM distance: ${distanceKm.toFixed(2)} km`);
    }

    // 2. Base + Distance fees
    const distanceFee = Math.round(distanceKm * this.PER_KM_RATE);
    const rawFee = this.BASE_FEE + distanceFee;

    // 3. Rush hour surcharge
    const rushMultiplier = this.getRushHourMultiplier();
    const feeAfterRush = Math.round(rawFee * rushMultiplier);

    // 4. Weather surcharge (based on destination coordinates)
    const weatherMultiplier = await this.getWeatherMultiplier(
      req.destLat,
      req.destLng,
    );
    const totalFee = Math.round(feeAfterRush * weatherMultiplier);

    // 5. Clamp to min/max
    const finalFee = Math.max(this.MIN_FEE, Math.min(this.MAX_FEE, totalFee));

    const breakdown = {
      baseFee: this.BASE_FEE,
      distanceFee,
      rushHourMultiplier: rushMultiplier,
      weatherMultiplier,
      total: finalFee,
    };

    this.logger.log(
      `Shipping fee: ${finalFee.toLocaleString("vi-VN")}đ ` +
        `(${distanceKm.toFixed(1)}km, rush=${rushMultiplier}x, weather=${weatherMultiplier}x)`,
    );

    return {
      distanceKm: Math.round(distanceKm * 10) / 10, // 1 decimal
      baseFee: this.BASE_FEE,
      distanceFee,
      rushHourSurcharge: feeAfterRush - rawFee,
      weatherSurcharge: totalFee - feeAfterRush,
      totalFee: finalFee,
      breakdown,
    };
  }
}