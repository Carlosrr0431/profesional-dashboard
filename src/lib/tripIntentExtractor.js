/**
 * Extracción híbrida: patrones baratos (saludo, ack, cancel) sin LLM.
 * El resto lo decide DeepSeek Pro. Si Pro deja pickup en null, no se rellena
 * con heurística. Disponibilidad sin calle no es un viaje.
 */
import {
  deepseekRespondWithTools,
  getDeepSeekProModel,
  isDeepSeekConfigured,
} from './deepseekClient';
import {
  buildTripIntentSystemPrompt,
  buildTripIntentTurnPreamble,
  pickTripIntentReasoningEffort,
} from './tripIntentSystemPrompt';
import { TRIP_INTENT_JSON_SCHEMA, TRIP_INTENT_TOOLS } from './tripIntentSchema';
import { loadTripIntentSettings, runTripIntentTool } from './tripIntentTools';
import {
  buildPatternTripExtraction,
  fillPriceInquiryAddresses,
  isAddressNoisePhrase,
  isAvailabilityAskWithoutRoute,
  isGreetingOnly,
  isPriceInquiryCollecting,
  isShortAck,
  lastBotAskedForTripPrice,
  looksLikeExplicitVehicleDispatch,
  looksLikePriceInquiry,
  PATTERN_CONFIDENCE_THRESHOLD,
  shouldUsePatternExtraction,
  buildPriceInquiryMissingAddressReply,
} from './whatsappTripIntentPatterns';
import {
  ASK_PICKUP_STREET_OR_GPS,
  rewriteVaguePickupAsk,
} from './bettoWelcome';
import {
  sanitizeAddressInput,
  normalizeAddressPhrase,
} from '../../shared/salta-address.js';
import { stripTrailingTripRouteTail } from './whatsappTripAddressParse.js';

const DEFAULT_EXTRACTION = {
  intent: 'other',
  passenger_name: null,
  pickup_location: null,
  origin: null,
  destination: null,
  notes: null,
  reply: null,
  confidence: 0,
  missing_fields: [],
  cancel_confirmed: false,
  schedule_time: null,
  new_trip: false,
};

const ALLOWED_INTENTS = new Set([
  'trip_request',
  'price_inquiry',
  'status_query',
  'cancel_trip',
  'schedule_trip',
  'ask_human',
  'other',
]);

const AVAILABILITY_REPLY =
  `Sí, estamos en servicio. ${ASK_PICKUP_STREET_OR_GPS}`;

function maskPhoneForLog(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  return `*********${digits.slice(-4)}`;
}

function normalizeExtractedAddress(value) {
  const stripped = stripTrailingTripRouteTail(value);
  const normalized = normalizeAddressPhrase(stripped || value || '');
  const sanitized = sanitizeAddressInput(normalized) || null;
  if (!sanitized) return null;
  if (isAddressNoisePhrase(sanitized)) return null;
  return sanitized;
}

function shouldSkipLlmForPattern(patternResult, text, context = {}) {
  if (isGreetingOnly(text) || isShortAck(text)) return true;
  if (context.awaiting_pickup_number || context.awaiting_gps) return false;
  if (isAvailabilityAskWithoutRoute(text)) return false;
  const intent = String(patternResult?.intent || '');
  if (intent === 'cancel_trip' && shouldUsePatternExtraction(patternResult)) {
    return true;
  }
  if (intent === 'price_inquiry' && shouldUsePatternExtraction(patternResult)) {
    return true;
  }
  return false;
}

function stripPatternSource(patternResult) {
  const { source: _source, ...rest } = patternResult || {};
  return rest;
}

