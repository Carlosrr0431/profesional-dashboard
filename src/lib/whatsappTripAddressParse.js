const {
  sanitizeAddressInput,
  normalizeAddressPhrase,
} = require('../../shared/salta-address.js');

/** Separador pickup → destino en un mismo mensaje (orden importa: frases largas primero). */
const TRIP_DESTINATION_CUE =
  '(?:es\\s+para\\s+ir\\s+(?:hasta|a)|voy\\s+(?:para|a)|me\\s+llev(?:a|as|en)\\s+a|destino(?:\\s+es)?|hasta|hacia)';

const TRIP_DESTINATION_STOP_PATTERN = new RegExp(
  `\\b(?:es\\s+para\\s+ir\\s+(?:hasta|a)|voy\\s+(?:para|a)|me\\s+llev(?:a|as|en)\\s+a|destino(?:\\s+es)?|hasta|hacia|despu[eé]s\\s+a)\\b`,
  'i',
);

function stripTrailingTripRouteTail(value) {
  let text = sanitizeAddressInput(value || '');
  if (!text) return '';

  text = text.replace(/\s+(?:es\s+)?para\s+ir(?:\s+(?:hasta|a)\b.*)?$/i, '').trim();
  text = text.replace(/\s+(?:voy\s+(?:para|a)|me\s+llev(?:a|as|en)\s+a|destino(?:\s+es)?)\b.*$/i, '').trim();
  text = text.replace(/\s+hasta\s*$/i, '').trim();

  return text;
}

function splitAddressFromIntentPhrase(text, cueRegex) {
  const src = String(text || '');
  const cueMatch = src.match(cueRegex);
  if (!cueMatch) return null;

  const startIdx = cueMatch.index + cueMatch[0].length;
  const tail = src.slice(startIdx).trim();
  if (!tail) return null;

  const stopMatch = tail.match(TRIP_DESTINATION_STOP_PATTERN);
  const segment = stopMatch ? tail.slice(0, stopMatch.index).trim() : tail;
  return normalizeAddressPhrase(stripTrailingTripRouteTail(segment));
}

function extractFullTripByPattern(text) {
  const src = String(text || '').trim();
  if (!src) return null;

  const patterns = [
    new RegExp(
      `(?:remis|movil|m[oó]vil|taxi|auto)\\s+(?:para|a|en)\\s+(.+?)\\s*(?:,|\\.)?\\s*${TRIP_DESTINATION_CUE}\\s+(.+)$`,
      'i',
    ),
    new RegExp(
      `(?:pasame\\s+a\\s+buscar(?:me)?|buscame|retiro\\s+en|estoy\\s+en|desde)\\s*[:,-]?\\s*(.+?)\\s*(?:,|\\.)?\\s*${TRIP_DESTINATION_CUE}\\s+(.+)$`,
      'i',
    ),
    /\bde\s+(.+?)\s+a\s+(.+)$/i,
  ];

  for (const regex of patterns) {
    const match = src.match(regex);
    if (!match) continue;

    const pickup = normalizeAddressPhrase(stripTrailingTripRouteTail(match[1]));
    const destination = normalizeAddressPhrase(match[2]);
    if (pickup && destination) {
      return { pickup, destination };
    }
  }

  return null;
}

module.exports = {
  TRIP_DESTINATION_STOP_PATTERN,
  stripTrailingTripRouteTail,
  splitAddressFromIntentPhrase,
  extractFullTripByPattern,
};
