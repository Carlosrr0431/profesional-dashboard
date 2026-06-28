/**
 * Extracción híbrida: patrones primero (0 tokens), DeepSeek v4-flash como fallback
 * y para refinar pickup/destino cuando el mensaje trae direcciones concretas.
 */
import { deepseekChatCompletion, isDeepSeekConfigured } from './deepseekClient';
import { buildTripIntentSystemPrompt } from './tripIntentSystemPrompt';
import {
  buildPatternTripExtraction,
  looksLikeAddressText,
  PATTERN_CONFIDENCE_THRESHOLD,
  shouldUsePatternExtraction,
} from './whatsappTripIntentPatterns';
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
};

function looksLikeRouteWithDestination(text) {
  return /\b(?:es\s+para\s+ir\s+(?:hasta|a)|voy\s+(?:para|a)\s+|me\s+llev(?:a|as|en)\s+a\s+|destino(?:\s+es)?\s+|hasta\s+[a-záéíóúü]|hacia\s+[a-záéíóúü])/i.test(
    String(text || ''),
  );
}

function pickupLooksContaminated(pickup) {
  return /\b(?:es\s+para\s+ir|voy\s+para|me\s+llev(?:a|as|en)\s+a)\b/i.test(String(pickup || ''));
}

function normalizeExtractedAddress(value) {
  const stripped = stripTrailingTripRouteTail(value);
  const normalized = normalizeAddressPhrase(stripped || value || '');
  return sanitizeAddressInput(normalized) || null;
}

function shouldRefineTripAddressesWithDeepSeek({
  combinedText,
  patternResult,
  heuristics,
  context = {},
}) {
  if (!isDeepSeekConfigured()) return false;
  if (patternResult.intent !== 'trip_request') return false;
  if (context?.awaiting_pickup_number) return false;

  const hasAddressSignal = Boolean(
    patternResult.pickup_location ||
    patternResult.destination ||
    heuristics?.pickup ||
    heuristics?.destination ||
    looksLikeAddressText(combinedText),
  );
  if (!hasAddressSignal) return false;

  return (
    looksLikeRouteWithDestination(combinedText) ||
    Boolean(heuristics?.pickup && heuristics?.destination) ||
    pickupLooksContaminated(patternResult.pickup_location || heuristics?.pickup) ||
    Boolean(patternResult.pickup_location || heuristics?.pickup)
  );
}

function mergeTripAddressExtraction(patternResult, aiResult, heuristics) {
  const aiConf = Number(aiResult?.confidence) || 0;
  const preferAiAddresses = aiConf >= 0.55;

  const pickup =
    (preferAiAddresses ? normalizeExtractedAddress(aiResult.pickup_location) : null) ||
    normalizeExtractedAddress(patternResult.pickup_location) ||
    normalizeExtractedAddress(heuristics?.pickup) ||
    null;

  const destination =
    (preferAiAddresses ? normalizeExtractedAddress(aiResult.destination) : null) ||
    normalizeExtractedAddress(patternResult.destination) ||
    normalizeExtractedAddress(heuristics?.destination) ||
    null;

  const missingFields = Array.isArray(aiResult.missing_fields) && aiResult.missing_fields.length
    ? aiResult.missing_fields
    : (patternResult.missing_fields || []);

  return {
    ...patternResult,
    intent: 'trip_request',
    passenger_name: aiResult.passenger_name || patternResult.passenger_name,
    pickup_location: pickup,
    origin: normalizeExtractedAddress(aiResult.origin) || patternResult.origin || null,
    destination,
    notes: aiResult.notes || patternResult.notes || null,
    reply: aiResult.reply ?? patternResult.reply ?? null,
    missing_fields: pickup ? missingFields.filter((f) => f !== 'pickup_location') : missingFields,
    confidence: Math.max(aiConf, Number(patternResult.confidence) || 0),
    schedule_time: aiResult.schedule_time || patternResult.schedule_time || null,
    cancel_confirmed: aiResult.cancel_confirmed ?? patternResult.cancel_confirmed ?? false,
  };
}

export function parseTripIntentJson(raw, fallback = DEFAULT_EXTRACTION) {
  const match = String(raw || '').match(/\{[\s\S]*\}/);
  if (!match) return { ...fallback };
  try {
    return { ...fallback, ...JSON.parse(match[0]) };
  } catch {
    return { ...fallback };
  }
}

