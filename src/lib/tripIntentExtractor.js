/**
 * Extracción híbrida: patrones primero (0 tokens), DeepSeek v4-flash como fallback.
 */
import { deepseekChatCompletion } from './deepseekClient';
import { buildTripIntentSystemPrompt } from './tripIntentSystemPrompt';
import {
  buildPatternTripExtraction,
  PATTERN_CONFIDENCE_THRESHOLD,
  shouldUsePatternExtraction,
} from './whatsappTripIntentPatterns';

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
