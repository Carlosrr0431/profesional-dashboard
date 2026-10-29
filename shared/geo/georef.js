/**
 * Georef Argentina — normalización de direcciones oficiales (calle + altura).
 * @see https://www.argentina.gob.ar/georef/normalizacion-de-direcciones
 * @see https://apis.datos.gob.ar/georef/api/direcciones
 */

const {
  readGeorefBaseUrl,
  isWithinServiceArea,
  georefLocalityName,
  matchedCoveredLocality,
} = require('./mapConfig');
const { pickPrimaryHouseNumber } = require('../salta-address');

const GEOREF_TIMEOUT_MS = 8000;

function parseCoordinate(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function isValidArgentinaCoordinate(lat, lng) {
  if (lat == null || lng == null) return false;
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return false;
  return lat <= 0 && lat >= -60 && lng <= -50 && lng >= -75;
}

function buildGeorefPlaceId(item) {
  const lat = parseCoordinate(item?.ubicacion?.lat);
  const lng = parseCoordinate(item?.ubicacion?.lon);
  if (isValidArgentinaCoordinate(lat, lng)) {
    return `georef:${lat.toFixed(7)},${lng.toFixed(7)}`;
  }

  const nomenclatura = String(item?.nomenclatura || '').trim();
  if (nomenclatura) {
    return `georef:n:${encodeURIComponent(nomenclatura)}`;
  }

  return 'georef:unknown';
}

/**
 * Mapea una dirección Georef al formato interno usado por Nominatim.
 */
function mapGeorefDireccion(item, query = '') {
  const lat = parseCoordinate(item?.ubicacion?.lat);
  const lng = parseCoordinate(item?.ubicacion?.lon);
  if (!isValidArgentinaCoordinate(lat, lng)) return null;

  const houseNumber = item?.altura?.valor;
  const road = String(item?.calle?.nombre || '').trim();
  const nomenclatura = String(item?.nomenclatura || '').trim();

  return {
    lat,
    lng,
    formattedAddress: nomenclatura,
    placeId: buildGeorefPlaceId(item),
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

async function fetchGeorefCalles(nombre, { max = 8 } = {}) {
  const text = String(nombre || '').trim();
  if (text.length < 3) return [];

  const baseUrl = readGeorefBaseUrl();
  const params = new URLSearchParams({
    nombre: text,
    provincia: 'Salta',
    departamento: 'Capital',
    max: String(Math.max(1, Math.min(max, 10))),
    campos: 'estandar',
  });

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), GEOREF_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(`${baseUrl}/calles?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data?.calles) ? data.calles : [];
  } catch {
    return [];
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function stripNamedLocality(query) {
  const key = matchedCoveredLocality(query);
  if (!key) return String(query || '').trim();
  const pattern = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'), 'ig');
  return String(query || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(pattern, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[, ]+|[, ]+$/g, '')
    .trim();
}

async function fetchGeorefDirecciones(query, { max = 3 } = {}) {
  const direccion = String(query || '').trim();
  if (!direccion || direccion.length < 3) return [];

  const baseUrl = readGeorefBaseUrl();
  const localidad = georefLocalityName(direccion);
  const params = new URLSearchParams({
    direccion: localidad ? stripNamedLocality(direccion) : direccion,
    provincia: 'Salta',
    max: String(Math.max(1, Math.min(max, 5))),
  });
  if (localidad) {
    params.set('localidad', localidad);
  } else {
    params.set('departamento', 'Capital');
    params.set('localidad', 'Salta');
  }

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

/** Más lejos que esto, la recta entre dos alturas conocidas ya no es confiable. */
const MAX_EXTRAPOLATION_METERS = 1600;
const STREET_ANCHOR_TTL_MS = 30 * 60 * 1000;
const streetAnchorCache = new Map();
const streetAnchorInflight = new Map();

function metersBetweenCoords(a, b) {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

function streetRangeEdges(altura) {
  const values = (side) => [Number(side?.derecha), Number(side?.izquierda)]
    .filter((value) => Number.isFinite(value) && value >= 0);
  const ends = values(altura?.fin);
  if (!ends.length) return null;
  const starts = values(altura?.inicio);
  const end = Math.max(...ends);
  const start = starts.length ? Math.min(...starts) : 0;
  if (end <= start) return null;
  return { start, end };
}

/**
 * Alturas a consultar para armar la recta. Georef suele tener punto solo
 * cerca del final del padrón (el resto vuelve con lat/lon null).
 */
function probeHeightsForRange(altura) {
  const range = streetRangeEdges(altura);
  if (!range) return [];
  const candidates = [range.end, range.end - 100, range.end - 200, range.end - 400];
  if (range.start >= 100) candidates.push(range.start + 1);
  const heights = [];
  for (const value of candidates) {
    const height = Math.round(value);
    if (height <= range.start || height > range.end) continue;
    if (heights.includes(height)) continue;
    heights.push(height);
    if (heights.length >= 4) break;
  }
  return heights;
}

/**
 * Proyecta una altura sobre la recta de dos puntos conocidos de la misma calle.
 * Entre anclas interpola. Afuera extrapola, con tope, para no mandar el viaje al centro.
 */
function projectHeightOnAnchors(targetHeight, anchors) {
  const target = Number(targetHeight);
  const unique = [];
  for (const item of anchors || []) {
    const height = Number(item?.height);
    const lat = Number(item?.lat);
    const lng = Number(item?.lng);
    if (!Number.isFinite(height) || !isValidArgentinaCoordinate(lat, lng)) continue;
    if (unique.some((point) => point.height === height)) continue;
    unique.push({ height, lat, lng });
  }
  unique.sort((a, b) => a.height - b.height);
  if (!Number.isFinite(target) || unique.length < 2) return null;

  const exact = unique.find((point) => point.height === target);
  if (exact) return { lat: exact.lat, lng: exact.lng };

  let lower = null;
  let upper = null;
  for (const point of unique) {
    if (point.height <= target) lower = point;
    if (point.height >= target && !upper) upper = point;
  }

  // Adentro, la recta entre las dos alturas que la encierran.
  // Afuera, la pendiente de todo el tramo conocido: el último centenar a veces
  // dobla y, si se usa solo ese tramo, 800 termina a 2 km del 1400.
  const pair = lower && upper
    ? [lower, upper]
    : [unique[0], unique[unique.length - 1]];

  const [from, to] = pair;
  const span = to.height - from.height;
  if (!span) return null;
  const ratio = (target - from.height) / span;
  const lat = from.lat + ratio * (to.lat - from.lat);
  const lng = from.lng + ratio * (to.lng - from.lng);
  if (!isWithinServiceArea(lat, lng)) return null;

  const inside = target >= unique[0].height && target <= unique[unique.length - 1].height;
  if (!inside) {
    const nearest = unique.reduce((best, point) => (
      Math.abs(point.height - target) < Math.abs(best.height - target) ? point : best
    ));
    if (metersBetweenCoords(nearest, { lat, lng }) > MAX_EXTRAPOLATION_METERS) return null;
  }

  return { lat, lng };
}

async function fetchGeorefCalleById(streetId) {
  const id = String(streetId || '').trim();
  if (!id) return null;

  const baseUrl = readGeorefBaseUrl();
  const params = new URLSearchParams({
    id,
    provincia: 'Salta',
    campos: 'estandar',
    max: '1',
  });
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), GEOREF_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(`${baseUrl}/calles?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    const calle = Array.isArray(data?.calles) ? data.calles[0] : null;
    return calle || null;
  } catch {
    return null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function anchorFromDireccion(item, streetId, fallbackHeight) {
  if (String(item?.calle?.id || '') !== String(streetId)) return null;
  const lat = parseCoordinate(item?.ubicacion?.lat);
  const lng = parseCoordinate(item?.ubicacion?.lon);
  const height = Number(item?.altura?.valor ?? fallbackHeight);
  if (!isValidArgentinaCoordinate(lat, lng) || !Number.isFinite(height)) return null;
  return { height, lat, lng };
}

async function anchorsForStreet(streetId, streetName) {
  const id = String(streetId || '').trim();
  const cached = streetAnchorCache.get(id);
  if (cached && cached.until > Date.now()) return cached.anchors;
  if (streetAnchorInflight.has(id)) return streetAnchorInflight.get(id);

  const job = (async () => {
    const calle = await fetchGeorefCalleById(id);
    const heights = probeHeightsForRange(calle?.altura);
    const name = String(calle?.nombre || streetName || '').trim();
    if (!heights.length || !name) return [];

    const batches = await Promise.all(heights.map((height) => (
      fetchGeorefDirecciones(`${name} ${height}`, { max: 3 })
    )));
    const anchors = [];
    batches.forEach((items, index) => {
      for (const item of items || []) {
        const anchor = anchorFromDireccion(item, id, heights[index]);
        if (!anchor) continue;
        if (anchors.some((point) => point.height === anchor.height)) continue;
        anchors.push(anchor);
      }
    });
    return anchors;
  })();

  streetAnchorInflight.set(id, job);
  try {
    const anchors = await job;
    streetAnchorCache.set(id, {
      anchors,
      until: Date.now() + (anchors.length >= 2 ? STREET_ANCHOR_TTL_MS : 2 * 60 * 1000),
    });
    return anchors;
  } finally {
    streetAnchorInflight.delete(id);
  }
}

/**
 * Georef nombra la calle y la altura en zona sur o Grand Bourg, pero deja
 * lat/lon en null fuera de un tramo corto. Sin esto, 800 y 2000 caen al mismo punto.
 */
async function estimateMissingGeorefPin(item) {
  const height = Number(item?.altura?.valor);
  const streetId = item?.calle?.id;
  const streetName = item?.calle?.nombre;
  if (!streetId || !Number.isFinite(height) || height <= 0) return null;

  const anchors = await anchorsForStreet(streetId, streetName);
  const point = projectHeightOnAnchors(height, anchors);
  if (!point) return null;

  return mapGeorefDireccion({
    ...item,
    ubicacion: { lat: point.lat, lon: point.lng },
  });
}

async function materializeGeorefDirecciones(items) {
  const mapped = await Promise.all((items || []).map(async (item) => {
    const direct = mapGeorefDireccion(item);
    if (direct) return direct;
    return estimateMissingGeorefPin(item);
  }));
  return mapped.filter(Boolean);
}

/**
 * Busca direcciones con altura en Georef (Salta Capital).
 * Solo tiene sentido cuando el query incluye número de calle.
 */
async function searchGeorefAddress(query, max = 3) {
  const trimmed = String(query || '').trim();
  if (!trimmed || pickPrimaryHouseNumber(trimmed) == null) return [];

  const hits = await fetchGeorefDirecciones(trimmed, { max });
  return materializeGeorefDirecciones(hits);
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

  if (id.startsWith('georef:n:')) {
    const nomenclatura = decodeURIComponent(id.slice('georef:n:'.length));
    const hits = await fetchGeorefDirecciones(nomenclatura, { max: 1 });
    const mapped = await materializeGeorefDirecciones(hits);
    return mapped[0] || null;
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
  probeHeightsForRange,
  projectHeightOnAnchors,
  fetchGeorefCalles,
  fetchGeorefDirecciones,
  searchGeorefAddress,
  resolveGeorefPlaceId,
};
