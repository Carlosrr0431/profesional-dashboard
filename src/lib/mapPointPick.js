import { isWithinSaltaCapital } from './constants';

export const MAP_PICK_SOURCE = 'map_pick';

export function extractMapClickLngLat(event) {
  const lngLat = event?.lngLat || event?.lnglat || null;
  const latitude = Number(lngLat?.lat ?? event?.latitude ?? event?.lat);
  const longitude = Number(lngLat?.lng ?? event?.longitude ?? event?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

export function formatPickedCoordsLabel(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

export function validateMapPickInSalta(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, message: 'No se pudo leer el punto del mapa.' };
  }
  if (!isWithinSaltaCapital(latitude, longitude)) {
    return { ok: false, message: 'El punto debe estar dentro de Salta Capital.' };
  }
  return { ok: true, latitude, longitude };
}

export function buildMapPickedPlace({ lat, lng, reverse = null }) {
  const coordsLabel = formatPickedCoordsLabel(lat, lng);
  const formattedAddress = String(reverse?.formattedAddress || '').trim() || coordsLabel;
  const title = String(reverse?.title || '').trim() || formattedAddress.split(',')[0] || coordsLabel;
  return {
    lat: Number(lat),
    lng: Number(lng),
    formattedAddress,
    title,
    subtitle: String(reverse?.subtitle || '').trim(),
    placeId: String(reverse?.placeId || '').trim(),
    geocodeSource: MAP_PICK_SOURCE,
  };
}

export function mapPickModeLabel(mode) {
  if (mode === 'origin') return 'Tocá el mapa para marcar el origen';
  if (mode === 'dest') return 'Tocá el mapa para marcar el destino';
  return '';
}

export function geocodeSourceBadge(source) {
  if (source === 'supabase_cache') {
    return { label: 'cache BD', title: 'Coordenadas desde cache en base de datos', tone: 'cache' };
  }
  if (source === MAP_PICK_SOURCE) {
    return { label: 'Mapa GPS', title: 'Punto marcado a mano en el mapa', tone: 'map' };
  }
  if (source) {
    return { label: 'Google', title: 'Coordenadas desde Google Place Details Essentials', tone: 'google' };
  }
  return null;
}
