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

/**
 * True cuando el query es básicamente "Güemes" + altura (sin otro nombre de calle).
 */
export function isGuemesHomonymQuery(streetSegment, queryTokens = []) {
  const segment = String(streetSegment || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  const contentTokens = (queryTokens || []).filter(
    (token) => token && token.length >= 3 && token !== 'guemes',
  );

  if (contentTokens.length > 0) return false;
  return /\bguemes\b/.test(segment) || (queryTokens || []).includes('guemes');
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
