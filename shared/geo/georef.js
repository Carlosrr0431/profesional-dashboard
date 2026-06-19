/**
 * Georef Argentina — normalización de direcciones oficiales (calle + altura).
 * @see https://www.argentina.gob.ar/georef/normalizacion-de-direcciones
 * @see https://apis.datos.gob.ar/georef/api/direcciones
 */

const { readGeorefBaseUrl } = require('./mapConfig');
const { pickPrimaryHouseNumber } = require('../salta-address');

const GEOREF_TIMEOUT_MS = 8000;

function parseCoordinate(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function buildGeorefPlaceId(item, query) {
  const q = String(query || item?.nomenclatura || '').trim();
  if (!q) {
    const lat = parseCoordinate(item?.ubicacion?.lat);
    const lng = parseCoordinate(item?.ubicacion?.lon);
    if (lat != null && lng != null) {
      return `georef:${lat.toFixed(7)},${lng.toFixed(7)}`;
    }
    return 'georef:unknown';
  }
  return `georef:q:${encodeURIComponent(q)}`;
}

/**
 * Mapea una dirección Georef al formato interno usado por Nominatim.
 */
function mapGeorefDireccion(item, query = '') {
  const lat = parseCoordinate(item?.ubicacion?.lat);
  const lng = parseCoordinate(item?.ubicacion?.lon);
  if (lat === null || lng === null) return null;

  const houseNumber = item?.altura?.valor;
  const road = String(item?.calle?.nombre || '').trim();
  const nomenclatura = String(item?.nomenclatura || '').trim();

  return {
    lat,
    lng,
    formattedAddress: nomenclatura,
    placeId: buildGeorefPlaceId(item, query),
    importance: 1,
    osmClass: 'georef',
    osmType: 'address',
    address: {
      road,
      house_number: houseNumber != null ? String(houseNumber) : '',
      city: item?.localidad_censal?.nombre || 'Salta',
      state: item?.provincia?.nombre || 'Salta',
    },
  };
}

async function fetchGeorefDirecciones(query, { max = 3 } = {}) {
  const direccion = String(query || '').trim();
  if (!direccion || direccion.length < 3) return [];

  const baseUrl = readGeorefBaseUrl();
  const params = new URLSearchParams({
    direccion,
    provincia: 'Salta',
    departamento: 'Capital',
    localidad: 'Salta',
    max: String(Math.max(1, Math.min(max, 5))),
  });

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), GEOREF_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(`${baseUrl}/direcciones?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    });

    if (!response.ok) return [];

    const data = await response.json();
    return Array.isArray(data?.direcciones) ? data.direcciones : [];
  } catch {
    return [];
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Busca direcciones con altura en Georef (Salta Capital).
 * Solo tiene sentido cuando el query incluye número de calle.
 */
async function searchGeorefAddress(query, max = 3) {
  const trimmed = String(query || '').trim();
  if (!trimmed || pickPrimaryHouseNumber(trimmed) == null) return [];

  const hits = await fetchGeorefDirecciones(trimmed, { max });
  return hits
    .map((item) => mapGeorefDireccion(item, trimmed))
    .filter(Boolean);
}

/**
 * Resuelve un placeId generado por Georef (re-consulta si hace falta).
 */
async function resolveGeorefPlaceId(placeId) {
  const id = String(placeId || '').trim();
  if (!id.startsWith('georef:')) return null;

  if (id.startsWith('georef:q:')) {
    const query = decodeURIComponent(id.slice('georef:q:'.length));
    const hits = await searchGeorefAddress(query, 1);
    return hits[0] || null;
  }

  const coordMatch = id.match(/^georef:(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
  if (coordMatch) {
    const lat = parseCoordinate(coordMatch[1]);
    const lng = parseCoordinate(coordMatch[2]);
    if (lat != null && lng != null) {
      return { lat, lng, formattedAddress: `${lat}, ${lng}`, placeId: id, address: {} };
    }
  }

  return null;
}

module.exports = {
  mapGeorefDireccion,
  fetchGeorefDirecciones,
  searchGeorefAddress,
  resolveGeorefPlaceId,
};
