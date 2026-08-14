/**
 * Saludo de inicio de conversación WhatsApp (ambas líneas).
 * Una vez por ventana de 30 minutos: bienvenida sin ruta, o el
 * "Tomé tu pedido..." cuando el pasajero ya mandó la dirección.
 */
import {
  isAvailabilityAskWithoutRoute,
  isGreetingOnly,
  isShortAck,
  looksLikeAddressText,
} from './whatsappTripIntentPatterns';

export { isAvailabilityAskWithoutRoute };

export const BETTO_INTRO = 'Hola, soy el Chat Bot Betto 👋';
export const BETTO_GREETING_TTL_MS = 30 * 60 * 1000;

function parseSessionContext(context) {
  if (!context) return {};
  if (typeof context === 'string') {
    try {
      const parsed = JSON.parse(context);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof context === 'object' && !Array.isArray(context)) return context;
  return {};
}

export function getBettoGreetedAtMs(context) {
  const raw = parseSessionContext(context);
  if (!raw.betto_greeted_at) return null;
  const ms = new Date(raw.betto_greeted_at).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

export function isBettoGreetedContext(context, now = Date.now()) {
  const raw = parseSessionContext(context);
  const at = getBettoGreetedAtMs(raw);
  if (at == null) return false;
  return now - at < BETTO_GREETING_TTL_MS;
}

export function stampBettoGreeted(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  return {
    betto_greeted: true,
    betto_greeted_at: date.toISOString(),
  };
}

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

function resolveGreetedAtIso(prev, next, nowMs) {
  if (isBettoGreetedContext(prev, nowMs) && prev.betto_greeted_at) {
    return prev.betto_greeted_at;
  }
  if (next.betto_greeted_at) return next.betto_greeted_at;
  return new Date(nowMs).toISOString();
}

export function mergeWhatsappSessionContext(prevRaw, nextContext, { sessionReset = false, now = Date.now() } = {}) {
  void sessionReset;
  const prev = parseSessionContext(prevRaw);
  const next = nextContext && typeof nextContext === 'object' && !Array.isArray(nextContext)
    ? { ...nextContext }
    : {};
  const nowMs = typeof now === 'number' ? now : new Date(now).getTime();
  const prevStillGreeted = isBettoGreetedContext(prev, nowMs);
  const nextClears = next.betto_greeted === false;
  const nextMarksGreeted = next.betto_greeted === true || Boolean(next.betto_greeted_at);

  if (nextClears) {
    delete next.betto_greeted;
    delete next.betto_greeted_at;
  } else if (nextMarksGreeted || prevStillGreeted) {
    next.betto_greeted = true;
    next.betto_greeted_at = resolveGreetedAtIso(prev, next, nowMs);
  } else {
    delete next.betto_greeted;
    delete next.betto_greeted_at;
  }
  return next;
}
