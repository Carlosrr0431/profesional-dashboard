const {
  sanitizeAddressInput,
  normalizeAddressPhrase,
} = require('../../shared/salta-address.js');

/** Separador pickup → destino en un mismo mensaje (orden importa: frases largas primero). */
const TRIP_DESTINATION_CUE =
  '(?:es\\s+para\\s+ir\\s+(?:hasta|a)|(?:me\\s+)?voy\\s+(?:para|a)|me\\s+llev(?:a|as|en)\\s+a|destino(?:\\s+es)?|hasta|hacia)';

const TRIP_DESTINATION_STOP_PATTERN = new RegExp(
  '(?:,\\s*(?:me\\s+)?voy\\s+(?:para|a)|\\b(?:es\\s+para\\s+ir\\s+(?:hasta|a)|voy\\s+(?:para|a)|me\\s+llev(?:a|as|en)\\s+a|destino(?:\\s+es)?|hasta|hacia|despu[eé]s\\s+a))',
  'i',
);

function stripTrailingTripRouteTail(value) {
  let text = sanitizeAddressInput(value || '');
  if (!text) return '';

  text = text.replace(/\s*(?:,\s*)?(?:me\s+)?voy\s+(?:para|a)\b.*$/i, '').trim();
  text = text.replace(/\s+(?:es\s+)?para\s+ir(?:\s+(?:hasta|a)\b.*)?$/i, '').trim();
  text = text.replace(/\s+(?:voy\s+(?:para|a)|me\s+llev(?:a|as|en)\s+a|destino(?:\s+es)?)\b.*$/i, '').trim();
  text = text.replace(/\s+hasta\s*$/i, '').trim();
  text = text.replace(/,\s*(?:me|yo)\s*$/i, '').trim();

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

function normalizePollStreetKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Intersecciones: "A & B" / "A esquina B" / "A x B" → misma identidad que "A y B".
    .replace(/&+/g, ' y ')
    .replace(/\b(?:esquina(?:\s+con)?|esq)\b/g, ' y ')
    .replace(/\s+x\s+/g, ' y ')
    .replace(/\b(gral|general|calle|av(?:enida)?|avda|dr|doctor|prof|profesor|boulevard|bv|bvd)\b/g, ' ')
    .replace(/\bbartolome\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getAddressPollIdentityKey(candidate) {
  const title = String(candidate?.pollLabel || candidate?.title || '').trim();
  const subtitle = String(candidate?.subtitle || '').trim();
  // Incluir subtítulo para no colapsar "Hospital X · Boedo" con "Hospital X · Colón"
  const raw = [title, subtitle, candidate?.formattedAddress]
    .filter(Boolean)
    .join(' | ');
  const normalized = normalizePollStreetKey(raw);
  const numMatch = normalized.match(/\b(\d{1,5})\b/);
  const number = numMatch ? numMatch[1] : '';
  const street = normalized.replace(/\b\d{1,5}\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (candidate?.street?.nameKey) {
    return `${candidate.street.nameKey}|${number}|${normalizePollStreetKey(subtitle)}`;
  }
  return `${street}|${number}`;
}

function candidatesAreNearDuplicate(a, b) {
  const aLat = Number(a?.lat);
  const aLng = Number(a?.lng);
  const bLat = Number(b?.lat);
  const bLng = Number(b?.lng);
  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return false;
  // ~80 m en Salta: misma esquina con labels distintos (y vs &).
  return Math.abs(aLat - bLat) < 0.0008 && Math.abs(aLng - bLng) < 0.0008;
}

function collapseEquivalentPollCandidates(candidates) {
  const seen = new Map();
  for (const candidate of candidates || []) {
    const key = getAddressPollIdentityKey(candidate);
    if (!key || key === '|') continue;
    const prev = seen.get(key);
    if (!prev || Number(candidate?.score || 0) > Number(prev?.score || 0)) {
      seen.set(key, candidate);
    }
  }

  const collapsed = [...seen.values()];
  const out = [];
  for (const candidate of collapsed) {
    const nearIdx = out.findIndex((prev) => candidatesAreNearDuplicate(prev, candidate));
    if (nearIdx < 0) {
      out.push(candidate);
      continue;
    }
    if (Number(candidate?.score || 0) > Number(out[nearIdx]?.score || 0)) {
      out[nearIdx] = candidate;
    }
  }

  return out.sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0));
}

module.exports = {
  TRIP_DESTINATION_STOP_PATTERN,
  stripTrailingTripRouteTail,
  splitAddressFromIntentPhrase,
  extractFullTripByPattern,
  collapseEquivalentPollCandidates,
  getAddressPollIdentityKey,
  normalizePollStreetKey,
};
