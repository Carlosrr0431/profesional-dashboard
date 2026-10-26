/** Un local de Google se revalida al elegirlo, no mientras se escribe. */
const PLACE_REFRESH_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const PLACE_MOVED_METERS = 150;

const ADDRESS_ONLY_TYPES = new Set([
  'route', 'street_address', 'street_number', 'geocode', 'intersection',
  'premise', 'subpremise', 'plus_code', 'political', 'postal_code', 'country',
  'locality', 'sublocality', 'sublocality_level_1', 'neighborhood',
  'administrative_area_level_1', 'administrative_area_level_2',
]);

function fold(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function placeNeedsRefresh(updatedAt, nowMs = Date.now()) {
  const stamp = Date.parse(updatedAt || '');
  if (!Number.isFinite(stamp)) return false;
  return nowMs - stamp >= PLACE_REFRESH_AFTER_MS;
}

function isRefreshableGooglePlace({ placeId, types, title } = {}) {
  const id = String(placeId || '').trim();
  if (!id.startsWith('google:')) return false;
  const list = Array.isArray(types) ? types.map((type) => String(type || '')).filter(Boolean) : [];
  const isBusiness = list.some((type) => !ADDRESS_ONLY_TYPES.has(type));
  if (list.length && !isBusiness) return false;
  if (!isBusiness && /\b\d{2,5}\b/.test(String(title || ''))) return false;
  return true;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180)
    * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function placeMoved(fromLat, fromLng, toLat, toLng) {
  const points = [fromLat, fromLng, toLat, toLng].map(Number);
  if (points.some((value) => !Number.isFinite(value))) return false;
  return haversineMeters(points[0], points[1], points[2], points[3]) > PLACE_MOVED_METERS;
}

function titleMatchesQuery(title, query) {
  const name = fold(title);
  const text = fold(query);
  if (name.length < 4 || text.length < 4) return false;
  return name.includes(text) || text.includes(name);
}

/** En una búsqueda por nombre, el local de Google queda antes que un viaje viejo en la dirección anterior. */
function rankNamedGoogleFirst(items, query) {
  const text = fold(query);
  if (text.length < 4 || /\d/.test(text)) return items || [];
  const named = [];
  const rest = [];
  for (const item of items || []) {
    const title = fold(item?.title || item?.poiName || '');
    if (String(item?.placeId || '').startsWith('google:') && title.includes(text)) named.push(item);
    else rest.push(item);
  }
  return named.length ? [...named, ...rest] : (items || []);
}

module.exports = {
  PLACE_REFRESH_AFTER_MS,
  PLACE_MOVED_METERS,
  placeNeedsRefresh,
  isRefreshableGooglePlace,
  placeMoved,
  titleMatchesQuery,
  rankNamedGoogleFirst,
};
