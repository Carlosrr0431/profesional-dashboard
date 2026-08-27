import { spaJson } from './api';
import { isPickupInActiveZones } from './coverage';

let zonesCache = null;
let zonesAt = 0;
const ZONES_TTL_MS = 5 * 60 * 1000;

export async function fetchAutocomplete(query, sessionToken) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ q, limit: '6' });
  if (sessionToken) params.set('sessionToken', sessionToken);
  const { ok, data } = await spaJson(`/api/geo/autocomplete?${params}`);
  if (!ok || !data?.ok) return [];
  return Array.isArray(data.data) ? data.data : [];
}

export async function geocodePlace(hit) {
  const params = new URLSearchParams();
  if (hit?.placeId) params.set('placeId', hit.placeId);
  if (hit?.formattedAddress || hit?.address) {
    params.set('formattedAddress', hit.formattedAddress || hit.address);
    params.set('address', hit.formattedAddress || hit.address);
  }
  if (hit?.title) params.set('title', hit.title);
  if (hit?.subtitle) params.set('subtitle', hit.subtitle);
  if (hit?.sessionToken) params.set('sessionToken', hit.sessionToken);

  const { ok, data } = await spaJson(`/api/geo/geocode?${params}`);
  if (!ok || !data?.ok || !data.data) {
    throw new Error(data?.error || 'No se pudo ubicar esa dirección en Salta Capital.');
  }
  return {
    address: data.data.formattedAddress || hit.title || hit.formattedAddress,
    lat: Number(data.data.lat),
    lng: Number(data.data.lng),
    placeId: data.data.placeId || hit.placeId || null,
  };
}

export async function reverseGeocode(lat, lng) {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  const { ok, data } = await spaJson(`/api/geo/reverse?${params}`);
  if (!ok || !data?.ok) return null;
  return {
    address: data.data.formattedAddress,
    lat: Number(data.data.lat ?? lat),
    lng: Number(data.data.lng ?? lng),
    placeId: data.data.placeId || null,
  };
}

export async function fetchRouteMetrics(origin, dest) {
  const params = new URLSearchParams({
    originLat: String(origin.lat),
    originLng: String(origin.lng),
    destLat: String(dest.lat),
    destLng: String(dest.lng),
  });
  const { ok, data } = await spaJson(`/api/geo/route-metrics?${params}`);
  if (!ok || !data?.ok) return null;
  return data.data || null;
}

export async function fetchRouteLine(origin, dest) {
  const params = new URLSearchParams({
    originLat: String(origin.lat),
    originLng: String(origin.lng),
    destLat: String(dest.lat),
    destLng: String(dest.lng),
    steps: 'true',
  });
  const { ok, data } = await spaJson(`/api/geo/directions?${params}`);
  if (!ok) return null;
  const coords = data?.data?.polylineCoords || data?.polylineCoords || [];
  if (!Array.isArray(coords) || coords.length < 2) return null;
    return coords.map((point) => {
      if (Array.isArray(point)) return [Number(point[0]), Number(point[1])];
      const lat = Number(point?.lat ?? point?.latitude);
      const lng = Number(point?.lng ?? point?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return [lng, lat];
      return null;
    }).filter(Boolean);
}

export async function fetchActiveServiceZones() {
  const now = Date.now();
  if (zonesCache && now - zonesAt < ZONES_TTL_MS) return zonesCache;
  const { ok, data } = await spaJson('/api/service-zones');
  const rows = ok && data?.ok ? (data.data || []) : [];
  zonesCache = rows.filter((zone) => zone?.is_active !== false);
  zonesAt = now;
  return zonesCache;
}

export async function isPickupCovered(lat, lng) {
  const zones = await fetchActiveServiceZones();
  return isPickupInActiveZones(zones, lat, lng);
}

export function suggestionLabel(hit) {
  return hit?.title || hit?.formattedAddress || hit?.address || '';
}

export function suggestionSub(hit) {
  return hit?.subtitle || hit?.formattedAddress || '';
}

export function newPlacesSessionToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
