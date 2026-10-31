const STOP_TOKENS = new Set([
  'calle', 'avenida', 'av', 'avda', 'pasaje', 'pje', 'casa', 'salta', 'capital',
  'argentina', 'de', 'del', 'la', 'el', 'los', 'las', 'nro', 'numero', 'n',
]);

/** No alcanzan para elegir un lugar. "Barrio San José" no es cualquier barrio. */
const GENERIC_PLACE_WORDS = new Set([
  'barrio', 'zona', 'villa', 'pueblo', 'ciudad',
]);

function foldPinnedQuery(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeToken(token) {
  if (token === 'mza' || token === 'mz' || token === 'manzana') return 'manzana';
  if (token === 'pje' || token === 'psje') return 'pasaje';
  return token;
}

function contentTokens(value) {
  return foldPinnedQuery(value)
    .split(' ')
    .filter((token) => token && !STOP_TOKENS.has(token) && (token.length >= 3 || /^\d+$/.test(token)))
    .map(normalizeToken);
}

/** Hay coincidencia si el nombre guardado tiene todas las palabras que distinguen la búsqueda. */
function savedAddressMatches(title, query) {
  const distinctive = contentTokens(query).filter((token) => (
    !GENERIC_PLACE_WORDS.has(token) && !/^\d+$/.test(token)
  ));
  const titleTokens = new Set(contentTokens(title));
  const words = distinctive.length
    ? distinctive
    : contentTokens(query).filter((token) => token.length >= 4 && !/^\d+$/.test(token));
  if (!words.length) return false;
  return words.every((token) => {
    if (titleTokens.has(token)) return true;
    if (token.length < 4) return false;
    return [...titleTokens].some((word) => word.startsWith(token) || token.startsWith(word));
  });
}

/** Más alto = el texto comparte más palabras y números con lo que se escribió. */
function queryOverlapScore(query, text) {
  const tokens = contentTokens(query);
  if (!tokens.length) return 0;
  const hay = new Set(contentTokens(text));
  let score = 0;
  let hits = 0;
  for (const token of tokens) {
    if (!hay.has(token)) continue;
    hits += 1;
    score += /^\d+$/.test(token) ? 3 : 2;
  }
  if (hits === tokens.length) score += 5;
  return score;
}

function decodeMapText(value) {
  const text = String(value || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
  const embedded = text.match(/https?:\/\/\S+/i);
  const source = embedded ? embedded[0] : text;
  try {
    return decodeURIComponent(source);
  } catch {
    return source;
  }
}

function dmsToDecimal(degrees, minutes, seconds, hemisphere) {
  const value = Number(degrees) + Number(minutes) / 60 + Number(seconds) / 3600;
  if (!Number.isFinite(value)) return null;
  return /[sw]/i.test(hemisphere) ? -value : value;
}

function parseDmsPlacePoint(text) {
  const match = String(text || '').match(
    /(\d+(?:\.\d+)?)[°º]\s*(\d+(?:\.\d+)?)['’]\s*(\d+(?:\.\d+)?)["”]\s*([ns])\s+(\d+(?:\.\d+)?)[°º]\s*(\d+(?:\.\d+)?)['’]\s*(\d+(?:\.\d+)?)["”]\s*([ew])/i,
  );
  if (!match) return null;
  const lat = dmsToDecimal(match[1], match[2], match[3], match[4]);
  const lng = dmsToDecimal(match[5], match[6], match[7], match[8]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * Saca el pin de un enlace de Google Maps.
 * Prefiere !3d lat !4d lng (el lugar). Si el nombre del lugar es una coordenada
 * en grados, usa esa. El centro @lat,lng es la cámara y no el pin.
 */
function parseGoogleMapsPoint(input) {
  const text = decodeMapText(input);
  if (!text) return null;

  const pinMatches = [...text.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
  const pin = pinMatches.length ? pinMatches[pinMatches.length - 1] : null;
  const query = text.match(/[?&](?:q|query)=(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i);
  const dms = parseDmsPlacePoint(text);
  const at = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const pair = text.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  const chosen = pin || query || (dms ? [null, dms.lat, dms.lng] : null) || at || pair;
  if (!chosen) return null;

  const lat = Number(chosen[1]);
  const lng = Number(chosen[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) return null;
  return { lat, lng };
}

module.exports = {
  foldPinnedQuery,
  savedAddressMatches,
  queryOverlapScore,
  parseGoogleMapsPoint,
};
