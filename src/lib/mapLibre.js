/** Config de mapa para componentes cliente (sin imports de Node). */

const { buildCartoRasterStyle } = require('../../shared/geo/hybridMapStyle');

/**
 * OpenFreeMap Liberty — estilo vectorial gratuito, estética cercana a Google Maps.
 * Carga más liviana al panear (vector) vs muchos PNG raster.
 */
export const OPENFREEMAP_LIBERTY_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/** Carto Voyager retina — fallback local si no hay URL externa. */
export const CARTO_RASTER_STYLE = buildCartoRasterStyle({ maxZoom: 19, retina: true });

const envStyleUrl = typeof process !== 'undefined'
  ? process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim()
  : '';

/**
 * Estilo del mapa: URL de env → OpenFreeMap Liberty → Carto retina.
 */
export const MAP_STYLE = envStyleUrl || OPENFREEMAP_LIBERTY_STYLE;

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