function sanitizePatternFallback(patternFallback, combinedText, context = {}) {
  void context;
  const rest = stripPatternSource(patternFallback);
  const reply = rest.reply ? rewriteVaguePickupAsk(rest.reply) : rest.reply;
  if (isAvailabilityAskWithoutRoute(combinedText)) {
    return {
      ...rest,
      intent: 'other',
      pickup_location: null,
      origin: null,
      destination: null,
      reply: reply || AVAILABILITY_REPLY,
    };
  }
  if (isGreetingOnly(combinedText)) {
    return {
      ...rest,
      intent: 'other',
      pickup_location: null,
      origin: null,
      destination: null,
      reply: reply || ASK_PICKUP_STREET_OR_GPS,
    };
  }
  if (isAddressNoisePhrase(rest.pickup_location)) {
    return { ...rest, pickup_location: null, reply };
  }
  return { ...rest, reply };
}

function normalizeProExtraction(parsed, passengerName, combinedText) {
  const pickup = normalizeExtractedAddress(parsed.pickup_location);
  const destination = normalizeExtractedAddress(parsed.destination);
  const origin = normalizeExtractedAddress(parsed.origin) || pickup;
  let intent = ALLOWED_INTENTS.has(parsed.intent) ? parsed.intent : 'other';
  let reply = parsed.reply == null ? null : rewriteVaguePickupAsk(String(parsed.reply).trim()) || null;

  const availabilityWithoutRoute =
    isAvailabilityAskWithoutRoute(combinedText) && !pickup && !destination;
  if (availabilityWithoutRoute) {
    intent = 'other';
    reply = reply || AVAILABILITY_REPLY;
  }

  let missing = Array.isArray(parsed.missing_fields) ? [...parsed.missing_fields] : [];
  if (intent === 'trip_request' && !pickup && !missing.includes('pickup_location')) {
    missing.push('pickup_location');
  }
  if (pickup) {
    missing = missing.filter((field) => field !== 'pickup_location');
  }
  if (intent === 'other') {
    missing = [];
  }

  return {
    ...DEFAULT_EXTRACTION,
    ...parsed,
    intent,
    passenger_name: parsed.passenger_name || passengerName || null,
    pickup_location: availabilityWithoutRoute ? null : pickup,
    origin: availabilityWithoutRoute ? null : origin,
    destination: availabilityWithoutRoute ? null : destination,
    reply,
    missing_fields: missing,
    confidence: Number(parsed.confidence) || 0,
    cancel_confirmed: Boolean(parsed.cancel_confirmed),
    new_trip: parsed.new_trip === true || parsed.new_trip === 'true',
    source: 'deepseek-pro',
  };
}

export function parseTripIntentJson(raw, fallback = DEFAULT_EXTRACTION) {
  const text = String(raw || '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { ...fallback };
  const payload = match[0]
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/:\s*undefined\b/g, ': null');
  try {
    return { ...fallback, ...JSON.parse(payload) };
  } catch {
    return { ...fallback };
  }
}

/**
 * @param {object} params
 * @param {function} [params.inferHeuristics] — inferTripHeuristics del route
 * @param {function} [params.logFn]
 */
function applyPriceInquiryContinuation(result, combinedText, context, lastBotReply, heuristics) {
  if (!result) return result;
  if (result.intent === 'cancel_trip' || result.intent === 'status_query') return result;
  if (looksLikeExplicitVehicleDispatch(combinedText)) return result;

  const collecting = isPriceInquiryCollecting(context) || lastBotAskedForTripPrice(lastBotReply);
  if (!collecting && result.intent !== 'price_inquiry' && !looksLikePriceInquiry(combinedText)) {
    return result;
  }

  const filled = fillPriceInquiryAddresses({
    text: combinedText,
    context,
    heuristics: {
      pickup: result.pickup_location || heuristics?.pickup || null,
      destination: result.destination || heuristics?.destination || null,
    },
    lastBotReply,
  });
  const missing = [];
  if (!filled.pickup) missing.push('pickup_location');
  if (!filled.destination) missing.push('destination');
  return {
    ...result,
    intent: 'price_inquiry',
    pickup_location: filled.pickup,
    origin: filled.pickup,
    destination: filled.destination,
    missing_fields: missing,
    reply: missing.length
      ? buildPriceInquiryMissingAddressReply(!filled.pickup ? 'origen' : 'destino')
      : result.reply,
  };
}

