'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix default marker icons in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export interface MapLocation {
  latitude: number;
  longitude: number;
  label?: string;
  address?: string;
}

interface MapViewProps {
  locations?: MapLocation[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  className?: string;
  interactive?: boolean;
  onLocationSelect?: (lat: number, lng: number) => void;
}

function MapClickHandler({ onLocationSelect, interactive }: { onLocationSelect?: (lat: number, lng: number) => void; interactive?: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!interactive || !onLocationSelect) return;
    const handler = (e: L.LeafletMouseEvent) => {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    };
    map.on('click', handler);
    return () => { map.off('click', handler); };
  }, [map, interactive, onLocationSelect]);
  return null;
}

export default function MapView({
  locations = [],
  center,
  zoom = 13,
  height = '400px',
  className = '',
  interactive = false,
  onLocationSelect,
}: MapViewProps) {
  const defaultCenter: [number, number] = center || (locations.length > 0
    ? [locations[0].latitude, locations[0].longitude]
    : [10.775, 106.7]);

  return (
    <div style={{ height }} className={`rounded-lg overflow-hidden border ${className}`}>
      <MapContainer
        center={defaultCenter}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {locations.map((loc, i) => (
          <Marker key={i} position={[loc.latitude, loc.longitude]}>
            {loc.label && (
              <Popup>
                <div className="text-sm">
                  <strong>{loc.label}</strong>
                  {loc.address && <p className="text-gray-500 text-xs mt-1">{loc.address}</p>}
                </div>
              </Popup>
            )}
          </Marker>
        ))}
        <MapClickHandler onLocationSelect={onLocationSelect} interactive={interactive} />
      </MapContainer>
    </div>
  );
}