const STOP_TOKENS = new Set([
  'calle', 'avenida', 'av', 'avda', 'pasaje', 'pje', 'casa', 'salta', 'capital',
  'argentina', 'de', 'del', 'la', 'el', 'los', 'las', 'nro', 'numero', 'n',
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

/** Hay coincidencia si alguna palabra de lo escrito está en el nombre guardado. */
function savedAddressMatches(title, query) {
  const queryWords = contentTokens(query).filter((token) => token.length >= 4 && !/^\d+$/.test(token));
  if (!queryWords.length) return false;
  const titleTokens = new Set(contentTokens(title));
  return queryWords.some((token) => titleTokens.has(token));
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

/**
 * Saca el pin de un enlace de Google Maps.
 * Prefiere !3d lat !4d lng (el lugar) y, si no está, el centro @lat,lng.
 * También acepta "lat, lng".
 */
function parseGoogleMapsPoint(input) {
  let text = String(input || '').trim();
  if (!text) return null;
  try {
    text = decodeURIComponent(text);
  } catch {
    // El texto ya estaba decodificado.
  }

  const pin = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const query = text.match(/[?&]q=(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i);
  const at = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const pair = text.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  const match = pin || query || at || pair;
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
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
