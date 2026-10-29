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

function contentTokens(value) {
  return foldPinnedQuery(value)
    .split(' ')
    .filter((token) => token && !STOP_TOKENS.has(token) && (token.length >= 3 || /^\d+$/.test(token)));
}

/**
 * La dirección guardada aparece si lo escrito está dentro de su nombre.
 * Hace falta un número: "santa ana" solo no alcanza; "santa 1 pasaje 20" sí.
 */
function savedAddressMatches(title, query) {
  const queryTokens = contentTokens(query);
  const titleTokens = contentTokens(title);
  if (queryTokens.length < 3 || titleTokens.length < 2) return false;
  const titleSet = new Set(titleTokens);
  if (!queryTokens.every((token) => titleSet.has(token))) return false;
  const titleHasNumber = titleTokens.some((token) => /^\d+$/.test(token));
  const queryHasNumber = queryTokens.some((token) => /^\d+$/.test(token));
  return !titleHasNumber || queryHasNumber;
}

/** Más alto = el texto comparte más palabras y números con lo que se escribió. */
function queryOverlapScore(query, text) {
  const tokens = contentTokens(query);
  if (!tokens.length) return 0;
  const hay = new Set(foldPinnedQuery(text).split(' ').filter(Boolean));
  let score = 0;
  let hits = 0;
  for (const token of tokens) {
    if (!hay.has(token)) continue;
    hits += 1;
    score += /^\d+$/.test(token) ? 3 : 1;
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
