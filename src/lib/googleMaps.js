/**
 * @deprecated Google Maps eliminado — usar mapLibre.js y geo/index.js
 */
export { MAP_STYLE_URL as GOOGLE_MAPS_KEY } from './mapLibre';
export { MAP_STYLE_URL, DEFAULT_MAP_VIEW, mapLibreOptions } from './mapLibre';

export function useGoogleMapsLoader() {
  return { isLoaded: true, loadError: null };
}

export function isGoogleMapsPlacesReady() {
  return true;
}

export const GOOGLE_MAPS_LIBRARIES = [];