export async function extractTripIntentHybrid({
  combinedText,
  context,
  pushName,
  phone,
  history = [],
  conversationStatus = 'open',
  lastBotReply = null,
  inferHeuristics,
  logFn,
}) {
  const heuristics = typeof inferHeuristics === 'function' ? inferHeuristics(combinedText) : null;
  const patternContext = {
    ...(context || {}),
    last_bot_reply: lastBotReply || context?.last_bot_reply || null,
  };

  const patternResult = buildPatternTripExtraction({
    combinedText,
    context: patternContext,
    pushName,
    heuristics,
  });

  if (shouldSkipLlmForPattern(patternResult, combinedText, context) || !isDeepSeekConfigured()) {
    if (logFn) {
      logFn('ai_extract_intent_pattern_hit', {
        phone: maskPhoneForLog(phone),
        intent: patternResult.intent,
        confidence: patternResult.confidence,
        source: 'pattern',
      });
    }
    return applyPriceInquiryContinuation(
      sanitizePatternFallback(patternResult, combinedText, context),
      combinedText,
      patternContext,
      lastBotReply,
      heuristics,
    );
  }

  if (logFn) {
    logFn('ai_extract_intent_deepseek_pro', {
      phone: maskPhoneForLog(phone),
      patternIntent: patternResult.intent,
      patternConfidence: patternResult.confidence,
      patternPickup: patternResult.pickup_location ? '[set]' : null,
    });
  }

  return extractTripIntentWithDeepSeek({
    combinedText,
    context: patternContext,
    pushName,
    phone,
    history,
    conversationStatus,
    lastBotReply,
    patternFallback: patternResult,
    heuristics,
    logFn,
  });
}

