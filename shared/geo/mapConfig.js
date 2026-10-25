/**
 * Configuración geoespacial (TomTom, tiles, georef local).
 * Compatible CommonJS — usado por dashboard, apps y tests.
 */

function readEnv(...keys) {
  if (typeof process === 'undefined' || !process.env) return '';
  for (const key of keys) {
    const value = String(process.env[key] || '').trim();
    if (value) return value;
  }
  return '';
}

const MAP_STYLE_URL = readEnv(
  'EXPO_PUBLIC_MAP_STYLE_URL',
  'NEXT_PUBLIC_MAP_STYLE_URL',
) || 'https://tiles.openfreemap.org/styles/liberty';

const TOMTOM_API_KEY = readEnv('TOMTOM_API_KEY');
const TOMTOM_LANGUAGE = 'es-419';
const TOMTOM_COUNTRY_SET = 'AR';
const TOMTOM_VIEW = 'AR';
const SALTA_CENTER_LAT = -24.78;
const SALTA_CENTER_LNG = -65.42;
const SALTA_SEARCH_RADIUS_M = 25000;

/** @deprecated Solo compatibilidad con tests antiguos */
const OSRM_BASE_URL = readEnv(
  'EXPO_PUBLIC_OSRM_URL',
  'OSRM_BASE_URL',
  'NEXT_PUBLIC_OSRM_URL',
) || 'https://profesional-osrm-production.up.railway.app';

/** Nominatim / OSM — direcciones calle + altura */
const NOMINATIM_BASE_URL = readEnv(
  'EXPO_PUBLIC_NOMINATIM_URL',
  'NOMINATIM_BASE_URL',
  'NEXT_PUBLIC_NOMINATIM_URL',
) || 'https://profesional-nominatim-production.up.railway.app';

const NOMINATIM_USER_AGENT = readEnv(
  'EXPO_PUBLIC_NOMINATIM_USER_AGENT',
  'NOMINATIM_USER_AGENT',
) || 'ProfesionalApp/1.0';

const NOMINATIM_SELF_HOSTED = readEnv(
  'EXPO_PUBLIC_NOMINATIM_SELF_HOSTED',
  'NOMINATIM_SELF_HOSTED',
) !== 'false';

/**
 * Places Autocomplete (New) se cobra por request (SKU Autocomplete Requests).
 * Queda apagado a propósito: calles y lugares salen de Georef y Nominatim.
 * No leer el env: un `true` en Vercel volvería a generar el gasto.
 */
const GOOGLE_POI_AUTOCOMPLETE_ENABLED = false;

/** Capital estricta, para no mezclar “Güemes 700” con otra localidad. */
const SALTA_VIEWBOX = '-65.72,-25.15,-65.25,-24.55';
const SALTA_COUNTRY = 'ar';

const SALTA_CAPITAL_BOUNDS = {
  north: -24.70,
  south: -24.90,
  east: -65.30,
  west: -65.55,
};

/** Valle de Salta: Vaqueros, La Caldera, San Lorenzo, Cerrillos, Campo Quijano, Rosario de Lerma. */
const SALTA_SERVICE_BOUNDS = {
  north: -24.55,
  south: -25.15,
  east: -65.25,
  west: -65.72,
};

const COVERED_LOCALITY_RE = /\b(vaqueros|san lorenzo|rosario de lerma|campo quijano|la caldera|lesser|cerrillos|la silleta|chicoana|el carril)\b/i;

function isInsideBounds(lat, lng, bounds) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return false;
  return (
    parsedLat <= bounds.north
    && parsedLat >= bounds.south
    && parsedLng <= bounds.east
    && parsedLng >= bounds.west
  );
}

function isWithinSaltaCapital(lat, lng) {
  return isInsideBounds(lat, lng, SALTA_CAPITAL_BOUNDS);
}

function isWithinServiceArea(lat, lng) {
  return isInsideBounds(lat, lng, SALTA_SERVICE_BOUNDS);
}

function queryNamesCoveredLocality(value) {
  return COVERED_LOCALITY_RE.test(String(value || ''));
}

function coordsAllowedForQuery(lat, lng, query = '') {
  if (isWithinSaltaCapital(lat, lng)) return true;
  return queryNamesCoveredLocality(query) && isWithinServiceArea(lat, lng);
}

const GEOREF_BASE_URL = readEnv(
  'EXPO_PUBLIC_GEOREF_URL',
  'GEOREF_BASE_URL',
  'NEXT_PUBLIC_GEOREF_URL',
) || 'https://apis.datos.gob.ar/georef/api/v2.0';

function readGeorefBaseUrl() {
  return GEOREF_BASE_URL.replace(/\/$/, '');
}

module.exports = {
  MAP_STYLE_URL,
  TOMTOM_API_KEY,
  TOMTOM_LANGUAGE,
  TOMTOM_COUNTRY_SET,
  TOMTOM_VIEW,
  SALTA_CENTER_LAT,
  SALTA_CENTER_LNG,
  SALTA_SEARCH_RADIUS_M,
  OSRM_BASE_URL,
  NOMINATIM_BASE_URL,
  NOMINATIM_USER_AGENT,
  NOMINATIM_SELF_HOSTED,
  GOOGLE_POI_AUTOCOMPLETE_ENABLED,
  SALTA_VIEWBOX,
  SALTA_COUNTRY,
  SALTA_CAPITAL_BOUNDS,
  SALTA_SERVICE_BOUNDS,
  isWithinSaltaCapital,
  isWithinServiceArea,
  queryNamesCoveredLocality,
  coordsAllowedForQuery,
  GEOREF_BASE_URL,
  readGeorefBaseUrl,
};
