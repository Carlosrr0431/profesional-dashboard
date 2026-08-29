/** Config de mapa para componentes cliente (sin imports de Node). */

const googleMapsLikeStyle = require('./map-styles/googleMapsLike.json');

/**
 * Estilo vectorial personalizado (paleta tipo Google Maps) sobre tiles OpenFreeMap.
 */
export const GOOGLE_MAPS_LIKE_STYLE = googleMapsLikeStyle;

/** OpenFreeMap Liberty — respaldo vectorial. */
export const OPENFREEMAP_LIBERTY_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const envStyleUrl = typeof process !== 'undefined'
  ? process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim()
  : '';

/**
 * Estilo del mapa: URL de env → Google Maps-like personalizado.
 */
export const MAP_STYLE = envStyleUrl || GOOGLE_MAPS_LIKE_STYLE;

/** @deprecated Usar MAP_STYLE — alias para compatibilidad. */
export const MAP_STYLE_URL = MAP_STYLE;

export const DEFAULT_MAP_VIEW = {
  longitude: -65.4122,
  latitude: -24.7829,
  zoom: 13,
};

export const mapLibreOptions = {
  attributionControl: true,
  maxPitch: 0,
  cooperativeGestures: false,
  fadeDuration: 0,
  maxTileCacheSize: 120,
  collectResourceTiming: false,
  refreshExpiredTiles: false,
};
