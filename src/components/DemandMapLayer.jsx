'use client';

import { CircleMarker, Marker } from 'react-leaflet';
import L from 'leaflet';

const ZONE_COLOR = {
  alta: '#DC2626',
  media: '#F97316',
  baja: '#FACC15',
};

function zoneRadius(score) {
  const value = Math.max(1, Number(score) || 1);
  return Math.round(34 + Math.min(value, 16) * 2.4);
}

function scoreIcon(score, color, darkText) {
  return L.divIcon({
    className: 'demand-score-pin',
    html: `<span style="display:flex;align-items:center;justify-content:center;min-width:28px;height:28px;padding:0 6px;border-radius:999px;background:${color};color:${darkText ? '#713F12' : '#fff'};font:700 13px/1 Inter,system-ui,sans-serif;box-shadow:0 4px 12px rgba(15,23,42,.25)">${score}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function scheduledIcon(label) {
  const safe = String(label || 'Programado').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  return L.divIcon({
    className: 'demand-scheduled-pin',
    html: `<div style="display:flex;flex-direction:column;align-items:center"><span style="background:#6D28D9;color:#fff;font:700 11px/1.2 Inter,system-ui,sans-serif;padding:3px 7px;border-radius:999px;white-space:nowrap;box-shadow:0 4px 12px rgba(109,40,217,.35)">${safe}</span><span style="width:8px;height:8px;margin-top:3px;border-radius:999px;background:#6D28D9;border:2px solid #fff"></span></div>`,
    iconSize: [92, 36],
    iconAnchor: [46, 36],
  });
}

const queueIcon = L.divIcon({
  className: 'demand-queue-pin',
  html: '<span class="demand-queue-dot"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export default function DemandMapLayer({ summary, layers, onSelectScheduled }) {
  if (!summary) return null;

  return (
    <>
      {layers.zones ? summary.zones.map((zone) => (
        <CircleMarker
          key={`zone-${zone.rank}`}
          center={[zone.lat, zone.lng]}
          radius={zoneRadius(zone.score)}
          interactive={false}
          pathOptions={{
            color: ZONE_COLOR[zone.level] || ZONE_COLOR.baja,
            weight: 1.5,
            fillColor: ZONE_COLOR[zone.level] || ZONE_COLOR.baja,
            fillOpacity: 0.16,
          }}
        />
      )) : null}
      {layers.done ? summary.todayZones.map((zone) => (
        <CircleMarker
          key={`hoy-${zone.lat.toFixed(4)}-${zone.lng.toFixed(4)}`}
          center={[zone.lat, zone.lng]}
          radius={zoneRadius(zone.score) + 8}
          interactive={false}
          pathOptions={{
            color: '#15803D',
            weight: 2.5,
            fillColor: '#16A34A',
            fillOpacity: 0.22,
          }}
        />
      )) : null}
      {layers.zones ? summary.zones.map((zone) => (
        <Marker
          key={`zone-score-${zone.rank}`}
          position={[zone.lat, zone.lng]}
          interactive={false}
          icon={scoreIcon(zone.score, ZONE_COLOR[zone.level], zone.level === 'baja')}
        />
      )) : null}
      {layers.done ? summary.todayZones.map((zone) => (
        <Marker
          key={`hoy-score-${zone.lat.toFixed(4)}-${zone.lng.toFixed(4)}`}
          position={[zone.lat, zone.lng]}
          interactive={false}
          icon={scoreIcon(zone.score, '#15803D', false)}
        />
      )) : null}
      {layers.scheduled ? summary.scheduled.map((trip) => (
        <Marker
          key={`prog-${trip.lat.toFixed(5)}-${trip.lng.toFixed(5)}-${trip.at}`}
          position={[trip.lat, trip.lng]}
          icon={scheduledIcon(trip.label)}
          eventHandlers={{ click: () => onSelectScheduled?.(trip) }}
        />
      )) : null}
      {layers.queued ? summary.queued.map((trip) => (
        <Marker
          key={`cola-${trip.lat.toFixed(5)}-${trip.lng.toFixed(5)}-${trip.at}`}
          position={[trip.lat, trip.lng]}
          interactive={false}
          icon={queueIcon}
        />
      )) : null}
    </>
  );
}
