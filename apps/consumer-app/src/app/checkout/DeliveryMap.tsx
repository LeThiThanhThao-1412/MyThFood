'use client';

import { MapView } from '@mythfood/frontend-shared';

interface DeliveryMapProps {
  lat: number;
  lng: number;
  address: string;
  onLocationSelect: (lat: number, lng: number) => void;
}

export default function DeliveryMap({ lat, lng, address, onLocationSelect }: DeliveryMapProps) {
  return (
    <MapView
      locations={[
        {
          latitude: lat,
          longitude: lng,
          label: '📍 Vị trí giao hàng',
          address,
        },
      ]}
      interactive
      height="300px"
      onLocationSelect={onLocationSelect}
    />
  );
}