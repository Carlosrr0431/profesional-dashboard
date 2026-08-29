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

const AVAILABILITY_ASK_RE =
  /\b(tenes|tenés|tiene|tienen|hay|andan|andas|disponible|trabajan|estan|están|anda)\b/;
const VEHICLE_WORD_RE = /\b(movil|moviles|m[oó]vil|m[oó]viles|remis|taxi|auto|servicio)\b/;
const ADDRESS_NOISE_WORDS = new Set([
  'tenes', 'tene', 'tiene', 'tienen', 'hay', 'andan', 'andas', 'anda',
  'disponible', 'trabajan', 'estan', 'necesito', 'quiero', 'mandame', 'pasame',
  'hola', 'buenas', 'buenos', 'movil', 'moviles', 'remis', 'taxi', 'auto',
  'servicio', 'un', 'una', 'unos', 'unas', 'el', 'la', 'los', 'las', 'me',
  'por', 'favor', 'hola',
]);

export function isAddressNoisePhrase(value) {
  const n = normalizeForMatch(value);
  if (!n) return true;
  const tokens = n.split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((token) => ADDRESS_NOISE_WORDS.has(token));
}

export function isAvailabilityAskWithoutRoute(text) {
  if (looksLikeAddressText(text)) return false;
  const n = normalizeForMatch(text);
  if (!n) return false;
  if (!AVAILABILITY_ASK_RE.test(n) || !VEHICLE_WORD_RE.test(n)) return false;
  const leftover = n
    .replace(AVAILABILITY_ASK_RE, ' ')
    .replace(VEHICLE_WORD_RE, ' ')
    .replace(/\b(un|una|unos|unas|el|la|los|las|me|por|favor|hola|buenas?|necesito|quiero)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (looksLikeAddressText(leftover)) return false;
  if (leftover.length >= 4 && /\d/.test(leftover)) return false;
  return leftover.length < 4 || isAddressNoisePhrase(leftover);
}

export function looksLikeTripRequest(text) {
  if (isAvailabilityAskWithoutRoute(text)) return false;
  const normalized = normalizeForMatch(text);
  return /(remis|taxi|movil|m[oó]vil|\bauto\b|coche|viaje|pasame\s+a\s+buscar|busc[aá][sm]e?|me\s+busc[aá]s|llevame|llevarme|quiero\s+ir|me\s+mand[aá]s?|mand[aá](?:me|as|an)?\s+(?:un|una|uno|el|la|movil|remis|taxi|auto)|ven[ií]\s+a\s+buscarme|necesito\s+(?:un|una)?\s*(?:remis|movil|taxi|auto)|quiero\s+(?:un|una)?\s*(?:remis|movil|taxi|auto))/i.test(
    normalized
  );
}

export function looksLikePriceInquiry(text) {
  const n = normalizeForMatch(text);
  if (!n) return false;
  if (/\b(cotiz(?:ar|aci[oó]n)?)\b/.test(n)) return true;
  if (/\b(precio|tarifa)\b/.test(n)) return true;
  if (/\bcu[aá]nto\b/.test(n) && /\b(sale|cuesta|cobran|saldr)/.test(n)) return true;
  if (/\bme\s+saldr/.test(n)) return true;
  return false;
}

export function looksLikeExplicitVehicleDispatch(text) {
  if (looksLikePriceInquiry(text)) return false;
  const n = normalizeForMatch(text);
  if (!n) return false;
  return /(remis|taxi|m[oó]vil|movil|pasame\s+a\s+buscar|busc[aá]me|mand[aá](?:me|as|an)?\s+(?:un|una|el|la)?\s*(?:remis|movil|m[oó]vil|taxi|auto)|envi(?:ame|anos|ar)?\s+(?:un|una|el|la)?\s*(?:remis|movil|m[oó]vil|taxi|auto)|necesito\s+(?:un|una)?\s*(?:remis|movil|m[oó]vil|taxi|auto))/.test(n);
}

/**
 * Pedido fresco de móvil (no saludo, no status, no "ok").
 * Un "viaje" suelto no alcanza: hace falta móvil/remis o pedido + dirección.
 */
export function looksLikeFreshTripRequest(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (isGreetingOnly(raw) || isShortAck(raw) || looksLikeStatusQuery(raw)) return false;
  if (messageRequestsTripCancel(raw)) return false;
  if (looksLikePriceInquiry(raw)) return false;
  if (looksLikeExplicitVehicleDispatch(raw)) return true;
  return looksLikeTripRequest(raw) && looksLikeAddressText(raw);
}

/**
 * Si el batch junta varios mensajes (voto de encuesta + pedido nuevo), prioriza
 * la última línea cuando es un pedido fresco de móvil.
 */
export function pickIntentClassificationText(combinedText) {
  const raw = String(combinedText || '').trim();
  if (!raw) return '';
  const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) return raw;
  const lastLine = lines[lines.length - 1];
  if (looksLikeFreshTripRequest(lastLine)) return lastLine;
  return raw;
}

