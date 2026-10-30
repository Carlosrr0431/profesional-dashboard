/** Tope mensual de llamadas HTTP a Places API (New). El recargo empieza en 10.000. */
const PLACES_MONTHLY_CALL_LIMIT = 9000;

function placesBillingPeriod(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  const safe = Number.isNaN(value.getTime()) ? new Date() : value;
  const month = String(safe.getUTCMonth() + 1).padStart(2, '0');
  return `${safe.getUTCFullYear()}-${month}`;
}

const PLACE_QUERY_STOP = new Set([
  'salta', 'capital', 'argentina', 'av', 'avda', 'avenida', 'calle',
  'de', 'del', 'la', 'las', 'los', 'el', 'y', 'pasaje', 'pje',
]);

/** Nombres de pila del padrón. No alcanzan para distinguir otra calle. */
const STREET_GIVEN_NAMES = new Set([
  'bartolome', 'juan', 'bautista', 'bernardino', 'carlos', 'mariano',
  'domingo', 'faustino', 'hipolito', 'martin', 'miguel', 'general', 'gral', 'doctor',
]);

function foldPlaceText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function placeQueryTokens(query) {
  return foldPlaceText(query)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !PLACE_QUERY_STOP.has(token));
}

/** El lugar guardado coincide con lo escrito, sin llamar a Google. */
function cachedPoiMatches(blob, query) {
  const tokens = placeQueryTokens(query);
  if (!tokens.length) return false;
  const words = foldPlaceText(blob).split(/[^a-z0-9]+/).filter(Boolean);
  const tokenHit = tokens.every((token) => words.some((word) => (
    word === token || (token.length >= 4 && word.startsWith(token))
  )));
  if (!tokenHit) return false;
  return numberedStreetAgrees(query, blob);
}

function significantStreetTokens(text) {
  return foldPlaceText(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !/\d/.test(token) && !PLACE_QUERY_STOP.has(token) && !STREET_GIVEN_NAMES.has(token));
}

/**
 * "Sarmiento 292" no es "Fragata Sarmiento 292".
 * Si el guardado nombra otra calle, no se ofrece ni se usa su punto.
 */
function numberedStreetAgrees(query, blob) {
  const queryNumbers = foldPlaceText(query).match(/\b\d{1,5}\b/g) || [];
  if (!queryNumbers.length) return true;
  const blobNumbers = foldPlaceText(blob).match(/\b\d{1,5}\b/g) || [];
  if (blobNumbers.length && !queryNumbers.some((number) => blobNumbers.includes(number))) return false;
  const queryStreet = significantStreetTokens(query);
  const blobStreet = significantStreetTokens(blob);
  if (!queryStreet.length || !blobStreet.length) return true;
  return !blobStreet.some((token) => !queryStreet.some((part) => (
    token === part || token.startsWith(part) || part.startsWith(token)
  )));
}

/** El número que devuelve la base es el total DESPUÉS de sumar esta llamada. */
function interpretPlacesConsume(data, limit = PLACES_MONTHLY_CALL_LIMIT) {
  if (data == null || data === '') return { allowed: false, count: null };
  const count = Number(data);
  if (!Number.isFinite(count)) return { allowed: false, count: null };
  return { allowed: count <= limit, count };
}

module.exports = {
  PLACES_MONTHLY_CALL_LIMIT,
  placesBillingPeriod,
  interpretPlacesConsume,
  foldPlaceText,
  placeQueryTokens,
  cachedPoiMatches,
  numberedStreetAgrees,
};
