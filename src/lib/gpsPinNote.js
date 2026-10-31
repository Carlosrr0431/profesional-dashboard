function fold(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "calle Mujica casa 9" dentro de un barrio, sin usar el apellido del barrio como calle. */
export function parseCalleCasaPickup(text) {
  const normalized = fold(text);
  const match = normalized.match(/\bcalle\s+([a-z][a-z\s]{0,40}?)\s+casa\s+(\d{1,5})\b/);
  if (!match) return null;
  const street = match[1].replace(/\s+/g, ' ').trim();
  if (!street || street === 'casa') return null;
  return `${street} ${match[2]}`;
}

/** Texto que aclara el punto ya mandado por GPS: barrio, casa, baúl, puerta. */
export function looksLikeGpsClarification(text) {
  const normalized = fold(text);
  if (!normalized) return false;
  if (parseCalleCasaPickup(text)) return true;
  return /\b(barrio|casa|manzana|lote|baul|puerta|porton|timbre|referencia|comentario)\b/.test(normalized);
}
