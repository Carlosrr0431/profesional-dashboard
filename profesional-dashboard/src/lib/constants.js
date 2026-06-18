export const MAP_ID = 'light-map';

export const SALTA_CENTER = {
  lat: -24.7821,
  lng: -65.4232,
};

/** Respaldo si no hay chofer en BD (driver_number 2 por defecto). */
export const EMULATOR_GPS_DEFAULT_ORIGIN = {
  lat: -24.7804933,
  lng: -65.419865,
};

/** Rectángulo de Salta Capital (mismo que Agente_IA / TripAssignModal). */
export const SALTA_CAPITAL_BOUNDS = {
  north: -24.68,
  south: -24.88,
  east: -65.33,
  west: -65.48,
};

/** Bounds para geocode REST: suroeste|noroeste (lat,lng|lat,lng). */
export const SALTA_CAPITAL_GEOCODE_BOUNDS = `${SALTA_CAPITAL_BOUNDS.south},${SALTA_CAPITAL_BOUNDS.west}|${SALTA_CAPITAL_BOUNDS.north},${SALTA_CAPITAL_BOUNDS.east}`;

export function isWithinSaltaCapital(lat, lng) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return false;
  return (
    parsedLat <= SALTA_CAPITAL_BOUNDS.north
    && parsedLat >= SALTA_CAPITAL_BOUNDS.south
    && parsedLng <= SALTA_CAPITAL_BOUNDS.east
    && parsedLng >= SALTA_CAPITAL_BOUNDS.west
  );
}

export const SALTA_CAPITAL_AUTOCOMPLETE_OPTIONS = {
  componentRestrictions: { country: 'ar' },
  fields: ['formatted_address', 'geometry', 'name', 'place_id', 'vicinity', 'types'],
  bounds: SALTA_CAPITAL_BOUNDS,
  strictBounds: true,
};

export const DEFAULT_ZOOM = 13;

export const LIGHT_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#F0F1F5' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#64748B' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E2E8F0' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#F8FAFC' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#CBD5E1' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#C9DCF0' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#D5EDDA' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#CBD5E1' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#475569' }] },
];

// SVG car icon for map markers (minimal sedan silhouette)
export const CAR_ICON_SVG = 'M17.5 5H6.5C5.17 5 4.08 5.93 3.83 7.19L3 12v6.5c0 .83.67 1.5 1.5 1.5S6 19.33 6 18.5V18h12v.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V12l-.83-4.81C19.92 5.93 18.83 5 17.5 5zM6.5 15C5.67 15 5 14.33 5 13.5S5.67 12 6.5 12 8 12.67 8 13.5 7.33 15 6.5 15zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1-4h12l1 4H5z';

// SVG motorcycle icon for map markers (minimal moto silhouette)
export const MOTO_ICON_SVG = 'M17 4h-2l-3.2 4H7.5C6.67 8 6 8.67 6 9.5S6.67 11 7.5 11H9l-1.48 3.06C6.68 14.02 5.89 14 5 14c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5c0-.68-.15-1.32-.39-1.91L12 13h1.5l2.12 2.83C15.23 16.5 15 17.22 15 18c0 2.76 2.24 5 5 5s5-2.24 5-5-2.24-5-5-5c-.32 0-.63.04-.94.1L17 10V4zM5 22c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm15 0c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z';
