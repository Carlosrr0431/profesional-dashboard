/**
 * Google Maps JS API desactivado en el dashboard:
 * la clave actual dispara ApiNotActivatedMapError
 * (hay que activar "Maps JavaScript API" en Google Cloud).
 * El mapa usa MapLibre.
 */
export const GOOGLE_MAPS_KEY = '';
export const GOOGLE_MAPS_LIBRARIES = [];

export function useGoogleMapsLoader() {
  return { isLoaded: false, loadError: null };
}

export function isGoogleMapsPlacesReady() {
  return false;
}
