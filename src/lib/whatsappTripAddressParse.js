const {
  sanitizeAddressInput,
  normalizeAddressPhrase,
} = require('../../shared/salta-address.js');

/** Separador pickup → destino en un mismo mensaje (orden importa: frases largas primero). */
const TRIP_DESTINATION_CUE =
  '(?:es\\s+para\\s+ir\\s+(?:hasta|a)|(?:me\\s+)?voy\\s+(?:para|a)|van\\s+al?\\b|van\\s+a(?:\\s+la)?|me\\s+llev(?:a|as|en)\\s+a|destino(?:\\s+es)?|hasta|hacia)';

const TRIP_DESTINATION_STOP_PATTERN = new RegExp(
  '(?:,\\s*(?:me\\s+)?voy\\s+(?:para|a)|\\b(?:es\\s+para\\s+ir\\s+(?:hasta|a)|voy\\s+(?:para|a)|van\\s+al?\\b|van\\s+a(?:\\s+la)?|me\\s+llev(?:a|as|en)\\s+a|destino(?:\\s+es)?|hasta|hacia|despu[eé]s\\s+a))',
  'i',
);

function stripTrailingTripRouteTail(value) {
  let text = sanitizeAddressInput(value || '');
  if (!text) return '';

  text = text.replace(/\s*(?:,\s*)?(?:me\s+)?voy\s+(?:para|a)\b.*$/i, '').trim();
  text = text.replace(/\s+(?:es\s+)?para\s+ir(?:\s+(?:hasta|a)\b.*)?$/i, '').trim();
  text = text.replace(/\s+(?:voy\s+(?:para|a)|van\s+al?\b|van\s+a(?:\s+la)?|me\s+llev(?:a|as|en)\s+a|destino(?:\s+es)?)\b.*$/i, '').trim();
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

function cleanTripAddress(value) {
  return normalizeAddressPhrase(stripTrailingTripRouteTail(stripScheduleTimePhrases(value)));
}

function extractFullTripByPattern(text) {
  const src = String(text || '').trim();
  if (!src) return null;

  const desdeLlevame = src.match(/llevame\s+a\s+(.+?)\s+desde\s+(.+)$/i);
  if (desdeLlevame) {
    const destination = cleanTripAddress(desdeLlevame[1]);
    const pickup = cleanTripAddress(desdeLlevame[2]);
    if (pickup && destination) return { pickup, destination };
  }

  const patterns = [
    new RegExp(
      `(?:remis|movil|m[oó]vil|taxi|auto)\\s+(?:para|al|a|en)\\s+(.+?)\\s*(?:,|\\.)?\\s*${TRIP_DESTINATION_CUE}\\s+(.+)$`,
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

    const pickupRaw = cleanTripAddress(match[1]);
    const destination = cleanTripAddress(match[2]);
    const pickup = pickupRaw && !isNonAddressPickup(pickupRaw) ? pickupRaw : null;
    if (pickup && destination) {
      return { pickup, destination };
    }
    if (!pickup && destination) {
      return { pickup: null, destination };
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
    const typeKey = String(candidate.street.type || '').trim().toLowerCase();
    return `${typeKey}|${candidate.street.nameKey}|${number}|${normalizePollStreetKey(subtitle)}`;
  }
  return `${street}|${number}`;
}

function isFiniteCoord(value) {
  // Number(null) === 0: no tratar "sin geocode" como Null Island.
  if (value == null || value === '') return false;
  return Number.isFinite(Number(value));
}

function candidatesAreNearDuplicate(a, b) {
  const aLat = a?.lat;
  const aLng = a?.lng;
  const bLat = b?.lat;
  const bLng = b?.lng;
  if (![aLat, aLng, bLat, bLng].every(isFiniteCoord)) return false;
  // ~80 m en Salta: misma esquina con labels distintos (y vs &).
  return Math.abs(Number(aLat) - Number(bLat)) < 0.0008
    && Math.abs(Number(aLng) - Number(bLng)) < 0.0008;
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

const VEHICLE_WORD = '(?:remis|m[oó]vil|movil|taxi|auto|coche)';
const PLACE_PREP = '(?:para|al|ala|a|en)';

const TRIP_PICKUP_CUES = [
  new RegExp(
    `(?:me\\s+)?(?:pod[eé]s|podr[ií]as?|puede(?:n|s)?|podes)\\s+(?:enviar(?:me)?|enviarme|mandar(?:me)?|mandarme)\\s+(?:un|una|uno|el|la|dos)?\\s*${VEHICLE_WORD}?\\s*(?:con\\s+baulera)?\\s*${PLACE_PREP}\\s+`,
    'i',
  ),
  new RegExp(
    `(?:me\\s+env[ií]a(?:n|s)?|envi[aá]me|env[ií]en(?:me|nos)?)\\s+(?:un|una|uno|el|la)?\\s*${VEHICLE_WORD}?\\s*${PLACE_PREP}\\s+`,
    'i',
  ),
  new RegExp(
    `(?:te|le|les)\\s+pido\\s+(?:porfa\\s+)?(?:un|una|uno)?\\s*${VEHICLE_WORD}?\\s*${PLACE_PREP}\\s+`,
    'i',
  ),
  new RegExp(
    `(?:solicito|quisiera\\s+(?:solicitar|pedir))\\s+(?:un|una)?\\s*${VEHICLE_WORD}?\\s*(?:con\\s+baulera)?\\s*${PLACE_PREP}\\s+`,
    'i',
  ),
  new RegExp(
    `(?:te\\s+)?encargo\\s+(?:un\\s+)?${VEHICLE_WORD}\\s+${PLACE_PREP}\\s+`,
    'i',
  ),
  new RegExp(
    `(?:mand[aá](?:me|as|an|s)?|me\\s+mand[aá]s?)\\s+(?:un|una|uno|el|la|por\\s+favor)?\\s*${VEHICLE_WORD}?\\s*${PLACE_PREP}\\s+`,
    'i',
  ),
  new RegExp(
    `(?:necesito|quiero|preciso|quisiera)\\s+(?:un|una|el|la)?\\s*${VEHICLE_WORD}?\\s*${PLACE_PREP}\\s+`,
    'i',
  ),
  new RegExp(`(?:un|una)\\s+${VEHICLE_WORD}\\s+${PLACE_PREP}\\s+`, 'i'),
  new RegExp(`${VEHICLE_WORD}\\s+${PLACE_PREP}\\s+`, 'i'),
  /(?:pasame\s+a\s+buscar(?:me)?|busc[aá][sm]e?|me\s+busc[aá]s?\s+en|retiro(?:\s+en)?|estoy\s+en|origen(?:\s+es)?|desde)\s*[:,-]?\s*/i,
];

function foldPickupText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeTimeOnlyPickup(value) {
  const n = foldPickupText(value).replace(/[.,!?¿¡]/g, '').trim();
  if (!n) return true;
  if (/^(?:las?\s+)?\d{1,2}(?:[:.]\d{2})?(?:\s*(?:hs|hrs|horas?|am|pm))?$/.test(n)) return true;
  if (/^\d{1,2}\s+y\s+\d{1,2}(?:\s*(?:hs|hrs))?$/.test(n)) return true;
  if (/^(?:manana|hoy|ahora|despues|puntual)$/.test(n)) return true;
  if (/^hab(?:itacion)?\s*\d+[a-z]?$/.test(n)) return true;
  return false;
}

function isNonAddressPickup(value) {
  const n = foldPickupText(value).replace(/[.,!?¿¡]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return true;
  if (looksLikeTimeOnlyPickup(value)) return true;
  if (/\b(?:show|concierto|recital|obra|partido)\s+de\b/.test(n)) return true;
  if (/\bellos\s+se\b/.test(n) || /^ellos\b/.test(n)) return true;
  if (/^para\s+la\b/.test(n) && !/\d{2,5}/.test(n)) return true;
  if (/^(?:y\s+)?quieren\b/.test(n)) return true;
  return false;
}

function stripScheduleTimePhrases(value) {
  return String(value || '')
    .replace(/\b(?:a\s+|para\s+)?las?\s+\d{1,2}(?:\s*[:.]\s*\d{2})?(?:\s*(?:hs|hrs|horas?|am|pm))?\b/gi, ' ')
    .replace(/\ba\s+hs\s+\d{1,2}(?:[:.]\d{2})?\b/gi, ' ')
    .replace(/\b\d{1,2}[:.]\d{2}\s*(?:hs|hrs|am|pm|horas?)?\b/gi, ' ')
    .replace(/\b\d{1,2}\s+y\s+\d{1,2}\s*(?:hs|hrs)?\b/gi, ' ')
    .replace(/\bhab(?:itacion)?\s*\d+[a-z]?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function finalizeHeuristicPickup(raw) {
  const stripped = stripScheduleTimePhrases(raw);
  const cleaned = sanitizeAddressInput(stripTrailingTripRouteTail(stripped));
  if (!cleaned || isNonAddressPickup(cleaned)) return null;
  return cleaned;
}

function extractLastLineStreetNumber(text) {
  const lines = String(text || '')
    .split('\n')
    .map((line) => sanitizeAddressInput(line))
    .filter(Boolean);
  if (lines.length === 0) return null;
  const candidate = lines[lines.length - 1];
  if (!/[a-zA-ZÀ-ÿ]{2,}[\w\s.'-]*\s\d{1,5}\b/.test(candidate)) return null;
  if (/\bde\b.+\ba\b/i.test(candidate) && /hasta|hacia|destino/i.test(candidate)) return null;
  return normalizeAddressPhrase(candidate);
}

function extractTripPickupHeuristic(combinedText) {
  const text = String(combinedText || '').trim();
  if (!text) return { pickup: null, destination: null };

  const fullTrip = extractFullTripByPattern(text);
  if (fullTrip) {
    return {
      pickup: fullTrip.pickup && !isNonAddressPickup(fullTrip.pickup) ? fullTrip.pickup : null,
      destination: fullTrip.destination || null,
    };
  }

  const lastLine = extractLastLineStreetNumber(text);

  for (const cue of TRIP_PICKUP_CUES) {
    const matched = splitAddressFromIntentPhrase(text, cue);
    if (!matched) continue;
    const pickup = finalizeHeuristicPickup(matched);
    if (!pickup) continue;
    return {
      pickup,
      destination: null,
    };
  }

  const destinationMatch = splitAddressFromIntentPhrase(
    text,
    /(?:destino(?:\s+es)?|hacia|hasta|llevame\s+a|quiero\s+ir\s+a|voy\s+para|voy\s+a)\s*/i,
  );

  if (lastLine) {
    return {
      pickup: lastLine,
      destination: sanitizeAddressInput(destinationMatch || '') || null,
    };
  }

  if (
    /[a-zA-ZÀ-ÿ]{2,}[\w\s.'-]*\s\d{1,5}\b/.test(text)
    || /\s+y\s+/.test(text)
    || /\besq/.test(text)
    || /\bc\//.test(text)
    || /\bcasi\b/i.test(text)
    || /\bbarrio\b/i.test(text)
  ) {
    const cleaned = normalizeAddressPhrase(stripTrailingTripRouteTail(text));
    if (cleaned && !looksLikeTimeOnlyPickup(cleaned)) {
      return { pickup: cleaned, destination: sanitizeAddressInput(destinationMatch || '') || null };
    }
  }

  return {
    pickup: null,
    destination: sanitizeAddressInput(destinationMatch || '') || null,
  };
}

module.exports = {
  TRIP_DESTINATION_STOP_PATTERN,
  stripTrailingTripRouteTail,
  splitAddressFromIntentPhrase,
  extractFullTripByPattern,
  extractTripPickupHeuristic,
  looksLikeTimeOnlyPickup,
  isNonAddressPickup,
  stripScheduleTimePhrases,
  collapseEquivalentPollCandidates,
  getAddressPollIdentityKey,
  normalizePollStreetKey,
};
