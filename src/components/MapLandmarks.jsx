'use client';

import { memo, useMemo } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import { MAP_LANDMARKS } from '../lib/mapLandmarks';

const KIND_COLOR = {
  hospital: '#DC2626',
  school: '#1D4ED8',
  plaza: '#15803D',
  shop: '#6D28D9',
  culture: '#0F766E',
  sport: '#B45309',
  transport: '#C2410C',
};

const HOSPITAL_CROSS = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M5 1h2v4h4v2H7v4H5V7H1V5h4z" fill="#fff"/></svg>';
const SCHOOL_MARK = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 3.2h4.1c.4 0 .9.3.9.8v6c0-.5-.4-.8-.9-.8H1V3.2zm10 0H6.9c-.5 0-.9.3-.9.8v6c0-.5.4-.8.9-.8H11V3.2z" fill="#fff"/></svg>';
const PLAZA_MARK = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="4" r="2.1" fill="#fff"/><path d="M6 6.1V10M3.2 10h5.6" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg>';

function landmarkGlyph(place) {
  if (place.kind === 'hospital') return HOSPITAL_CROSS;
  if (place.kind === 'school') return SCHOOL_MARK;
  if (place.kind === 'plaza') return PLAZA_MARK;
  const letter = place.glyph || (place.kind === 'shop' ? 'S' : place.kind === 'sport' ? '●' : '•');
  return `<span style="font-size:11px;font-weight:800;line-height:1">${letter}</span>`;
}

function landmarkIcon(place) {
  const color = KIND_COLOR[place.kind] || '#0F172A';
  const left = place.labelSide === 'left';
  return L.divIcon({
    className: 'fleet-map-pin',
    iconSize: [168, 24],
    iconAnchor: left ? [155, 12] : [12, 12],
    html: `<div style="display:flex;align-items:center;gap:4px;pointer-events:none;white-space:nowrap;flex-direction:${left ? 'row-reverse' : 'row'}">
      <span style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:999px;background:${color};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(15,23,42,.4)">${landmarkGlyph(place)}</span>
      <span style="font-size:12px;font-weight:800;letter-spacing:-.01em;color:${color};text-shadow:-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,1px 1px 0 #fff,0 0 6px #fff">${place.label}</span>
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
