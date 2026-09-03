"use client";

// MapView phải nạp client-only: MapLibre cần WebGL + `window`, import tĩnh sẽ
// làm vỡ SSR của trang dùng component này.
import dynamic from "next/dynamic";

const MapView = dynamic(
  () => import("@mythfood/frontend-shared/components/MapView"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] w-full animate-pulse rounded-lg bg-gray-100" />
    ),
  },
);

interface DeliveryMapProps {
  lat: number;
  lng: number;
  address: string;
  onLocationSelect: (lat: number, lng: number) => void;
}

export default function DeliveryMap({
  lat,
  lng,
  address,
  onLocationSelect,
}: DeliveryMapProps) {
  return (
    <MapView
      locations={[
        {
          latitude: lat,
          longitude: lng,
          label: "📍 Vị trí giao hàng",
          address,
        },
      ]}
      interactive
      height="300px"
      onLocationSelect={onLocationSelect}
    />
  );
}
