/**
 * Etiquetas legibles para encuestas de dirección en WhatsApp.
 * Google suele devolver abreviaturas (ej. "Dr. A. Güemes"); el pasajero ve el nombre completo.
 * Para POIs (banco, shopping, etc.) se muestra nombre + calle/altura.
 */

export const NONE_OF_THESE_POLL_OPTION = 'Ninguna de estas opciones';

/** Límite de WhatsApp para opciones de poll. */
const WHATSAPP_POLL_OPTION_MAX_LEN = 100;

/** Apellido de prócer → nombre completo (solo visualización en poll). */
const STREET_NAME_EXPANSIONS = [
  // Evitar "Bartolomé Bartolomé Mitre" si el texto ya trae el nombre completo.
  [/(?<![Bb]artolom[eé]\s)\bmitre\b/gi, 'Bartolomé Mitre'],
  [/(?<![Jj]uan\s[Bb]autista\s)\balberdi\b/gi, 'Juan Bautista Alberdi'],
  [/(?<![Bb]ernardino\s)\brivadavia\b/gi, 'Bernardino Rivadavia'],
  [/(?<![Cc]arlos\s)\bpellegrini\b/gi, 'Carlos Pellegrini'],
  [/(?<![Mm]ariano\s)\bpueyrred[oó]n\b/gi, 'Mariano Pueyrredón'],
  [/(?<![Dd]omingo\sF\.?\s)\bsarmiento\b/gi, 'Domingo F. Sarmiento'],
  [/(?<![Hh]ip[oó]lito\s)\byrigoyen\b/gi, 'Hipólito Yrigoyen'],
];

/**
 * Reemplazos de patrones que devuelve Google Geocoding en Salta.
 * Orden: patrones más específicos primero.
 */
const GOOGLE_POLL_STREET_REPLACEMENTS = [
  [/Dr\.?\s*A\.?\s*G[uü]emes/gi, 'Dr. Adolfo Güemes'],
  [/Doctor\s+Adolfo\s+G[uü]emes/gi, 'Dr. Adolfo Güemes'],
  [/Dr\.?\s*Juan\s+Manuel\s+G[uü]emes/gi, 'Dr. Juan Manuel Güemes'],
  [/Gral\.?\s*Mart[ií]n\s*Miguel\s*de\s*G[uü]emes/gi, 'Avenida General Martín Miguel de Güemes'],
  [/Gral\.?\s*Mart[ií]n\s*G[uü]emes/gi, 'General Martín Güemes'],
  [/Gral\.?\s*G[uü]emes/gi, 'General Güemes'],
  [/Av\.?\s*Mart[ií]n\s*Miguel\s*de\s*G[uü]emes/gi, 'Avenida Martín Miguel de Güemes'],
  [/Avda\.?\s+/gi, 'Avenida '],
  [/Av\.?\s+/gi, 'Avenida '],
  [/Cnel\.?\s+/gi, 'Coronel '],
  [/Ing\.?\s+/gi, 'Ingeniero '],
  [/Arq\.?\s+/gi, 'Arquitecto '],
  [/Prof\.?\s+/gi, 'Profesor '],
  [/Bvd\.?\s+/gi, 'Bulevar '],
  [/Bv\.?\s+/gi, 'Bulevar '],
  [/Pje\.?\s+/gi, 'Pasaje '],
  [/Pas\.?\s+/gi, 'Pasaje '],
  [/Mtro\.?\s+R\.?\s+Alvarado/gi, 'Ministro R. Alvarado'],
  [/Gral\.?\s+R\.?\s+Alvarado/gi, 'General R. Alvarado'],
];

const LOCALITY_ONLY_RE =
  /^(salta|capital|argentina|a4400|centro|macrocentro|barrio|bº|bo\.?)\b/i;

function applyStreetNameExpansions(text) {
  let result = String(text || '');
  const fold = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  for (const [pattern, replacement] of STREET_NAME_EXPANSIONS) {
    // Evitar "Bartolomé Bartolomé Mitre" si el nombre completo ya está.
    if (fold(result).includes(fold(replacement))) continue;
    result = result.replace(pattern, replacement);
  }
  return result;
}

