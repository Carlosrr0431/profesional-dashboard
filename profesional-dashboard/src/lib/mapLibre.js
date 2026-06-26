/** Config de mapa para componentes cliente (sin imports de Node). */

const { buildCartoRasterStyle } = require('../../shared/geo/hybridMapStyle');

/** Carto Voyager raster — estable en navegador (sin overlay vectorial OpenFreeMap). */
export const CARTO_RASTER_STYLE = buildCartoRasterStyle({ maxZoom: 19 });

const envStyleUrl = typeof process !== 'undefined'
  ? process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim()
  : '';

/**
 * Estilo del mapa: URL externa si está configurada; si no, Carto raster local.
 */
export const MAP_STYLE = envStyleUrl || CARTO_RASTER_STYLE;

/** @deprecated Usar MAP_STYLE — alias para compatibilidad. */
export const MAP_STYLE_URL = MAP_STYLE;

export const DEFAULT_MAP_VIEW = {
  longitude: -65.4122,
  latitude: -24.7829,
  zoom: 13,
};

export const mapLibreOptions = {
  attributionControl: false,
  maxPitch: 0,
  cooperativeGestures: false,
};
