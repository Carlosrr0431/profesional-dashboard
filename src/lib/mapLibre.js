/** Config de mapa para componentes cliente (sin imports de Node). */

const { buildCartoRasterStyle } = require('../../shared/geo/hybridMapStyle');

/** Carto Voyager — estilo vectorial oficial (MapLibre GL). */
export const CARTO_VOYAGER_STYLE =
  'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

/** Carto Voyager raster — fallback inline si hace falta un style object local. */
export const CARTO_RASTER_STYLE = buildCartoRasterStyle({ maxZoom: 19 });

/** Estilo activo del dashboard: Carto Voyager. */
export const MAP_STYLE = CARTO_VOYAGER_STYLE;

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
