/**
 * Saludo de inicio de conversación WhatsApp (ambas líneas).
 * Solo en el primer mensaje de la sesión: bienvenida sin ruta, o el
 * "Tomé tu pedido..." cuando el pasajero ya mandó la dirección.
 */
import {
  isGreetingOnly,
  isShortAck,
  looksLikeAddressText,
  normalizeForMatch,
} from './whatsappTripIntentPatterns';

export const BETTO_INTRO = 'Hola, soy el Chat Bot Betto 👋';

export function buildBettoWelcomeMessage() {
  return [
    BETTO_INTRO,
    '',
    'Contame el viaje que querés tomar.',
    'Necesito *de dónde te buscamos* (calle y número, o tu ubicación) y, si ya lo sabés, *a dónde vas*.',
    '',
    'Ejemplo: _Mitre 200_ o _buscame en Mitre 200 para ir a Güemes 400_.',
  ].join('\n');
}

export function withBettoIntro(message) {
  const body = String(message || '').trim();
  if (!body) return BETTO_INTRO;
  if (body.startsWith('Hola, soy el Chat Bot Betto')) return body;
  return `${BETTO_INTRO}\n\n${body}`;
}

export function isBettoGreetedContext(context) {
  if (!context) return false;
  const raw = typeof context === 'string'
    ? (() => {
      try { return JSON.parse(context); } catch { return null; }
    })()
    : context;
  return Boolean(raw?.betto_greeted);
}

export function isAvailabilityAskWithoutRoute(text) {
  if (looksLikeAddressText(text)) return false;
  const n = normalizeForMatch(text);
  if (!n) return false;
  const asks = /\b(tenes|hay|andan|disponible|trabajan|estan|necesito|quiero|mandame|pasame)\b/.test(n);
  const vehicle = /\b(movil|moviles|remis|taxi|auto|servicio)\b/.test(n);
  return asks && vehicle;
}

export function shouldSendBettoWelcome({
  text,
  intent,
  hasConcreteAddress,
  looksLikeTripRequest: tripAsk,
} = {}) {
  if (hasConcreteAddress) return false;
  if (looksLikeAddressText(text)) return false;
  const locked = new Set(['cancel_trip', 'status_query', 'price_inquiry', 'schedule_trip', 'ask_human']);
  if (locked.has(intent)) return false;
  if (isShortAck(text)) return false;
  if (isGreetingOnly(text)) return true;
  if (isAvailabilityAskWithoutRoute(text)) return true;
  if ((intent === 'trip_request' || intent === 'other') && tripAsk) return true;
  return false;
}

export function mergeWhatsappSessionContext(prevRaw, nextContext, { sessionReset = false } = {}) {
  let prev = {};
  if (typeof prevRaw === 'string') {
    try { prev = JSON.parse(prevRaw) || {}; } catch { prev = {}; }
  } else if (prevRaw && typeof prevRaw === 'object') {
    prev = prevRaw;
  }
  const next = nextContext && typeof nextContext === 'object' && !Array.isArray(nextContext)
    ? { ...nextContext }
    : {};

  if (sessionReset) {
    if (next.betto_greeted !== true) delete next.betto_greeted;
  } else if (next.betto_greeted !== false && (next.betto_greeted || prev.betto_greeted)) {
    next.betto_greeted = true;
  }
  if (next.betto_greeted === false) delete next.betto_greeted;
  return next;
}
