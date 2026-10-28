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

function titleTokens(title) {
  return foldPinnedQuery(title)
    .split(' ')
    .filter((token) => token && !STOP_TOKENS.has(token) && (token.length >= 3 || /^\d{2,}$/.test(token)));
}

/** El texto escrito contiene todas las palabras distintivas del nombre guardado. */
function savedAddressMatches(title, query) {
  const tokens = titleTokens(title);
  if (tokens.length < 2) return false;
  const queryTokens = new Set(foldPinnedQuery(query).split(' ').filter(Boolean));
  return tokens.every((token) => queryTokens.has(token));
}

/**
 * Saca el pin de un enlace de Google Maps.
 * Prefiere !3d lat !4d lng (el lugar) y, si no está, el centro @lat,lng.
 * También acepta "lat, lng".
 */
function parseGoogleMapsPoint(input) {
  const text = String(input || '').trim();
  if (!text) return null;

  const pin = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const at = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const pair = text.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  const match = pin || at || pair;
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
  parseGoogleMapsPoint,
};
