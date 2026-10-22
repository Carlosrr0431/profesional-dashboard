'use client';

import { memo, useMemo } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import { MAP_LANDMARKS } from '../lib/mapLandmarks';

const HOSPITAL_CROSS = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M5 1h2v4h4v2H7v4H5V7H1V5h4z" fill="#fff"/></svg>';

function landmarkIcon(place) {
  const hospital = place.kind === 'hospital';
  const color = hospital ? '#DC2626' : '#C2410C';
  const glyph = hospital
    ? HOSPITAL_CROSS
    : `<span style="font-size:11px;font-weight:800;line-height:1">${place.glyph || ''}</span>`;

  return L.divIcon({
    className: 'fleet-map-pin',
    iconSize: [168, 26],
    iconAnchor: [13, 13],
    html: `<div style="display:flex;align-items:center;gap:5px;pointer-events:none;white-space:nowrap">
      <span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:999px;background:${color};color:#fff;border:2px solid #fff;box-shadow:0 1px 5px rgba(15,23,42,.45)">${glyph}</span>
      <span style="font-size:13px;font-weight:800;letter-spacing:-.01em;color:${color};text-shadow:-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,1px 1px 0 #fff,0 0 6px #fff">${place.label}</span>
    </div>`,
  });
}

const MapLandmarks = memo(function MapLandmarks() {
  const icons = useMemo(
    () => new Map(MAP_LANDMARKS.map((place) => [place.id, landmarkIcon(place)])),
    [],
  );

  return MAP_LANDMARKS.map((place) => (
    <Marker
      key={place.id}
      position={[place.lat, place.lng]}
      icon={icons.get(place.id)}
      interactive={false}
      keyboard={false}
      zIndexOffset={120}
    />
  ));
});

export default MapLandmarks;