function formatStreetPartForPoll(streetPart) {
  let result = String(streetPart || '').trim();
  if (!result) return result;

  for (const [pattern, replacement] of GOOGLE_POLL_STREET_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  result = applyStreetNameExpansions(result);
  // Preferir español en intersecciones ("Alvarado & Santa Fe" → "Alvarado y Santa Fe").
  result = result.replace(/\s*&\s*/g, ' y ');
  return result.replace(/\s+/g, ' ').trim();
}

function normalizeForCompare(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncatePollOption(text) {
  const raw = String(text || '').trim();
  if (raw.length <= WHATSAPP_POLL_OPTION_MAX_LEN) return raw;
  return `${raw.slice(0, WHATSAPP_POLL_OPTION_MAX_LEN - 1).trim()}…`;
}

/**
 * Extrae la línea de calle/altura desde subtitle o formattedAddress.
 * Prioriza segmentos con número (ej. "Belgrano 700") y evita nombres de POI.
 */
export function extractStreetAddressForPoll(subtitle, formattedAddress) {
  const sources = [subtitle, formattedAddress]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const ranked = [];

  for (const source of sources) {
    const parts = source
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    for (const part of parts) {
      if (LOCALITY_ONLY_RE.test(part)) continue;
      if (/argentina/i.test(part)) continue;
      if (/^a?\d{4}$/i.test(part)) continue;

      const hasNumber = /\b\d{1,5}[a-z]?\b/i.test(part);
      const isPoiName = /\b(banco|cajero|shopping|hospital|macro|restaurant|restaurante|farmacia|supermercado|terminal|universidad|colegio|escuela|feria|plaza|paseo|portal|galeria|cerro|teleferico|telef[eé]rico|sanatorio)\b/i.test(part);
      const startsWithRoadType = /^(av(?:da|\.)?|avenida|calle|pasaje|pje\.?|ruta|bulevar|bv\.?)\b/i.test(part);

      if (hasNumber) {
        ranked.push({ part, priority: 3 });
        continue;
      }
      if (startsWithRoadType) {
        ranked.push({ part, priority: 2 });
        continue;
      }
      // Sin número: no usar el nombre del POI como "calle" (evita "Plaza X · Plaza X")
      if (isPoiName) continue;
      if (/^[a-záéíóúñü.\s'-]{3,}$/i.test(part)) {
        ranked.push({ part, priority: 1 });
      }
    }
  }

  ranked.sort((a, b) => b.priority - a.priority);
  return ranked[0] ? formatStreetPartForPoll(ranked[0].part) : '';
}

function titleAlreadyIncludesStreet(title, streetLine) {
  const titleNorm = normalizeForCompare(title);
  const streetNorm = normalizeForCompare(streetLine);
  if (!titleNorm || !streetNorm) return false;
  if (titleNorm === streetNorm) return true;
  if (titleNorm.includes(streetNorm) || streetNorm.includes(titleNorm)) return true;

  const streetTokens = streetNorm.split(' ').filter((t) => t.length >= 3 && !/^\d+$/.test(t));
  const matched = streetTokens.filter((token) => titleNorm.includes(token));
  return streetTokens.length > 0 && matched.length === streetTokens.length && /\d/.test(titleNorm);
}

/**
 * Etiqueta de opción de poll: calle pura, o "POI · calle altura" para bancos/shoppings/etc.
 */
export function formatPollOptionLabel(candidate = {}) {
  const title = String(candidate.pollLabel || candidate.title || '').trim();
  const streetLine = extractStreetAddressForPoll(
    candidate.subtitle,
    candidate.formattedAddress,
  );

  // Título ya es la calle (o es idéntico al "street") → no duplicar "Nombre · Nombre"
  if (title && streetLine && titleAlreadyIncludesStreet(title, streetLine)) {
    return truncatePollOption(formatStreetPartForPoll(title));
  }

  if (title && streetLine && !/\b\d{1,5}\b/.test(title)) {
    // POI sin altura en el título → agregar calle/altura
    return truncatePollOption(`${formatStreetPartForPoll(title)} · ${streetLine}`);
  }

  if (title && /\b\d{1,5}\b/.test(title)) {
    return truncatePollOption(formatStreetPartForPoll(title));
  }

  if (streetLine && !title) {
    return truncatePollOption(streetLine);
  }

  if (title && streetLine) {
    return truncatePollOption(`${formatStreetPartForPoll(title)} · ${streetLine}`);
  }

  const fromFormatted = formatAddressForWhatsAppPoll(candidate.formattedAddress);
  if (fromFormatted) return truncatePollOption(fromFormatted);

  return truncatePollOption(title);
}

/**
 * Convierte formatted_address de Google a etiqueta corta para WhatsApp (sin CP ni país).
 * @param {string} formattedAddress
 * @returns {string}
 */
export function formatAddressForWhatsAppPoll(formattedAddress) {
  const raw = String(formattedAddress || '').trim();
  if (!raw) return raw;
  if (/^ninguna\b/i.test(raw)) return raw;

  const streetPart = raw.split(',')[0].trim();
  return formatStreetPartForPoll(streetPart);
}

/**
 * @param {{ formattedAddress?: string, lat?: number, lng?: number, score?: number, pollLabel?: string, title?: string, placeId?: string, sessionToken?: string, subtitle?: string }} geoCandidate
 */
export function toPollAddressCandidate(geoCandidate) {
  const formattedAddress = geoCandidate?.formattedAddress || '';
  return {
    label: formatPollOptionLabel(geoCandidate),
    formattedAddress,
    lat: geoCandidate?.lat,
    lng: geoCandidate?.lng,
    score: geoCandidate?.score,
    placeId: geoCandidate?.placeId || null,
    sessionToken: geoCandidate?.sessionToken || null,
    title: geoCandidate?.title || null,
    subtitle: geoCandidate?.subtitle || null,
  };
}

/**
 * @param {Array<{ formattedAddress?: string, lat?: number, lng?: number }>} candidates
 * @param {{ includeNoneOption?: boolean }} [options]
 */
export function buildAddressPollPayload(candidates, { includeNoneOption = true } = {}) {
  const pollCandidates = (candidates || []).map(toPollAddressCandidate);
  const pollOptions = pollCandidates.map((c) => c.label);

  if (includeNoneOption) {
    pollOptions.push(NONE_OF_THESE_POLL_OPTION);
    pollCandidates.push({
      label: NONE_OF_THESE_POLL_OPTION,
      formattedAddress: NONE_OF_THESE_POLL_OPTION,
      lat: null,
      lng: null,
    });
  }

  return { pollOptions, pollCandidates };
}