export function isPriceInquiryCollecting(context) {
  return Boolean(
    context?.price_inquiry
    || context?.awaiting_price_origin
    || context?.awaiting_price_destination
  );
}

export function shouldPreservePriceQuoteAfterTripReset(savedContext) {
  return isPriceInquiryCollecting(savedContext)
    || lastBotAskedForTripPrice(savedContext?.last_bot_reply);
}

export function lastBotAskedForTripPrice(text) {
  const n = normalizeForMatch(text);
  if (!n) return false;
  return (
    n.includes('para darte el precio')
    || n.includes('precio necesito las dos')
    || (n.includes('origen del viaje') && n.includes('precio'))
    || (n.includes('destino del viaje') && n.includes('precio'))
    || n.includes('desde donde y hasta donde')
    || n.includes('hasta donde queres saber el precio')
  );
}

export function buildPriceInquiryMissingAddressReply(missingPart) {
  const part = missingPart === 'destino' ? 'destino' : 'origen';
  return `Para darte el precio necesito las dos direcciones. ¿Cuál es el *${part}* del viaje? (calle y número)`;
}

export function buildPriceInquiryCollectingContext({
  origin = null,
  destination = null,
  passengerName = null,
  lastBotReply = null,
} = {}) {
  const pickup = origin || null;
  const dest = destination || null;
  return {
    passenger_name: passengerName || null,
    price_inquiry: true,
    awaiting_price_origin: !pickup,
    awaiting_price_destination: Boolean(pickup && !dest),
    pickup_location: pickup,
    origin: pickup,
    destination: dest,
    last_bot_reply: lastBotReply || null,
  };
}

function looksLikeTimeFragment(value) {
  const n = normalizeForMatch(value);
  return /^(?:a\s+)?las?\s+\d{1,2}(?::\d{2})?(?:\s*(?:hs|hrs|horas?))?$/.test(n);
}

export function parseOriginDestinationPair(text) {
  const src = String(text || '').trim();
  if (!src) return null;

  const asPair = (left, right) => {
    const pickup = String(left || '').trim().replace(/[.,;]+$/g, '');
    const destination = String(right || '')
      .trim()
      .replace(/^[.,;]+/g, '')
      .replace(/[?.,!]+$/g, '');
    if (!looksLikeAddressText(pickup) || !looksLikeAddressText(destination)) return null;
    if (looksLikeTimeFragment(pickup) || looksLikeTimeFragment(destination)) return null;
    if (normalizeForMatch(pickup) === normalizeForMatch(destination)) return null;
    return { pickup, destination };
  };

  const patterns = [
    /(?:^|\s)(?:de|desde)\s+(.+?)\s+(?:a|hasta|hacia)\s+(.+)$/i,
    /^(.+?)\s+(?:es\s+)?para\s+ir\s+(?:hasta|a)\s+(.+)$/i,
    /^(.+?)\s+(?:me\s+)?voy\s+(?:para|hasta|a)\s+(.+)$/i,
    /^(.+?)\s+(?:hasta|hacia)\s+(.+)$/i,
    /(?:retiro|origen)\s*:?\s*(.+?)\s+(?:destino)\s*:?\s*(.+)$/i,
    /^(.+?)\s+a\s+(.+)$/i,
    /^(.+?)\s*[,/]\s*(.+)$/,
  ];

  for (const regex of patterns) {
    const match = src.match(regex);
    if (!match) continue;
    const pair = asPair(match[1], match[2]);
    if (pair) return pair;
  }

  const lines = src.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 2) {
    const pair = asPair(lines[0], lines[1]);
    if (pair) return pair;
  }

  return null;
}

