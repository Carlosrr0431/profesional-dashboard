/**
 * Etiquetas legibles para encuestas de dirección en WhatsApp.
 * Google suele devolver abreviaturas (ej. "Dr. A. Güemes"); el pasajero ve el nombre completo.
 */

export const NONE_OF_THESE_POLL_OPTION = 'Ninguna de estas opciones';

/** Apellido de prócer → nombre completo (solo visualización en poll). */
const STREET_NAME_EXPANSIONS = [
  [/\bmitre\b/gi, 'Bartolomé Mitre'],
  [/\balberdi\b/gi, 'Juan Bautista Alberdi'],
  [/\brivadavia\b/gi, 'Bernardino Rivadavia'],
  [/\bpellegrini\b/gi, 'Carlos Pellegrini'],
  [/\bpueyrred[oó]n\b/gi, 'Mariano Pueyrredón'],
  [/\bsarmiento\b/gi, 'Domingo F. Sarmiento'],
  [/\byrigoyen\b/gi, 'Hipólito Yrigoyen'],
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

function applyStreetNameExpansions(text) {
  let result = String(text || '');
  for (const [pattern, replacement] of STREET_NAME_EXPANSIONS) {
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
  return result.replace(/\s+/g, ' ').trim();
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
  const customLabel = String(
    geoCandidate?.pollLabel || geoCandidate?.title || '',
  ).trim();
  return {
    label: customLabel || formatAddressForWhatsAppPoll(formattedAddress),
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
