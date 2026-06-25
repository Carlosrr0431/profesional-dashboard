/**
 * Detección de intención de viaje por patrones (sin LLM).
 * Basado en el análisis de chats/messages de Profesional_App (export-whatsapp-knowledge).
 */
import {
  messageConfirmsTripCancel,
  messageDeniesTripCancel,
  messageRequestsTripCancel,
  normalizePassengerMessage,
} from './passengerCancelIntent';

export const PATTERN_CONFIDENCE_THRESHOLD = 0.72;

export function normalizeForMatch(value) {
  return normalizePassengerMessage(value);
}

export function looksLikeAddressText(value) {
  if (!value || value.length < 4) return false;
  const hasStreetAndNumber = /[a-zA-ZÀ-ÿ]{2,}[\w\s.'-]*\s\d{1,5}(?:\s*[a-zA-Z]\d?)?/i.test(value);
  const hasIntersection = /\b[a-zA-ZÀ-ÿ]{2,}[\w\s.'-]*\s+y\s+[a-zA-ZÀ-ÿ]{2,}[\w\s.'-]*/i.test(value);
  const hasStreetKeyword = /\b(calle|av\.?|avenida|pasaje|pje\.?|barrio|esquina|callej[oó]n|manzana|mz\.?|lote)\b/i.test(value);
  if (hasStreetAndNumber || hasIntersection) return true;
  if (hasStreetKeyword && value.length >= 8) return true;
  return false;
}

export function looksLikeTripRequest(text) {
  const normalized = normalizeForMatch(text);
  return /(remis|taxi|movil|m[oó]vil|\bauto\b|coche|viaje|pasame\s+a\s+buscar|busc[aá][sm]e?|me\s+busc[aá]s|llevame|llevarme|quiero\s+ir|me\s+mand[aá]s?|mand[aá](?:me|as|an)?\s+(?:un|una|uno|el|la|movil|remis|taxi|auto)|ven[ií]\s+a\s+buscarme|necesito\s+(?:un|una)?\s*(?:remis|movil|taxi|auto)|quiero\s+(?:un|una)?\s*(?:remis|movil|taxi|auto))/i.test(
    normalized
  );
}

export function looksLikePriceInquiry(text) {
  const n = normalizeForMatch(text);
  return /\b(cuanto|cuánto|precio|tarifa|sale|cuesta|cobran|me\s+saldr)/i.test(n) && /\b(de|a|hasta|desde)\b/i.test(n);
}

export function looksLikeScheduleTrip(text) {
  const n = normalizeForMatch(text);
  const hasVehicle = looksLikeTripRequest(text) || /\b(remis|movil|taxi|auto|reserv)/i.test(n);
  const hasTime =
    /\b(hoy|manana|mañana|lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\b/i.test(n) ||
    /\ba\s+las\s+\d{1,2}(?::\d{2})?\b/i.test(n) ||
    /\bpara\s+las\s+\d{1,2}/i.test(n) ||
    /\breserv/i.test(n);
  return hasVehicle && hasTime;
}

export function looksLikeStatusQuery(text) {
  const n = normalizeForMatch(text);
  return /\b(donde\s+esta|donde\s+queda|cuanto\s+falta|ya\s+viene|llego\s+el|numero\s+del\s+chofer|patente|ya\s+salio|donde\s+anda)/i.test(n);
}

export function isShortAck(text) {
  const n = normalizeForMatch(text);
  if (!n || n.length > 40) return false;
  if (/^(?:ok|dale|si|sí|no|gracias|chau|listo|perfecto|genial|buenisimo|buenísimo|de\s+una|a\s+una\s+cuadra|👍|👌|🙏|✅|❌|🙂|😊)+$/.test(n)) return true;
  if (/^[\p{Emoji}\s]+$/u.test(String(text || '').trim()) && String(text || '').trim().length <= 8) return true;
  return false;
}

export function isGreetingOnly(text) {
  const n = normalizeForMatch(text);
  return /^(?:hola|buen[oa]s?(?:\s+dias?|\s+tardes?|\s+noches?)?|buenas)$/.test(n);
}

export function classifyWhatsAppIncomingText(text, { messageType = 'text' } = {}) {
  const type = String(messageType || 'text').toLowerCase();
  const content = String(text || '').trim();

  if (type === 'location' || type === 'live_location') {
    return { category: 'location_share', intentHint: 'trip_request' };
  }
  if (type === 'poll' || type === 'poll_update') {
    return { category: 'poll_response', intentHint: 'address_reply' };
  }
  if (type !== 'text' && type !== 'chat') {
    return { category: `media_${type}`, intentHint: 'other' };
  }
  if (!content) {
    return { category: 'empty', intentHint: 'other' };
  }
  if (isGreetingOnly(content)) {
    return { category: 'greeting', intentHint: 'other' };
  }
  if (isShortAck(content)) {
    return { category: 'acknowledgment', intentHint: 'other' };
  }
  if (messageRequestsTripCancel(content)) {
    return { category: 'cancel_trip', intentHint: 'cancel_trip' };
  }
  if (looksLikeStatusQuery(content)) {
    return { category: 'status_query', intentHint: 'status_query' };
  }
  if (looksLikePriceInquiry(content)) {
    return { category: 'price_inquiry', intentHint: 'price_inquiry' };
  }
  if (looksLikeScheduleTrip(content)) {
    return { category: 'schedule_trip', intentHint: 'schedule_trip' };
  }
  if (looksLikeTripRequest(content)) {
    return { category: 'trip_request', intentHint: 'trip_request' };
  }
  if (looksLikeAddressText(content) || /^\d{1,5}[a-z]?$/.test(normalizeForMatch(content))) {
    return { category: 'address_reply', intentHint: 'trip_request' };
  }

  return { category: 'conversational_other', intentHint: 'other' };
}

function emptyExtraction(passengerName = null) {
  return {
    intent: 'other',
    passenger_name: passengerName,
    pickup_location: null,
    origin: null,
    destination: null,
    notes: null,
    reply: null,
    confidence: 0,
    missing_fields: [],
    cancel_confirmed: false,
    schedule_time: null,
    source: 'pattern',
  };
}

/**
 * Intenta resolver la intención sin LLM. Devuelve confidence >= umbral si hay señal clara.
 * @param {object} params
 * @param {string} params.combinedText
 * @param {object} [params.context]
 * @param {string|null} [params.pushName]
 * @param {{ pickup?: string|null, destination?: string|null, looksLikeTripRequest?: boolean }|null} [params.heuristics]
 */
export function buildPatternTripExtraction({
  combinedText,
  context = {},
  pushName = null,
  heuristics = null,
}) {
  const text = String(combinedText || '').trim();
  const passengerName = context?.passenger_name || pushName || null;
  const base = emptyExtraction(passengerName);

  if (!text) {
    return { ...base, confidence: 0 };
  }

  if (context.pending_cancel_confirm) {
    if (messageConfirmsTripCancel(text)) {
      return {
        ...base,
        intent: 'cancel_trip',
        cancel_confirmed: true,
        confidence: 0.98,
      };
    }
    if (messageDeniesTripCancel(text)) {
      return { ...base, intent: 'other', confidence: 0.95 };
    }
  }

  if (messageRequestsTripCancel(text)) {
    return {
      ...base,
      intent: 'cancel_trip',
      cancel_confirmed: false,
      confidence: 0.92,
    };
  }

  const classified = classifyWhatsAppIncomingText(text);

  if (classified.category === 'greeting' || classified.category === 'acknowledgment') {
    return { ...base, intent: 'other', confidence: 0.9 };
  }

  if (classified.intentHint === 'status_query') {
    return {
      ...base,
      intent: 'status_query',
      confidence: 0.88,
      reply: 'Te paso el estado de tu viaje en un momento.',
    };
  }

  if (classified.intentHint === 'price_inquiry') {
    const pickup = heuristics?.pickup || null;
    const destination = heuristics?.destination || null;
    const missing = [];
    if (!pickup) missing.push('pickup_location');
    if (!destination) missing.push('destination');
    return {
      ...base,
      intent: 'price_inquiry',
      pickup_location: pickup,
      destination,
      confidence: pickup && destination ? 0.9 : 0.78,
      missing_fields: missing,
      reply: missing.length
        ? '¿Desde dónde y hasta dónde querés saber el precio?'
        : null,
    };
  }

  if (classified.intentHint === 'schedule_trip') {
    return {
      ...base,
      intent: 'schedule_trip',
      pickup_location: null,
      schedule_time: text.slice(0, 120),
      confidence: 0.65,
      missing_fields: [],
      reply: null,
    };
  }

  const tripSignal =
    !looksLikeScheduleTrip(text) &&
    (classified.intentHint === 'trip_request' ||
    classified.category === 'address_reply' ||
    classified.category === 'location_share' ||
    Boolean(heuristics?.looksLikeTripRequest));

  if (tripSignal) {
    const pickup = heuristics?.pickup || null;
    const destination = heuristics?.destination || null;
    const hasAddress = Boolean(pickup || destination || looksLikeAddressText(text));

    if (context.awaiting_pickup_number && context.pickup_location) {
      return {
        ...base,
        intent: 'trip_request',
        pickup_location: context.pickup_location,
        destination: null,
        confidence: 0.88,
        missing_fields: [],
      };
    }

    if (context.awaiting_gps && looksLikeAddressText(text)) {
      return {
        ...base,
        intent: 'trip_request',
        pickup_location: pickup,
        destination,
        confidence: pickup ? 0.9 : 0.76,
        missing_fields: pickup ? [] : ['pickup_location'],
      };
    }

    if (heuristics?.looksLikeTripRequest && hasAddress) {
      return {
        ...base,
        intent: 'trip_request',
        pickup_location: pickup,
        destination,
        confidence: pickup ? 0.93 : 0.74,
        missing_fields: pickup ? [] : ['pickup_location'],
        reply: pickup ? null : '¿Desde qué dirección te buscamos?',
      };
    }

    if (heuristics?.looksLikeTripRequest && !hasAddress) {
      return {
        ...base,
        intent: 'trip_request',
        confidence: 0.7,
        missing_fields: ['pickup_location'],
        reply: '¿Desde dónde te buscamos?',
      };
    }

    if (classified.category === 'address_reply' && (context.awaiting_gps || context.pickup_location)) {
      return {
        ...base,
        intent: 'trip_request',
        pickup_location: pickup,
        confidence: 0.82,
        missing_fields: [],
      };
    }
  }

  if (classified.category === 'conversational_other' && text.length < 8) {
    return { ...base, intent: 'other', confidence: 0.85 };
  }

  return { ...base, confidence: 0 };
}

export function shouldUsePatternExtraction(result) {
  return Number(result?.confidence) >= PATTERN_CONFIDENCE_THRESHOLD;
}