/**
 * @param {object} params
 * @param {function} [params.inferHeuristics] — inferTripHeuristics del route
 * @param {function} [params.logFn]
 */
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

  const patternResult = buildPatternTripExtraction({
    combinedText,
    context,
    pushName,
    heuristics,
  });

  if (shouldUsePatternExtraction(patternResult)) {
    if (
      shouldRefineTripAddressesWithDeepSeek({
        combinedText,
        patternResult,
        heuristics,
        context,
      })
    ) {
      if (logFn) {
        logFn('ai_extract_intent_deepseek_refine', {
          phone,
          intent: patternResult.intent,
          patternConfidence: patternResult.confidence,
          hasHeuristicDestination: Boolean(heuristics?.destination),
          routeWithDestination: looksLikeRouteWithDestination(combinedText),
        });
      }

      const aiResult = await extractTripIntentWithDeepSeek({
        combinedText,
        context,
        pushName,
        history,
        conversationStatus,
        lastBotReply,
        patternFallback: patternResult,
        logFn,
      });

      const merged = mergeTripAddressExtraction(patternResult, aiResult, heuristics);
      if (logFn) {
        logFn('ai_extract_intent_pattern_deepseek_merged', {
          phone,
          intent: merged.intent,
          confidence: merged.confidence,
          pickup: merged.pickup_location ? '[set]' : null,
          destination: merged.destination ? '[set]' : null,
        });
      }
      return merged;
    }

    if (logFn) {
      logFn('ai_extract_intent_pattern_hit', {
        phone,
        intent: patternResult.intent,
        confidence: patternResult.confidence,
        source: 'pattern',
      });
    }
    const { source: _s, ...rest } = patternResult;
    return rest;
  }

  if (logFn) {
    logFn('ai_extract_intent_deepseek_fallback', {
      phone,
      patternConfidence: patternResult.confidence,
      reason: 'below_threshold',
    });
  }

  return extractTripIntentWithDeepSeek({
    combinedText,
    context,
    pushName,
    history,
    conversationStatus,
    lastBotReply,
    patternFallback: patternResult,
    logFn,
  });
}

async function extractTripIntentWithDeepSeek({
  combinedText,
  context,
  pushName,
  history = [],
  conversationStatus = 'open',
  lastBotReply = null,
  patternFallback = null,
  logFn,
}) {
  const passengerName = context?.passenger_name || pushName || null;
  const awaitingGps = Boolean(context?.awaiting_gps);
  const awaitingPickupNumber = Boolean(context?.awaiting_pickup_number);
  const pendingCancelConfirm = Boolean(context?.pending_cancel_confirm);

  const stateDescription = {
    open: awaitingPickupNumber
      ? 'Esperando altura/número de calle de retiro.'
      : awaitingGps
        ? 'Esperando ubicación GPS o dirección de retiro.'
        : 'Sin viaje activo.',
    awaiting_address_selection: 'Esperando elección de dirección en encuesta.',
    paused: 'Conversación pausada.',
  }[conversationStatus] || 'Sin viaje activo.';

  const systemPrompt = buildTripIntentSystemPrompt({
    stateDescription,
    passengerName,
    awaitingGps,
    awaitingPickupNumber,
    pendingCancelConfirm,
    lastBotReply,
  });

  const historyMessages = history
    .filter((item) => Boolean(item.transcription || item.content))
    .slice(-4)
    .map((item) => ({
      role: item.direction === 'outgoing' ? 'assistant' : 'user',
      content: String(item.transcription || item.content || '').slice(0, 160),
    }));

  const contextForModel = Object.fromEntries(
    Object.entries(context || {}).filter(
      ([k]) => !['last_bot_reply', 'pending_poll', 'pickup_location', 'origin'].includes(k)
    )
  );

  const userContent = [
    passengerName ? `Nombre: ${passengerName}` : null,
    Object.keys(contextForModel).length > 0 ? `Contexto: ${JSON.stringify(contextForModel)}` : null,
    `Mensaje:\n${combinedText}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const { content } = await deepseekChatCompletion({
      systemPrompt,
      userContent,
      historyMessages,
      maxTokens: 280,
      jsonMode: true,
      logFn,
      purpose: 'trip_intent',
    });

    const parsed = parseTripIntentJson(content, {
      ...DEFAULT_EXTRACTION,
      passenger_name: passengerName,
    });

    if (logFn) {
      logFn('ai_extract_intent_ok', {
        intent: parsed.intent,
        confidence: parsed.confidence,
        source: 'deepseek',
        model: 'deepseek-v4-flash',
      });
    }

    return parsed;
  } catch (error) {
    const status = Number(error?.status || 0);
    if (logFn) {
      logFn('ai_extract_intent_provider_error', {
        provider: 'deepseek',
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
        const { source: _s, ...rest } = patternFallback;
        return rest;
      }
    }

    return {
      ...DEFAULT_EXTRACTION,
      intent: 'trip_request',
      passenger_name: passengerName,
      reply: '¿Desde dónde te buscamos?',
      missing_fields: ['pickup_location'],
      confidence: 0.55,
    };
  }
}