function resolvePriceInquirySlot(context, lastBotReply) {
  if (context?.awaiting_price_destination) return 'destination';
  if (context?.awaiting_price_origin) return 'origin';
  if (context?.pickup_location && !context?.destination) return 'destination';
  const n = normalizeForMatch(lastBotReply);
  if (/destino del viaje/.test(n)) return 'destination';
  if (/origen del viaje/.test(n) || /desde donde/.test(n)) return 'origin';
  if (lastBotAskedForTripPrice(lastBotReply) || context?.price_inquiry) {
    return context?.pickup_location ? 'destination' : 'origin';
  }
  return null;
}

function loneAddressFromText(text, heuristics) {
  if (heuristics?.pickup && heuristics?.destination) return null;
  if (heuristics?.pickup) return heuristics.pickup;
  if (heuristics?.destination) return heuristics.destination;
  const raw = String(text || '').trim();
  if (looksLikeAddressText(raw)) return raw;
  return null;
}

export function fillPriceInquiryAddresses({
  text,
  context = {},
  heuristics = null,
  lastBotReply = null,
} = {}) {
  const prevPickup = context.pickup_location || context.origin || null;
  const prevDest = context.destination || null;
  const collecting = isPriceInquiryCollecting(context) || lastBotAskedForTripPrice(lastBotReply);
  const priceAskWithoutAddress =
    looksLikePriceInquiry(text)
    && !collecting
    && !parseOriginDestinationPair(text)
    && !looksLikeAddressText(text);
  if (priceAskWithoutAddress) {
    return { pickup: prevPickup, destination: prevDest };
  }
  const pair = parseOriginDestinationPair(text)
    || (heuristics?.pickup && heuristics?.destination
      ? { pickup: heuristics.pickup, destination: heuristics.destination }
      : null);
  if (pair?.pickup && pair?.destination) {
    return pair;
  }
  const slot = resolvePriceInquirySlot(context, lastBotReply);
  const lone = loneAddressFromText(text, heuristics);
  if (slot === 'destination') {
    return { pickup: prevPickup, destination: heuristics?.destination || lone || prevDest };
  }
  if (slot === 'origin') {
    return { pickup: heuristics?.pickup || lone || prevPickup, destination: prevDest };
  }
  return {
    pickup: heuristics?.pickup || prevPickup,
    destination: heuristics?.destination || prevDest,
  };
}

function buildPriceInquiryPatternResult(base, pickup, destination) {
  const missing = [];
  if (!pickup) missing.push('pickup_location');
  if (!destination) missing.push('destination');
  return {
    ...base,
    intent: 'price_inquiry',
    pickup_location: pickup || null,
    origin: pickup || null,
    destination: destination || null,
    confidence: pickup && destination ? 0.92 : 0.88,
    missing_fields: missing,
    reply: missing.length
      ? buildPriceInquiryMissingAddressReply(!pickup ? 'origen' : 'destino')
      : null,
  };
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
  return /\b(donde\s+esta|donde\s+queda|cuanto\s+(?:falta|tarda|demora)|en\s+cuanto\s+llega|ya\s+viene|llego\s+el|numero\s+del\s+chofer|patente|ya\s+salio|donde\s+anda|quien\s+(?:es|era|viene)|el\s+chofer|ya\s+sale|por\s+donde\s+viene|demora)\b/i.test(n);
}

export function isShortAck(text) {
  const n = normalizeForMatch(text);
  if (!n || n.length > 40) return false;
  if (/^\d{1,5}[a-z]?$/.test(n)) return false;
  if (/^(?:ok|dale|si|sí|no|gracias|chau|listo|perfecto|genial|buenisimo|buenísimo|de\s+una|a\s+una\s+cuadra|👍|👌|🙏|✅|❌|🙂|😊)+$/.test(n)) return true;
  if (/^[\p{Emoji}\s]+$/u.test(String(text || '').trim()) && String(text || '').trim().length <= 8) return true;
  return false;
}

