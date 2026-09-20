import { isCoordLikeAddress } from '../../shared/trip-contract.js';
import { reverseGeocode } from './geo/index.js';

export function formatCoordAddress(lat, lng) {
  return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
}

export function preferStreetAddress(address, lat, lng) {
  const text = String(address || '').trim();
  if (text && !isCoordLikeAddress(text)) return text;
  return formatCoordAddress(lat, lng);
}

/** Reverse-geocodifica GPS a calle y altura. Si falla, deja las coordenadas. */
export async function resolveGpsStreetAddress(lat, lng) {
  const fallback = formatCoordAddress(lat, lng);
  try {
    const resolved = await reverseGeocode(lat, lng);
    return preferStreetAddress(resolved, lat, lng);
  } catch {
    return fallback;
  }
}
