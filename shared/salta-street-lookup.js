/**
 * Índice del catálogo de calles de Salta Capital.
 * Sirve para decidir si un leftover es calle, no un comercio/POI/ruido.
 */

const { SALTA_STREETS_FALLBACK } = require('./salta-streets-fallback');

const STREET_TYPE_RE = /^(calle|avenida|avda|av\.?|pasaje|pje\.?|diagonal|ruta|camino|paseo)\s+(.+)$/i;

const CONNECTORS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'a', 'al']);

const MONTH_TOKENS = new Set([
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'setiembre', 'octubre', 'noviembre', 'diciembre',
]);

/** Últimos tokens demasiado genéricos para inferir una calle. */
const WEAK_LAST_TOKENS = new Set([
  ...MONTH_TOKENS,
  'san', 'santa', 'santo', 'general', 'gral', 'doctor', 'dr',
  'juan', 'jose', 'maria', 'norte', 'sur', 'este', 'oeste',
  'nuevo', 'nueva', 'viejo', 'barrio', 'pueblo', 'centro',
]);

const PLACE_CATEGORY_TOKENS = new Set([
  'restaurante', 'restaurant', 'resto', 'parrilla', 'pizzeria', 'pizza',
  'cafe', 'cafeteria', 'confiteria', 'heladeria', 'rotiseria', 'bar',
  'cantina', 'comedor', 'hamburgueseria', 'cerveceria',
]);

function normalizeStreetKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\bgral\b/g, 'general')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseStreetLabel(label) {
  const match = String(label || '').trim().match(STREET_TYPE_RE);
  if (!match) return null;

  const name = match[2].trim();
  const nameKey = normalizeStreetKey(name);
  if (!nameKey || /^[a-z]$/.test(nameKey) || nameKey === 's c' || nameKey === 'sc') return null;

  const tokens = nameKey
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !CONNECTORS.has(token));
  if (tokens.length === 0) return null;

  return { name, nameKey, tokens };
}

function buildStreetCatalogIndex() {
  const byNameKey = new Map();
  const byLastToken = new Map();

  for (const label of SALTA_STREETS_FALLBACK) {
    const street = parseStreetLabel(label);
    if (!street) continue;
    if (!byNameKey.has(street.nameKey)) byNameKey.set(street.nameKey, street);

    const last = street.tokens[street.tokens.length - 1];
    if (!last || last.length < 4 || WEAK_LAST_TOKENS.has(last)) continue;
    if (!byLastToken.has(last)) byLastToken.set(last, []);
    byLastToken.get(last).push(street);
  }

  return { byNameKey, byLastToken };
}

const STREET_INDEX = buildStreetCatalogIndex();

function windowKeys(window) {
  const keys = [window.join(' ')];
  if (window.length === 2 && /^\d{1,2}$/.test(window[0]) && MONTH_TOKENS.has(window[1])) {
    keys.push(`${window[0]} de ${window[1]}`);
  }
  if (window.length >= 3 && window.includes('de')) {
    keys.push(window.join(' '));
  }
  return keys;
}

function compactStreetTokens(tokens) {
  return (tokens || [])
    .map((token) => normalizeStreetKey(token))
    .filter((token) => token && !CONNECTORS.has(token));
}

/**
 * Mejor calle del catálogo para una secuencia de tokens leftover.
 * No inventa calles: o hay nameKey exacto, o un apellido/nombre corto del catálogo.
 */
function matchCatalogStreetPhrase(tokens) {
  const compact = compactStreetTokens(tokens);
  if (compact.length === 0) return null;

  for (let len = compact.length; len >= 1; len -= 1) {
    for (let start = 0; start + len <= compact.length; start += 1) {
      const window = compact.slice(start, start + len);
      for (const key of windowKeys(window)) {
        const street = STREET_INDEX.byNameKey.get(key);
        if (street) {
          return { name: street.name, nameKey: street.nameKey, ambiguous: false };
        }
      }
    }
  }

  if (compact.length === 1) {
    return matchLastTokenStreet(compact[0]);
  }

  return null;
}

function matchLastTokenStreet(token) {
  const streets = STREET_INDEX.byLastToken.get(token) || [];
  if (streets.length === 0) return null;
  const exact = STREET_INDEX.byNameKey.get(token);
  if (exact) {
    return { name: exact.name, nameKey: exact.nameKey, ambiguous: streets.length > 1 };
  }
  if (streets.length === 1) {
    return { name: streets[0].name, nameKey: streets[0].nameKey, ambiguous: false };
  }
  return {
    name: token.charAt(0).toUpperCase() + token.slice(1),
    nameKey: token,
    ambiguous: true,
  };
}

/**
 * Calle más cercana al final de la frase (la que está junto a la altura).
 * Evita que "escuela Mitre O'Higgins 1550" se tome como Mitre.
 */
function matchCatalogStreetClosestToEnd(tokens) {
  const compact = compactStreetTokens(tokens);
  if (compact.length === 0) return null;

  for (let len = 1; len <= Math.min(4, compact.length); len += 1) {
    const window = compact.slice(-len);
    for (const key of windowKeys(window)) {
      const street = STREET_INDEX.byNameKey.get(key);
      if (street) {
        return { name: street.name, nameKey: street.nameKey, ambiguous: false };
      }
    }
  }

  return matchLastTokenStreet(compact[compact.length - 1]) || matchCatalogStreetPhrase(compact);
}

function isExactCatalogStreetNameKey(value) {
  const key = normalizeStreetKey(value);
  return Boolean(key && STREET_INDEX.byNameKey.has(key));
}

function isPlaceCategoryToken(token) {
  return PLACE_CATEGORY_TOKENS.has(normalizeStreetKey(token));
}

module.exports = {
  PLACE_CATEGORY_TOKENS,
  matchCatalogStreetPhrase,
  matchCatalogStreetClosestToEnd,
  isExactCatalogStreetNameKey,
  isPlaceCategoryToken,
  normalizeStreetKey,
};