async function extractTripIntentWithDeepSeek({
  combinedText,
  context,
  pushName,
  phone,
  history = [],
  conversationStatus = 'open',
  lastBotReply = null,
  patternFallback = null,
  heuristics = null,
  logFn,
}) {
  const passengerName = context?.passenger_name || pushName || null;
  const awaitingGps = Boolean(context?.awaiting_gps);
  const awaitingPickupNumber = Boolean(context?.awaiting_pickup_number);
  const pendingCancelConfirm = Boolean(context?.pending_cancel_confirm);
  const collectingPrice = isPriceInquiryCollecting(context) || lastBotAskedForTripPrice(lastBotReply);
  const knownPickup = (awaitingPickupNumber || awaitingGps || collectingPrice)
    ? (context?.pickup_location || context?.origin || null)
    : null;

  const stateDescription = {
    open: collectingPrice
      ? (context?.awaiting_price_destination || knownPickup
        ? 'Cotización de precio: esperando DESTINO (calle y número). No despaches el móvil.'
        : 'Cotización de precio: esperando ORIGEN (calle y número). No despaches el móvil.')
      : awaitingPickupNumber
        ? 'Esperando altura/número de calle de retiro.'
        : awaitingGps
          ? 'Esperando ubicación GPS o dirección de retiro.'
          : 'Sin viaje activo.',
    awaiting_address_selection: 'Esperando elección de dirección en encuesta.',
    paused: 'Conversación pausada.',
  }[conversationStatus] || 'Sin viaje activo.';

  const systemPrompt = buildTripIntentSystemPrompt();
  const reasoningEffort = pickTripIntentReasoningEffort({ text: combinedText, context });
  const settingsPromise = loadTripIntentSettings();
  const turnPreamble = buildTripIntentTurnPreamble({
    stateDescription,
    passengerName,
    awaitingGps,
    awaitingPickupNumber,
    pendingCancelConfirm,
    lastBotReply,
    knownPickup,
    collectingPrice,
    awaitingPriceOrigin: Boolean(context?.awaiting_price_origin) || (collectingPrice && !knownPickup),
    awaitingPriceDestination: Boolean(context?.awaiting_price_destination) || (collectingPrice && Boolean(knownPickup) && !context?.destination),
    lastTripStatus: context?.last_trip_status || null,
    lastTripOrigin: context?.last_trip_origin || context?.pickup_location || context?.origin || null,
  });

  const historyMessages = history
    .filter((item) => Boolean(item.transcription || item.content))
    .slice(-6)
    .map((item) => ({
      role: item.direction === 'outgoing' ? 'assistant' : 'user',
      content: String(item.transcription || item.content || '').slice(0, 200),
    }));

  const contextForModel = Object.fromEntries(
    Object.entries(context || {}).filter(
      ([k]) => !['last_bot_reply', 'pending_poll'].includes(k)
    )
  );

  const patternHint = patternFallback
    ? `Detección automática previa (puede estar mal; no la copies si no hay calle real): intent=${patternFallback.intent || 'other'}, retiro="${patternFallback.pickup_location || ''}", destino="${patternFallback.destination || ''}"`
    : null;

  const userContent = [
    turnPreamble,
    passengerName ? `Nombre: ${passengerName}` : null,
    Object.keys(contextForModel).length > 0 ? `Contexto: ${JSON.stringify(contextForModel)}` : null,
    patternHint,
    `Mensaje actual del pasajero:\n${combinedText}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const model = getDeepSeekProModel();

  try {
    const result = await deepseekRespondWithTools({
      instructions: systemPrompt,
      userContent,
      historyMessages,
      tools: TRIP_INTENT_TOOLS,
      jsonSchema: TRIP_INTENT_JSON_SCHEMA,
      runTool: async (name, args) => runTripIntentTool(name, args, {
        phone,
        settings: await settingsPromise,
      }),
      maxRounds: 4,
      maxOutputTokens: reasoningEffort === 'none' ? 360 : 700,
      reasoningEffort,
      logFn,
      purpose: 'trip_intent',
      model,
    });

    const parsed = normalizeProExtraction(
      parseTripIntentJson(result.text, {
        ...DEFAULT_EXTRACTION,
        passenger_name: passengerName,
      }),
      passengerName,
      combinedText,
    );

    if (logFn) {
      logFn('ai_extract_intent_ok', {
        intent: parsed.intent,
        confidence: parsed.confidence,
        source: 'deepseek-pro',
        model,
        api: result.api,
        reasoningEffort,
        pickup: parsed.pickup_location ? '[set]' : null,
        destination: parsed.destination ? '[set]' : null,
        hasReply: Boolean(parsed.reply),
      });
    }

    return applyPriceInquiryContinuation(
      parsed,
      combinedText,
      context,
      lastBotReply,
      heuristics,
    );
  } catch (error) {
    const status = Number(error?.status || 0);
    if (logFn) {
      logFn('ai_extract_intent_provider_error', {
        provider: 'deepseek',
        model,
        status: status || null,
        message: error?.message || 'unknown_error',
        fallbackUsed: true,
      });
    }

    if (patternFallback) {
      const patternConfidence = Number(patternFallback.confidence) || 0;
      const patternIntent = String(patternFallback.intent || '');
      if (
        patternConfidence >= PATTERN_CONFIDENCE_THRESHOLD
        || patternIntent === 'trip_request'
        || patternConfidence > 0.5
      ) {
        return applyPriceInquiryContinuation(
          sanitizePatternFallback(patternFallback, combinedText, context),
          combinedText,
          context,
          lastBotReply,
          heuristics,
        );
      }
    }

    if (isAvailabilityAskWithoutRoute(combinedText)) {
      return {
        ...DEFAULT_EXTRACTION,
        intent: 'other',
        passenger_name: passengerName,
        reply: AVAILABILITY_REPLY,
        confidence: 0.5,
      };
    }

    return {
      ...DEFAULT_EXTRACTION,
      intent: 'other',
      passenger_name: passengerName,
      reply: ASK_PICKUP_STREET_OR_GPS,
      missing_fields: [],
      confidence: 0.4,
    };
  }
}