export function isGreetingOnly(text) {
  const n = normalizeForMatch(text);
  return /^(?:hola|buen[oa]s?(?:\s+dias?|\s+tardes?|\s+noches?)?|buenas|we[nñ]o|weno|bueno|como\s+estas|que\s+tal|todo\s+bien)$/.test(n);
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
  if (isAvailabilityAskWithoutRoute(content)) {
    return { category: 'availability_ask', intentHint: 'other' };
  }
  if (isShortAck(content)) {
    return { category: 'acknowledgment', intentHint: 'other' };
  }
  if (looksLikeFreshTripRequest(content)) {
    return { category: 'trip_request', intentHint: 'trip_request' };
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
  const intentSource = pickIntentClassificationText(text);
  const passengerName = context?.passenger_name || pushName || null;
  const base = emptyExtraction(passengerName);

  if (!text) {
    return { ...base, confidence: 0 };
  }

  if (looksLikeFreshTripRequest(intentSource)) {
    const classifiedFresh = classifyWhatsAppIncomingText(intentSource);
    if (classifiedFresh.intentHint === 'trip_request' || classifiedFresh.category === 'address_reply') {
      const pickup = heuristics?.pickup || null;
      const destination = heuristics?.destination || null;
      const hasAddress = Boolean(pickup || destination || looksLikeAddressText(intentSource));
      return {
        ...base,
        intent: 'trip_request',
        pickup_location: pickup,
        destination,
        confidence: pickup ? 0.93 : (hasAddress ? 0.88 : 0.74),
        missing_fields: pickup ? [] : ['pickup_location'],
        reply: pickup ? null : '¿Desde qué dirección te buscamos?',
      };
    }
  }

  if (context.pending_cancel_confirm) {
    if (messageConfirmsTripCancel(intentSource)) {
      return {
        ...base,
        intent: 'cancel_trip',
        cancel_confirmed: true,
        confidence: 0.98,
      };
    }
    if (messageDeniesTripCancel(intentSource)) {
      return { ...base, intent: 'other', confidence: 0.95 };
    }
  }

  if (messageRequestsTripCancel(intentSource)) {
    return {
      ...base,
      intent: 'cancel_trip',
      cancel_confirmed: false,
      confidence: 0.92,
    };
  }

  const classified = classifyWhatsAppIncomingText(intentSource);
  const lastBotReply = context.last_bot_reply || null;
  const collectingPrice = isPriceInquiryCollecting(context) || lastBotAskedForTripPrice(lastBotReply);
  const stayOnPriceQuote =
    collectingPrice
    && !looksLikeExplicitVehicleDispatch(text)
    && classified.intentHint !== 'cancel_trip'
    && classified.intentHint !== 'status_query';

  if (classified.category === 'greeting' || classified.category === 'acknowledgment') {
    if (stayOnPriceQuote) {
      const filled = fillPriceInquiryAddresses({
        text: '',
        context,
        heuristics: null,
        lastBotReply,
      });
      return buildPriceInquiryPatternResult(base, filled.pickup, filled.destination);
    }
    return { ...base, intent: 'other', confidence: 0.9 };
  }

  if (classified.category === 'availability_ask' || isAvailabilityAskWithoutRoute(text)) {
    return { ...base, intent: 'other', confidence: 0.88 };
  }

  if (classified.intentHint === 'status_query') {
    return {
      ...base,
      intent: 'status_query',
      confidence: 0.88,
      reply: 'Te paso el estado de tu viaje en un momento.',
    };
  }

  if (classified.intentHint === 'price_inquiry' || stayOnPriceQuote) {
    const filled = fillPriceInquiryAddresses({
      text,
      context,
      heuristics,
      lastBotReply,
    });
    return buildPriceInquiryPatternResult(base, filled.pickup, filled.destination);
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
