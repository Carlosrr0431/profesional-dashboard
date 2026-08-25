/**
 * Saludo de inicio de conversación WhatsApp (ambas líneas).
 * El flag betto_greeted vale mientras hay un viaje o cotización en curso.
 * Se limpia cuando el pasajero pide un viaje nuevo, no por una ventana de tiempo.
 */
import {
  isAvailabilityAskWithoutRoute,
  isGreetingOnly,
  isShortAck,
  looksLikeAddressText,
} from './whatsappTripIntentPatterns';

export { isAvailabilityAskWithoutRoute };

export const BETTO_INTRO = 'Hola, soy el Chat Bot Betto 👋';
export const ASK_PICKUP_STREET_OR_GPS =
  'Mandame *calle y altura* (por ejemplo Mitre 200) o tu *ubicación GPS* desde WhatsApp.';

const SALTA_TZ = 'America/Argentina/Salta';
const HOLA_PREFIX_RE =
  /^(?:¡?\s*)?(?:hola(?:\s+[^,\n!]{1,40})?|buenos?\s+d[ií]as?|buen\s+d[ií]a|buenas?\s+tardes?|buenas?\s+noches?|buenas)\s*[,!]?\s*/i;
const HAS_GPS_ASK_RE = /ubicaci[oó]n\s+GPS|\bGPS\b/i;
const PICKUP_ASK_RE =
  /de d[oó]nde te buscamos|desde d[oó]nde|referencias?|punto de encuentro|calle y(?:\s+el)?\s+n[uú]mero|(?:pasame|pas[aá]s|mandame|decime).{0,40}calle/i;

export function stripLeadingHolaGreeting(text) {
  return String(text || '').trim().replace(HOLA_PREFIX_RE, '').trim();
}

export function saltaHour(now = new Date()) {
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: SALTA_TZ,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  return Number.parseInt(hourStr, 10);
}

export function greetingForSaltaHour(hour) {
  const h = Number(hour);
  if (h >= 5 && h < 12) return 'Buen día';
  if (h >= 12 && h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export function conversationalGreeting({ now } = {}) {
  return greetingForSaltaHour(saltaHour(now));
}

function isBettoIntroMessage(text) {
  const first = String(text || '').trim().split('\n', 1)[0] || '';
  if (!first) return false;
  if (first.startsWith('Hola, soy el Chat Bot Betto')) return true;
  if (/^(?:Buen d[ií]a|Buenas tardes|Buenas noches)(?: 👋)?\s*$/.test(first)) return true;
  return /^(?:Buen d[ií]a|Buenas tardes|Buenas noches), ya te mando el m[oó]vil\.?$/i.test(first);
}

function isPickupAskWithoutGps(text) {
  const raw = String(text || '');
  if (!PICKUP_ASK_RE.test(raw)) return false;
  return !HAS_GPS_ASK_RE.test(raw);
}

export function rewriteVaguePickupAsk(text) {
  const raw = String(text || '').trim();
  if (!raw) return raw;
  if (isPickupAskWithoutGps(raw)) return ASK_PICKUP_STREET_OR_GPS;
  return stripLeadingHolaGreeting(raw)
    .replace(/\bcalle y(?:\s+el)?\s+n[uú]meros?(?:\s+exactos?)?/gi, 'calle y altura')
    .replace(/\bubicaci[oó]n actual\b/gi, 'ubicación GPS');
}

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

export function isBettoGreetedContext(context) {
  return parseSessionContext(context).betto_greeted === true;
}

export function stampBettoGreeted(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  return {
    betto_greeted: true,
    betto_greeted_at: date.toISOString(),
  };
}

export function buildBettoWelcomeMessage({ now } = {}) {
  const hi = conversationalGreeting({ now });
  return [
    `${hi} 👋`,
    'Soy Betto, de Profesional.',
    '',
    'Decime el viaje que querés tomar.',
    'Necesito *de dónde te buscamos*: *calle y altura*, o tu *ubicación GPS*.',
    '',
    'Ejemplo: _Mitre 200_ o _buscame en Mitre 200 para ir a Güemes 400_.',
  ].join('\n');
}

export function withBettoIntro(message, { now } = {}) {
  const intro = conversationalGreeting({ now });
  const raw = String(message || '').trim();
  if (!raw) return intro;
  if (isBettoIntroMessage(raw)) return raw;
  const body = stripLeadingHolaGreeting(raw);
  if (!body) return intro;
  if (isBettoIntroMessage(body)) return body;
  return `${intro}\n\n${body}`;
}

export function buildTripTakenReply({
  includeGreeting = false,
  now,
  followup = null,
} = {}) {
  const line = includeGreeting
    ? `${conversationalGreeting({ now })}, ya te mando el móvil.`
    : 'Ya te mando el móvil.';
  const extra = String(followup || '').trim();
  return extra ? `${line}\n${extra}` : line;
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

function resolveGreetedAtIso(prev, next, nowMs, sessionReset) {
  if (!sessionReset && isBettoGreetedContext(prev) && prev.betto_greeted_at) {
    return prev.betto_greeted_at;
  }
  if (next.betto_greeted_at) return next.betto_greeted_at;
  return new Date(nowMs).toISOString();
}

export function mergeWhatsappSessionContext(prevRaw, nextContext, { sessionReset = false, now = Date.now() } = {}) {
  const prev = parseSessionContext(prevRaw);
  const next = nextContext && typeof nextContext === 'object' && !Array.isArray(nextContext)
    ? { ...nextContext }
    : {};
  const nowMs = typeof now === 'number' ? now : new Date(now).getTime();
  const prevStillGreeted = !sessionReset && isBettoGreetedContext(prev);
  const nextClears = next.betto_greeted === false;
  const nextMarksGreeted = next.betto_greeted === true || Boolean(next.betto_greeted_at);

  if (nextClears) {
    delete next.betto_greeted;
    delete next.betto_greeted_at;
  } else if (nextMarksGreeted || prevStillGreeted) {
    next.betto_greeted = true;
    next.betto_greeted_at = resolveGreetedAtIso(prev, next, nowMs, sessionReset);
  } else {
    delete next.betto_greeted;
    delete next.betto_greeted_at;
  }
  return next;
}
