/** Config de mapa para componentes cliente (sin imports de Node). */

const googleMapsLikeStyle = require('./map-styles/googleMapsLike.json');

/**
 * Estilo vectorial personalizado (paleta tipo Google Maps) sobre tiles OpenFreeMap.
 */
export const GOOGLE_MAPS_LIKE_STYLE = googleMapsLikeStyle;

/** OpenFreeMap Liberty — respaldo vectorial. */
export const OPENFREEMAP_LIBERTY_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const GOOGLE_ROADMAP_SUBDOMAINS = ['mt0', 'mt1', 'mt2', 'mt3'];

/**
 * Mapa de calles de Google (lyrs=m), el mismo tileLayer usado en producción.
 * MapLibre no tiene L.tileLayer; el estilo raster es el equivalente.
 */
export const GOOGLE_ROADMAP_STYLE = {
  version: 8,
  sources: {
    'google-roadmap': {
      type: 'raster',
      tiles: GOOGLE_ROADMAP_SUBDOMAINS.map(
        (sub) => `https://${sub}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}`,
      ),
      tileSize: 256,
      maxzoom: 20,
      attribution: '© Google Maps',
    },
  },
  layers: [
    {
      id: 'google-roadmap',
      type: 'raster',
      source: 'google-roadmap',
    },
  ],
};

const envStyleUrl = typeof process !== 'undefined'
  ? process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim()
  : '';

/**
 * Estilo del mapa en producción: teselas de Google Maps.
 * Una URL en NEXT_PUBLIC_MAP_STYLE_URL sigue teniendo prioridad.
 */
export const MAP_STYLE = envStyleUrl || GOOGLE_ROADMAP_STYLE;

/** @deprecated Usar MAP_STYLE — alias para compatibilidad. */
export const MAP_STYLE_URL = MAP_STYLE;

export const DEFAULT_MAP_VIEW = {
  longitude: -65.4122,
  latitude: -24.7829,
  zoom: 13,
};

export const mapLibreOptions = {
  attributionControl: true,
  maxZoom: 20,
  maxPitch: 0,
  cooperativeGestures: false,
  fadeDuration: 0,
  maxTileCacheSize: 120,
  collectResourceTiming: false,
  refreshExpiredTiles: false,
};
