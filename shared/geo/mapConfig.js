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

/** Valle, para no mezclar “Güemes 700” con otra localidad si el pedido no la nombra. */
const SALTA_VIEWBOX = '-65.72,-25.15,-65.25,-24.55';
/**
 * Municipios cercanos: valle de Lerma, Güemes y el camino hasta Cafayate.
 * No llega a Orán ni a Tartagal.
 * Formato Nominatim: oeste,sur,este,norte.
 */
const SALTA_NEARBY_VIEWBOX = '-66.10,-26.22,-64.90,-24.45';
const SALTA_COUNTRY = 'ar';

const SALTA_CAPITAL_BOUNDS = {
  north: -24.70,
  south: -24.90,
  east: -65.30,
  west: -65.55,
};

/** Misma zona que SALTA_NEARBY_VIEWBOX. */
const SALTA_SERVICE_BOUNDS = {
  north: -24.45,
  south: -26.22,
  east: -64.90,
  west: -66.10,
};

const COVERED_LOCALITY_RE = /\b(vaqueros|san lorenzo|rosario de lerma|campo quijano|la caldera|lesser|cerrillos|la silleta|chicoana|el carril|la merced|cafayate|animana|san carlos|la vina|guachipas|coronel moldes|alemania|tolombon|campo santo|general guemes)\b/i;

const GEOREF_LOCALITY_BY_KEY = {
  vaqueros: 'Vaqueros',
  'san lorenzo': 'San Lorenzo',
  'rosario de lerma': 'Rosario de Lerma',
  'campo quijano': 'Campo Quijano',
  'la caldera': 'La Caldera',
  lesser: 'Lesser',
  cerrillos: 'Cerrillos',
  'la silleta': 'La Silleta',
  chicoana: 'Chicoana',
  'el carril': 'El Carril',
  'la merced': 'La Merced',
  cafayate: 'Cafayate',
  animana: 'Animaná',
  'san carlos': 'San Carlos',
  'la vina': 'La Viña',
  guachipas: 'Guachipas',
  'coronel moldes': 'Coronel Moldes',
  alemania: 'Alemania',
  tolombon: 'Tolombón',
  'campo santo': 'Campo Santo',
  'general guemes': 'General Güemes',
};

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

/** Un 0,0 es el vacío de la base, no una esquina de Salta. */
function hasUsableGeoPoint(lat, lng) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return false;
  if (Math.abs(parsedLat) < 0.0001 && Math.abs(parsedLng) < 0.0001) return false;
  return parsedLat <= 0 && parsedLat >= -56 && parsedLng <= -50 && parsedLng >= -75;
}

function omitUnusablePin(item) {
  if (!item || typeof item !== 'object') return item;
  if (hasUsableGeoPoint(item.lat, item.lng)) return item;
  if (item.lat == null && item.lng == null) return item;
  const next = { ...item };
  delete next.lat;
  delete next.lng;
  return next;
}

function foldGeoText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Localidad de la provincia nombrada en el texto. “Güemes 700” no cuenta: es la calle. */
function matchedCoveredLocality(value) {
  const text = foldGeoText(value);
  if (/\bgeneral guemes\b/.test(text)) return 'general guemes';
  if (/\bguemes\b/.test(text) && !/\d/.test(text)) return 'general guemes';
  const match = text.match(COVERED_LOCALITY_RE);
  if (!match) return '';
  return match[1].replace(/\s+/g, ' ').trim();
}

function queryNamesCoveredLocality(value) {
  return Boolean(matchedCoveredLocality(value));
}

/** Si el pedido nombra una de estas, un pin del casco no sirve. */
const OUTSIDE_CAPITAL_LOCALITY = new Set([
  'cafayate',
  'animana',
  'san carlos',
  'la vina',
  'guachipas',
  'coronel moldes',
  'alemania',
  'tolombon',
  'campo santo',
  'general guemes',
]);

function namedLocalityIsOutsideCapital(value) {
  return OUTSIDE_CAPITAL_LOCALITY.has(matchedCoveredLocality(value));
}

function georefLocalityName(value) {
  const key = matchedCoveredLocality(value).replace(/\s+/g, ' ');
  return GEOREF_LOCALITY_BY_KEY[key] || '';
}

function viewboxForQuery(query) {
  return matchedCoveredLocality(query) ? SALTA_NEARBY_VIEWBOX : SALTA_VIEWBOX;
}

function coordsAllowedForQuery(lat, lng, query = '') {
  if (!isWithinServiceArea(lat, lng)) return false;
  if (matchedCoveredLocality(query)) return true;
  return isWithinSaltaCapital(lat, lng);
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
  SALTA_NEARBY_VIEWBOX,
  SALTA_COUNTRY,
  SALTA_CAPITAL_BOUNDS,
  SALTA_SERVICE_BOUNDS,
  isWithinSaltaCapital,
  isWithinServiceArea,
  hasUsableGeoPoint,
  omitUnusablePin,
  matchedCoveredLocality,
  queryNamesCoveredLocality,
  namedLocalityIsOutsideCapital,
  georefLocalityName,
  viewboxForQuery,
  coordsAllowedForQuery,
  GEOREF_BASE_URL,
  readGeorefBaseUrl,
};
