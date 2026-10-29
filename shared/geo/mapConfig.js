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

/** Centro del pueblo, para no usar la calle homónima de Capital. */
const LOCALITY_CENTROID = {
  vaqueros: [-24.69648, -65.41062],
  'san lorenzo': [-24.73123, -65.48631],
  'rosario de lerma': [-24.98583, -65.57840],
  'campo quijano': [-24.90813, -65.64298],
  'la caldera': [-24.60269, -65.38064],
  cerrillos: [-24.89581, -65.48714],
  'la silleta': [-24.87498, -65.59048],
  chicoana: [-25.10267, -65.53505],
  'el carril': [-25.07667, -65.48924],
  'la merced': [-24.96695, -65.48901],
  cafayate: [-26.07304, -65.97598],
  animana: [-25.96948, -65.94900],
  'san carlos': [-25.89317, -65.92906],
  'la vina': [-25.46812, -65.56556],
  guachipas: [-25.52265, -65.51003],
  'coronel moldes': [-25.28004, -65.47846],
  tolombon: [-26.18271, -65.93981],
  'campo santo': [-24.68297, -65.10494],
  'general guemes': [-24.67445, -65.04660],
};

const SALTA_CITY_CENTER = [-24.7821, -65.4232];
const NAMED_LOCALITY_RADIUS_KM = 8;

function kmBetween(lat, lng, centroid) {
  const toRad = Math.PI / 180;
  const dLat = (centroid[0] - lat) * toRad;
  const dLng = (centroid[1] - lng) * toRad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat * toRad) * Math.cos(centroid[0] * toRad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function coordsAllowedForQuery(lat, lng, query = '') {
  if (!isWithinServiceArea(lat, lng)) return false;
  const key = matchedCoveredLocality(query);
  if (!key) return isWithinSaltaCapital(lat, lng);
  const centroid = LOCALITY_CENTROID[key];
  if (!centroid) return true;
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  const toTown = kmBetween(parsedLat, parsedLng, centroid);
  const toCapital = kmBetween(parsedLat, parsedLng, SALTA_CITY_CENTER);
  if (toTown > NAMED_LOCALITY_RADIUS_KM) return false;
  return toTown + 0.8 < toCapital;
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
