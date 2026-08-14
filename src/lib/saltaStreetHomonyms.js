/**
 * Calles homónimas frecuentes en Salta Capital (mismo apellido, distinta persona).
 * Usado para encuestas de desambiguación en WhatsApp y autocomplete del catálogo.
 */

/** nameKey del catálogo local → orden de prioridad en poll (más importante primero). */
export const GUEMES_STREET_NAME_KEYS = [
  'dr adolfo guemes',
  'dr luis guemes',
  'gral guemes',
  'juan manuel guemes',
  'dr martin g guemes',
  'domingo guemes',
];

export const GUEMES_POLL_OPTION_LIMIT = 5;

/** Poll de POIs genéricos (shopping, hospital…) sin calle/altura. */
export const CATEGORY_POI_POLL_OPTION_LIMIT = 5;

const GUEMES_PERSON_RE = /\b(?:adolfo|luis|domingo|juan\s+manuel)\b/;

function normalizeGuemesBlob(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True cuando el pasajero dijo "Güemes" sin nombrar a cuál (Adolfo, Luis, Domingo, Juan Manuel).
 * "Gral / Martín" no desambigua: el LLM suele inventar Gral. Martín Güemes y hay más de una.
 */
export function isGuemesHomonymQuery(streetSegment, queryTokens = []) {
  const blob = normalizeGuemesBlob(
    [streetSegment, ...(queryTokens || [])].filter(Boolean).join(' '),
  );
  if (!/\bguemes\b/.test(blob)) return false;
  return !GUEMES_PERSON_RE.test(blob);
}

/** Query de catálogo/poll: apellido + altura, sin expandir a una Güemes concreta. */
export function ambiguousGuemesSearchQuery(value) {
  const house = String(value || '').match(/\b(\d{1,5}[a-z]?)\b/i);
  return house ? `Güemes ${house[1]}, Salta` : 'Güemes, Salta';
}

export function guemesStreetPriority(nameKey) {
  const key = String(nameKey || '').trim().toLowerCase();
  const idx = GUEMES_STREET_NAME_KEYS.indexOf(key);
  return idx >= 0 ? GUEMES_STREET_NAME_KEYS.length - idx : 0;
}

/**
 * Reordena candidatos del catálogo para que Dr. Adolfo Güemes no quede fuera del poll.
 */
export function sortGuemesStreetCandidates(items) {
  return [...(items || [])].sort((a, b) => {
    const priA = guemesStreetPriority(a?.street?.nameKey);
    const priB = guemesStreetPriority(b?.street?.nameKey);
    if (priA !== priB) return priB - priA;
    return (b?.score || 0) - (a?.score || 0);
  });
}

/**
 * Si el pasajero dijo solo el apellido/nombre corto (ej. "Alvarado") y existe
 * una calle con ese nameKey exacto, descartar compuestos tipo
 * "C Barbaran Alvarado" / "Mtro R Alvarado". Güemes se exceptúa (homónimos reales).
 */
export function preferExactCatalogStreetMatches(ranked, queryTokens = [], streetSegment = '') {
  const tokens = (queryTokens || []).filter(Boolean);
  const queryNameKey = tokens.join(' ');
  if (!queryNameKey || !Array.isArray(ranked) || ranked.length === 0) {
    return ranked || [];
  }
  if (isGuemesHomonymQuery(streetSegment, tokens)) {
    return ranked;
  }
  const exact = ranked.filter((item) => {
    const nameKey = String(item?.street?.nameKey || item?.nameKey || '').trim();
    return nameKey === queryNameKey || item?.exactNameMatch === true;
  });
  return exact.length >= 1 ? exact : ranked;
}
