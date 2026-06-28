/** Estilo de mapa claro (menos ruido visual, similar a apps de movilidad). */
export const PASSENGER_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#EEF1F5' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7B8798' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E3E8EF' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#F5F7FA' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#D7DEE8' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#C5DAF2' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#E8EBF0' }] },
];

/** Azul de ruta activa (estilo Google Maps). */
export const ROUTE_LINE = '#4285F4';
export const ROUTE_CASING = '#FFFFFF';
export const ROUTE_OUTLINE = '#1A56C4';

/** Ruta en planificación (home, revisión antes de confirmar) — estilo Google Maps. */
export const ROUTE_PREVIEW_STYLE = {
  lineColor: '#4285F4',
  casingColor: '#FFFFFF',
  outlineColor: 'rgba(26, 86, 196, 0.28)',
  outlineWidth: 14,
  casingWidth: 12,
  lineWidth: 8,
};

/** Ruta activa durante el viaje. */
export const ROUTE_ACTIVE_STYLE = {
  lineColor: ROUTE_LINE,
  casingColor: ROUTE_CASING,
  outlineColor: ROUTE_OUTLINE,
  outlineWidth: 14,
  casingWidth: 10,
  lineWidth: 7,
};
