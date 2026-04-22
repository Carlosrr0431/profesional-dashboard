import OpenAI, { toFile } from 'openai';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ACCUMULATION_MS = Number(process.env.WHATSAPP_ACCUMULATION_MS || 40000);
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const WASENDER_API_KEY = process.env.WASENDER_API_KEY || '';
const WASENDER_BASE_URL = process.env.WASENDER_BASE_URL || 'https://www.wasenderapi.com/api';
const CRON_SECRET = process.env.CRON_SECRET || '';
const WHATSAPP_TRIP_TRANSITION_SECRET = process.env.WHATSAPP_TRIP_TRANSITION_SECRET || '';
const ALLOWED_PHONES = new Set(['5493878630173']);
const IS_SERVERLESS = Boolean(process.env.VERCEL);
const IMMEDIATE_PROCESSING =
  (process.env.WHATSAPP_IMMEDIATE_PROCESSING || '').toLowerCase() === 'true';

const ACTIVE_TRIP_STATUSES = ['accepted', 'going_to_pickup', 'in_progress'];
const OPEN_TRIP_STATUSES = ['pending', ...ACTIVE_TRIP_STATUSES];
const DRIVER_BUSY_TRIP_STATUSES = ['pending', ...ACTIVE_TRIP_STATUSES];
const PENDING_GUARD_MAX_AGE_MINUTES = Number(process.env.WHATSAPP_PENDING_GUARD_MAX_AGE_MINUTES || 5);
const DRIVER_PENDING_BUSY_MAX_AGE_MINUTES = Number(process.env.WHATSAPP_DRIVER_PENDING_BUSY_MAX_AGE_MINUTES || 5);
const processingTimers = new Map();
const UPSERT_ONLY = (process.env.WHATSAPP_UPSERT_ONLY || 'true').toLowerCase() !== 'false';
const SEARCH_RADII_KM = [1, 2, 5, 10, 15, 20];

let warmed = false;
let supabaseClient = null;
let openaiClient = null;

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function maskPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return 'unknown';
  if (normalized.length <= 4) return normalized;
  return `${'*'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
}

function logWebhook(stage, meta = {}) {
  try {
    console.info('[wasender-webhook]', JSON.stringify({ stage, ...meta }));
  } catch {
    console.info('[wasender-webhook]', stage);
  }
}

function summarizeDbError(error) {
  if (!error) return null;
  return {
    code: error.code || null,
    message: error.message || null,
    details: error.details || null,
    hint: error.hint || null,
  };
}

function isAuthorizedPhone(phone) {
  if (ALLOWED_PHONES.size === 0) return true;
  const normalized = normalizePhone(phone);
  return [...ALLOWED_PHONES].some((allowed) => normalized === allowed || normalized.endsWith(allowed.slice(-10)));
}

function isTripTransitionAuthorized({ authHeader = '', tripTransitionSecretHeader = '' } = {}) {
  if (!WHATSAPP_TRIP_TRANSITION_SECRET) return false;
  return (
    tripTransitionSecretHeader === WHATSAPP_TRIP_TRANSITION_SECRET ||
    authHeader === `Bearer ${WHATSAPP_TRIP_TRANSITION_SECRET}`
  );
}

function safeJsonParse(value, fallback = null) {
  if (value == null) return fallback;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

async function fetchWithRetry(url, options = {}, { retries = 2, delayMs = 800, label = 'fetch' } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status >= 500 && attempt < retries) {
        logWebhook('fetch_retry_server_error', { label, attempt, status: response.status });
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      logWebhook('fetch_retry_network_error', { label, attempt, error: error?.message });
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

function sanitizeAddressInput(address) {
  if (!address || typeof address !== 'string') return '';
  return address.replace(/[<>{}[\]\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normalizeReason(value) {
  return normalizeText(value).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeForMatch(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeAddress(value) {
  return normalizeForMatch(value)
    .split(' ')
    .filter((token) => token.length > 1 && !['de', 'del', 'la', 'el', 'en', 'y', 'al', 'a'].includes(token));
}

function extractNumbers(value) {
  const matches = String(value || '').match(/\b\d{1,5}\b/g);
  return new Set((matches || []).map((n) => Number(n)));
}

function buildAddressVariants(address) {
  const base = sanitizeAddressInput(address);
  if (!base) return [];

  const variants = [];
  const pushVariant = (item) => {
    const cleaned = sanitizeAddressInput(item);
    if (cleaned) variants.push(cleaned);
  };

  const withSalta = /salta/i.test(base) ? base : `${base}, Salta`;
  pushVariant(withSalta);

  const noBarrioPrefix = withSalta.replace(/^barrio\s+/i, '').trim();
  if (noBarrioPrefix !== withSalta) pushVariant(noBarrioPrefix);
  pushVariant(withSalta.replace(/\besquina\s+con\b/gi, 'y'));

  const normalized = normalizeForMatch(withSalta);
  const unique = new Set();
  const result = [];
  for (const variant of variants) {
    const key = normalizeForMatch(variant);
    if (!key || unique.has(key)) continue;
    unique.add(key);
    result.push(variant);
  }

  if (!result.some((item) => normalizeForMatch(item).includes('salta'))) {
    result.push(`${base}, Salta`);
  }

  return result.slice(0, 5);
}

function scoreGeocodeResult(result, query) {
  const queryTokens = new Set(tokenizeAddress(query));
  const formatted = result?.formatted_address || '';
  const addressTokens = new Set(tokenizeAddress(formatted));
  const addressComponents = Array.isArray(result?.address_components) ? result.address_components : [];
  const locationType = result?.geometry?.location_type || '';
  const types = Array.isArray(result?.types) ? result.types : [];

  let tokenOverlap = 0;
  queryTokens.forEach((token) => {
    if (addressTokens.has(token)) tokenOverlap += 1;
  });

  let score = queryTokens.size > 0 ? tokenOverlap / queryTokens.size : 0;

  if (locationType === 'ROOFTOP') score += 0.5;
  else if (locationType === 'RANGE_INTERPOLATED') score += 0.35;
  else if (locationType === 'GEOMETRIC_CENTER') score += 0.2;
  else if (locationType === 'APPROXIMATE') score -= 0.1;

  if (result?.partial_match) score -= 0.25;

  const queryNumbers = extractNumbers(query);
  const addressNumbers = extractNumbers(formatted);
  if (queryNumbers.size > 0) {
    let matchedNumbers = 0;
    queryNumbers.forEach((num) => {
      if (addressNumbers.has(num)) matchedNumbers += 1;
    });
    score += matchedNumbers > 0 ? 0.35 : -0.25;
  }

  const hasStreetNumber = addressComponents.some((component) => component?.types?.includes('street_number'));
  const hasRoute = addressComponents.some((component) => component?.types?.includes('route'));
  if (hasStreetNumber) score += 0.15;
  if (hasRoute) score += 0.1;

  const normalizedFormatted = normalizeForMatch(formatted);
  if (normalizedFormatted.includes('salta')) score += 0.2;
  if (types.includes('street_address')) score += 0.15;
  if (types.includes('intersection')) score += 0.1;

  // Penalización fuerte si ningún token de contenido real del query aparece en el resultado.
  // Evita que bonuses de tipo/locationType inflen scores de resultados sin relación semántica.
  const CITY_STOPWORDS = new Set(['salta', 'argentina', 'capital']);
  const contentQueryTokens = [...queryTokens].filter((t) => !CITY_STOPWORDS.has(t));
  if (contentQueryTokens.length > 0) {
    const hasAnyContentMatch = contentQueryTokens.some((t) => addressTokens.has(t));
    if (!hasAnyContentMatch) score -= 0.6;
  }

  return score;
}

function inferTripHeuristics(combinedText, context = {}) {
  const text = String(combinedText || '').trim();
  const normalized = normalizeForMatch(text);

  const looksLikeTripRequest = /(remis|taxi|movil|m[oó]vil|viaje|pasame\s+a\s+buscar|buscame|llevame|llevarme|quiero\s+ir)/i.test(normalized);

  // "de X a Y" → pickup = X, destination = Y
  const deAHasta = text.match(/\bde\s+([^\n,.;]{4,90}?)\s+a\s+([^\n,.;]{4,90})(?:$|[\n.!?])/i);
  if (deAHasta) {
    return {
      pickup: sanitizeAddressInput(deAHasta[1]),
      destination: sanitizeAddressInput(deAHasta[2]),
      looksLikeTripRequest,
    };
  }

  // "un movil/remis/taxi para [dirección]" → pickup = dirección
  // Esto es lo más común: el pasajero pide que lo busquen EN ese lugar
  const movilParaMatch = text.match(/(?:remis|m[oó]vil|movil|taxi|auto)\s+(?:para|a|en)\s+([^\n.;]{4,120})/i);
  if (movilParaMatch && looksLikeTripRequest) {
    return {
      pickup: sanitizeAddressInput(movilParaMatch[1]),
      destination: sanitizeAddressInput(context.destination || ''),
      looksLikeTripRequest,
    };
  }

  const pickupMatch = text.match(/(?:pasame\s+a\s+buscar(?:me)?|buscame|retiro(?:\s+en)?|estoy\s+en|origen(?:\s+es)?|desde)\s*[:,-]?\s*([^\n.;]{4,120})/i);
  const destinationMatch = text.match(/(?:destino(?:\s+es)?|hacia|hasta|llevame\s+a|quiero\s+ir\s+a)\s*([^\n.;]{4,120})/i);

  let pickup = sanitizeAddressInput(pickupMatch?.[1] || context.pickup_location || '');
  let destination = sanitizeAddressInput(destinationMatch?.[1] || context.destination || '');

  // Si el mensaje parece un pedido de viaje y tiene forma de intersección/dirección pero sin
  // keywords de destino, tratar el texto completo como pickup
  if (looksLikeTripRequest && !pickup && !destination) {
    // Detectar si el texto (sin la palabra del pedido) parece una dirección o intersección
    const addressPart = text
      .replace(/(?:remis|m[oó]vil|movil|taxi|auto|viaje|quiero|pedir?|necesito|manda(?:me)?|un|una|por\s+favor)\s*/gi, '')
      .trim();
    if (addressPart.length >= 4) {
      pickup = sanitizeAddressInput(addressPart);
    }
  }

  return {
    pickup,
    destination,
    looksLikeTripRequest,
  };
}

function isCoarseGeocodeResult(result, originalQuery) {
  const formatted = normalizeText(result?.formatted_address || '');
  const types = Array.isArray(result?.types) ? result.types : [];
  const locationType = result?.geometry?.location_type || '';
  const components = Array.isArray(result?.address_components) ? result.address_components : [];

  const hasRoute = components.some((c) => Array.isArray(c.types) && c.types.includes('route'));
  const hasStreetNumber = components.some((c) => Array.isArray(c.types) && c.types.includes('street_number'));
  const hasPremise = components.some((c) => Array.isArray(c.types) && (c.types.includes('premise') || c.types.includes('subpremise')));

  const queryNorm = normalizeText(originalQuery);
  const queryHasNumber = /\d{1,5}/.test(queryNorm);
  const queryNumbers = extractNumbers(queryNorm);
  const formattedNumbers = extractNumbers(formatted);
  let hasMatchingNumber = false;
  if (queryNumbers.size > 0) {
    queryNumbers.forEach((num) => {
      if (formattedNumbers.has(num)) hasMatchingNumber = true;
    });
  }
  const cityOnlyPatterns = ['salta, argentina', 'salta, salta, argentina'];
  const isCityOnly = cityOnlyPatterns.includes(formatted);

  const onlyBroadTypes = types.every((t) =>
    ['locality', 'administrative_area_level_1', 'administrative_area_level_2', 'country', 'political'].includes(t)
  );

  if (isCityOnly) return true;
  if (onlyBroadTypes) return true;
  if (locationType === 'APPROXIMATE' && !hasRoute && !hasStreetNumber && !hasPremise) return true;
  if (queryHasNumber && !hasStreetNumber) {
    // Accept route-level matches when Google omits street_number component
    // but the formatted address still includes the same house number.
    if (!hasRoute) return true;
    if (!hasMatchingNumber && !hasPremise) return true;
  }

  return false;
}

function extractDirectAddressCandidate(text) {
  const lines = String(text || '')
    .split('\n')
    .map((line) => sanitizeAddressInput(line))
    .filter(Boolean);
  if (lines.length === 0) return null;

  const candidate = lines[lines.length - 1];
  const hasStreetAndNumber = /[a-zA-ZÀ-ÿ]{2,}[\w\s.'-]*\s\d{1,5}\b/.test(candidate);
  if (!hasStreetAndNumber) return null;

  // Avoid stealing intent from explicit "de ... a ..." messages.
  if (/\bde\b.+\ba\b/i.test(candidate)) return null;

  return candidate;
}

function ensureServerConfig() {
  const missing = getMissingServerConfig();
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno: ${missing.join(', ')}`);
  }
}

function getMissingServerConfig() {
  const missing = [];
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  if (!WASENDER_API_KEY) missing.push('WASENDER_API_KEY');
  if (!GOOGLE_MAPS_API_KEY) missing.push('GOOGLE_MAPS_API_KEY');
  return missing;
}

function getSupabase() {
  ensureServerConfig();
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );
  }
  return supabaseClient;
}

function getOpenAI() {
  ensureServerConfig();
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  }
  return openaiClient;
}

function extractPhoneFromMessage(messageData) {
  const key = messageData?.key || {};
  return normalizePhone(
    key.cleanedSenderPn ||
      key.senderPn?.replace('@s.whatsapp.net', '').replace('@lid', '') ||
      key.remoteJid?.replace('@s.whatsapp.net', '').replace('@lid', '') ||
      ''
  );
}

function detectMessageType(message = {}) {
  if (message.imageMessage) return 'image';
  if (message.videoMessage) return 'video';
  if (message.audioMessage) return 'audio';
  if (message.documentMessage) return 'document';
  if (message.stickerMessage) return 'sticker';
  if (message.locationMessage) return 'location';
  if (message.contactMessage) return 'contact';
  if (message.pollUpdateMessage) return 'poll_response';
  return 'text';
}

function extractMessageText(messageData) {
  const message = messageData?.message || {};

  // Poll vote response: extract selected option name as plain text
  if (message.pollUpdateMessage) {
    const selected = message.pollUpdateMessage?.vote?.selectedOptions ||
      message.pollUpdateMessage?.selectedOptions || [];
    const names = (Array.isArray(selected) ? selected : [])
      .map((o) => (typeof o === 'string' ? o : o?.name || o?.optionName || ''))
      .filter(Boolean);
    if (names.length > 0) return names[0];
  }

  return (
    messageData?.messageBody ||
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.text ||
    ''
  ).trim();
}

async function decryptAudioMessage(messageData) {
  const audioMessage = messageData?.message?.audioMessage;
  if (!audioMessage) return null;

  const payload = {
    data: {
      messages: {
        key: { id: messageData.key.id },
        message: {
          audioMessage: {
            url: audioMessage.url,
            mimetype: audioMessage.mimetype || 'audio/ogg',
            mediaKey: audioMessage.mediaKey,
            fileSha256: audioMessage.fileSha256 || undefined,
            fileLength: audioMessage.fileLength || undefined,
          },
        },
      },
    },
  };

  const response = await fetchWithRetry(`${WASENDER_BASE_URL}/decrypt-media`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WASENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`No se pudo desencriptar el audio: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.publicUrl || null;
}

async function transcribeAudioFromUrl(audioUrl) {
  const response = await fetchWithRetry(audioUrl, {}, { label: 'audio_download' });
  if (!response.ok) {
    throw new Error(`No se pudo descargar el audio: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 100) {
    throw new Error('Audio inválido o vacío');
  }

  const file = await toFile(buffer, 'audio.ogg', { type: 'audio/ogg' });
  const transcription = await getOpenAI().audio.transcriptions.create({
    model: 'whisper-1',
    file,
    language: 'es',
    response_format: 'text',
  });

  return typeof transcription === 'string' ? transcription.trim() : (transcription.text || '').trim();
}

async function appendIncomingMessage({
  phone,
  pushName,
  messageId,
  messageType,
  content,
  mediaUrl = null,
  transcription = null,
  rawPayload,
}) {
  logWebhook('db_append_incoming_start', {
    phone: maskPhone(phone),
    messageId,
    messageType,
    hasContent: Boolean(content),
    hasTranscription: Boolean(transcription),
  });

  const { data, error } = await getSupabase().rpc('append_whatsapp_message', {
    p_phone: normalizePhone(phone),
    p_push_name: pushName || null,
    p_external_message_id: messageId,
    p_direction: 'incoming',
    p_message_type: messageType,
    p_content: content || null,
    p_media_url: mediaUrl,
    p_transcription: transcription,
    p_raw_payload: rawPayload,
  });

  if (error) {
    logWebhook('db_append_incoming_error', { error: summarizeDbError(error) });
    throw error;
  }

  const result = Array.isArray(data) ? data[0] : data;
  logWebhook('db_append_incoming_ok', {
    conversationId: result?.conversation_id || null,
    inserted: Boolean(result?.inserted),
  });
  return result;
}

async function insertOutgoingMessage({ phone, messageId, content, rawPayload = null }) {
  const { data: conversation, error: conversationError } = await getSupabase()
    .from('whatsapp_conversations')
    .select('id')
    .eq('phone', normalizePhone(phone))
    .maybeSingle();

  if (conversationError) throw conversationError;
  if (!conversation?.id) return;

  const { error } = await getSupabase().from('whatsapp_messages').insert({
    conversation_id: conversation.id,
    external_message_id: messageId,
    direction: 'outgoing',
    message_type: 'text',
    content,
    raw_payload: rawPayload,
  });

  if (error && error.code !== '23505') throw error;
}

async function sendWhatsAppText(phone, text) {
  const to = `${normalizePhone(phone)}@s.whatsapp.net`;
  const response = await fetchWithRetry(`${WASENDER_BASE_URL}/send-message`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WASENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to, text }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`No se pudo enviar WhatsApp: ${body.slice(0, 200)}`);
  }

  const payload = await response.json();
  await insertOutgoingMessage({
    phone,
    messageId: String(payload?.data?.msgId || `out_${Date.now()}`),
    content: text,
    rawPayload: payload,
  });
  return payload;
}

/**
 * Resuelve un JID de WhatsApp a número de teléfono normalizado.
 * Soporta formato @s.whatsapp.net (directo) y @lid (requiere llamada API de WASender).
 * Retorna null si no se puede resolver.
 */
async function resolvePhoneFromJid(jid) {
  if (!jid) return null;
  const s = String(jid).trim();

  if (s.includes('@s.whatsapp.net')) {
    return normalizePhone(s.replace('@s.whatsapp.net', '')) || null;
  }

  if (s.includes('@lid')) {
    try {
      const response = await fetchWithRetry(
        `${WASENDER_BASE_URL}/pn-from-lid/${encodeURIComponent(s)}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${WASENDER_API_KEY}` },
        }
      );
      if (response.ok) {
        const payload = await response.json();
        const pn = String(payload?.data?.pn || '').replace('@s.whatsapp.net', '');
        return normalizePhone(pn) || null;
      }
    } catch {
      // ignorar errores de resolución LID
    }
  }

  return null;
}

async function sendWhatsAppPoll(phone, question, options) {
  const to = `${normalizePhone(phone)}@s.whatsapp.net`;
  const response = await fetchWithRetry(`${WASENDER_BASE_URL}/send-message`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WASENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to,
      poll: {
        question,
        options,
        multiSelect: false,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`No se pudo enviar encuesta WhatsApp: ${body.slice(0, 200)}`);
  }

  const payload = await response.json();
  const msgId = String(payload?.data?.msgId || `poll_${Date.now()}`);
  await insertOutgoingMessage({
    phone,
    messageId: msgId,
    content: `[ENCUESTA] ${question}: ${options.join(' | ')}`,
    rawPayload: payload,
  });
  return { msgId, payload };
}

async function claimConversationBatch(conversationId) {
  logWebhook('db_claim_batch_start', { conversationId });
  const { data, error } = await getSupabase().rpc('claim_whatsapp_conversation_batch', {
    p_conversation_id: conversationId,
  });

  if (error) {
    logWebhook('db_claim_batch_error', { conversationId, error: summarizeDbError(error) });
    throw error;
  }

  const result = Array.isArray(data) ? data[0] : data;
  logWebhook('db_claim_batch_ok', {
    conversationId,
    claimed: Boolean(result?.id),
    status: result?.status || null,
  });
  return result;
}

async function finalizeConversation(conversationId, updates = {}) {
  const payload = {
    ...updates,
    updated_at: new Date().toISOString(),
  };
  const { error } = await getSupabase()
    .from('whatsapp_conversations')
    .update(payload)
    .eq('id', conversationId);
  if (error) {
    logWebhook('db_finalize_conversation_error', { conversationId, error: summarizeDbError(error) });
    throw error;
  }
  logWebhook('db_finalize_conversation_ok', {
    conversationId,
    status: updates?.status || null,
    hasContext: Boolean(updates?.context),
  });
}

async function getRecentConversationMessages(conversationId, limit = 12) {
  const { data, error } = await getSupabase()
    .from('whatsapp_messages')
    .select('direction, content, transcription, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  logWebhook('db_recent_messages_ok', {
    conversationId,
    limit,
    returned: (data || []).length,
  });
  return (data || []).reverse();
}

function isOpenTripStatus(status) {
  return OPEN_TRIP_STATUSES.includes(String(status || '').toLowerCase());
}

function getTripAgeMinutes(trip) {
  const createdAtMs = new Date(trip?.created_at || 0).getTime();
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return null;
  return Math.max(0, Math.round((Date.now() - createdAtMs) / 60000));
}

function shouldBlockForOpenTrip(trip) {
  if (!trip) return false;
  const status = String(trip.status || '').toLowerCase();
  if (status !== 'pending') return true;
  const ageMinutes = getTripAgeMinutes(trip);
  if (ageMinutes == null) return true;
  return ageMinutes <= PENDING_GUARD_MAX_AGE_MINUTES;
}

async function getOpenTripById(tripId) {
  if (!tripId) return null;
  const { data, error } = await getSupabase()
    .from('trips')
    .select('id, status, passenger_phone, destination_address, created_at')
    .eq('id', tripId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !isOpenTripStatus(data.status)) return null;
  return data;
}

async function getTripById(tripId) {
  if (!tripId) return null;
  const { data, error } = await getSupabase()
    .from('trips')
    .select('id, status, passenger_phone, destination_address, created_at, completed_at')
    .eq('id', tripId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getConversationFlowTripById(tripId) {
  if (!tripId) return null;

  const { data, error } = await getSupabase()
    .from('trips')
    .select(
      'id, driver_id, status, passenger_name, passenger_phone, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng, notes, cancel_reason, created_at, accepted_at, started_at, completed_at'
    )
    .eq('id', tripId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function getDriverById(driverId) {
  if (!driverId) return null;

  const { data, error } = await getSupabase()
    .from('drivers')
    .select('id, full_name, phone, push_token, current_lat, current_lng, vehicle_brand, vehicle_model, vehicle_plate, vehicle_color')
    .eq('id', driverId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function getLatestOpenTripByPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const { data, error } = await getSupabase()
    .from('trips')
    .select('id, status, passenger_phone, destination_address, created_at')
    .eq('passenger_phone', normalized)
    .in('status', OPEN_TRIP_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function getTripPickupPoint(trip) {
  return {
    address: trip?.destination_address || null,
    lat: Number(trip?.destination_lat),
    lng: Number(trip?.destination_lng),
  };
}

function shouldReassignCancelledTrip(trip) {
  const reason = normalizeReason(trip?.cancel_reason || '');
  if (!reason) return true;

  const nonReassignableReasons = [
    'pasajero cancelo',
    'pasajero cancelo el viaje',
    'pasajero no encontrado',
    'direccion incorrecta',
  ];

  return !nonReassignableReasons.includes(reason);
}

async function buildPassengerDriverConfirmationMessage(trip, driver) {
  const pickup = getTripPickupPoint(trip);
  let etaMinutes = null;
  let distanceToPickupKm = null;

  const driverLat = Number(driver?.current_lat);
  const driverLng = Number(driver?.current_lng);
  if (
    Number.isFinite(driverLat) &&
    Number.isFinite(driverLng) &&
    Number.isFinite(pickup.lat) &&
    Number.isFinite(pickup.lng)
  ) {
    distanceToPickupKm = Math.round(haversineKm(driverLat, driverLng, pickup.lat, pickup.lng) * 10) / 10;
    const routeToPickup = await getRouteMetrics({ lat: driverLat, lng: driverLng }, { lat: pickup.lat, lng: pickup.lng });
    etaMinutes = routeToPickup.durationMinutes;
  }

  const driverLabel = [driver?.vehicle_brand, driver?.vehicle_model].filter(Boolean).join(' ');
  const driverMeta = [driver?.full_name, driverLabel, driver?.vehicle_plate].filter(Boolean).join(' · ');
  const etaText = etaMinutes != null ? `\nLlegada estimada: *~${etaMinutes} min*` : '';
  const distText = distanceToPickupKm != null ? ` (a ${distanceToPickupKm} km)` : '';

  return `Listo, tu viaje quedó confirmado.\n\nChofer: *${driver?.full_name || 'Sin nombre'}*${distText}${driverMeta ? `\n${driverMeta}` : ''}${etaText}\nRetiro: *${pickup.address || 'Sin dirección'}*`;
}

async function createReplacementTripFromCancelledTrip(sourceTrip, { excludedDriverIds = [] } = {}) {
  const pickup = getTripPickupPoint(sourceTrip);
  if (!Number.isFinite(pickup.lat) || !Number.isFinite(pickup.lng)) {
    return { ok: false, reason: 'missing_pickup_coords' };
  }

  const driver = await chooseDriver({ lat: pickup.lat, lng: pickup.lng }, { excludedDriverIds });
  if (!driver) {
    return { ok: false, reason: 'no_driver' };
  }

  const driverLat = Number(driver.current_lat);
  const driverLng = Number(driver.current_lng);
  const driverOriginAddress = await reverseGeocodeLatLng(driverLat, driverLng);

  const tripPayload = {
    driver_id: driver.id,
    passenger_name: sourceTrip.passenger_name || 'Pasajero WhatsApp',
    passenger_phone: sourceTrip.passenger_phone,
    origin_address: driverOriginAddress,
    origin_lat: driverLat,
    origin_lng: driverLng,
    destination_address: pickup.address,
    destination_lat: pickup.lat,
    destination_lng: pickup.lng,
    status: 'pending',
    price: null,
    commission_amount: null,
    distance_km: null,
    duration_minutes: null,
    notes: sourceTrip.notes || '[APPROACH_ONLY] Reasignado automáticamente desde WhatsApp.',
  };

  const { data: trip, error } = await getSupabase().from('trips').insert(tripPayload).select().single();
  if (error) throw error;

  await sendPushNotification(driver.push_token, {
    title: 'Nuevo viaje asignado',
    body: `${trip.passenger_name} → ${trip.destination_address}`,
    data: {
      type: 'new_trip',
      tripId: trip.id,
      trip,
    },
  });

  return { ok: true, trip, driver };
}

async function extractTripIntent({ combinedText, context, pushName, phone, history, conversationStatus = 'open', lastBotReply = null }) {
  logWebhook('ai_extract_intent_start', {
    phone: maskPhone(phone),
    textLen: combinedText?.length || 0,
    historyCount: history?.length || 0,
    hasContext: Boolean(context && Object.keys(context).length),
    hasPushName: Boolean(pushName),
    conversationStatus,
    hasLastBotReply: Boolean(lastBotReply),
  });

  const passengerName = context?.passenger_name || pushName || null;
  const hasPickupInContext = Boolean(sanitizeAddressInput(context?.pickup_location || ''));
  const awaitingGps = Boolean(context?.awaiting_gps);
  const pendingCancelConfirm = Boolean(context?.pending_cancel_confirm);

  const stateDescription = {
    open: 'Sin viaje activo. El pasajero puede estar iniciando un nuevo pedido o retomando conversación.',
    awaiting_info: awaitingGps
      ? 'Esperando que el pasajero comparta su ubicación GPS o la dirección de retiro. NO volver a pedir lo mismo si ya se pidió.'
      : 'Esperando información de dirección de retiro del pasajero.',
    awaiting_driver: 'El viaje fue creado y está esperando que un chofer lo acepte. El pasajero puede preguntar el estado.',
    trip_created: 'El viaje fue aceptado y está en curso. El pasajero puede consultar el estado.',
    awaiting_address_selection: 'Se envió una encuesta al pasajero para que elija su dirección exacta. Esperando respuesta.',
    paused: 'Conversación pausada, esperando atención humana.',
  }[conversationStatus] || 'Estado desconocido.';

  const systemPrompt = `Sos el asistente de un servicio de remises en Salta Capital, Argentina. Respondés por WhatsApp como un operador humano experimentado.

## PERSONALIDAD Y ESTILO
- Español rioplatense informal y natural. Sin formalismos ni frases de bot.
- Conciso y directo: máximo 1-2 oraciones por respuesta (salvo confirmaciones de viaje con datos del chofer).
- Nunca repetís lo que ya dijiste. Nunca hacés la misma pregunta dos veces.
- Si el pasajero ya dio una info, la usás. No la volvés a pedir.
- Si el pasajero responde "sí", "dale", "bueno", "ok", "perfecto", lo interpretás como confirmación de lo anterior.
- Variás el vocabulario. Nunca mandás el mismo texto dos veces seguidas.

## ESTADO ACTUAL DE LA CONVERSACIÓN
- Estado del sistema: ${stateDescription}
- Nombre del pasajero: ${passengerName || 'desconocido'}
- Dirección de retiro ya registrada: ${hasPickupInContext ? `"${context.pickup_location}"` : 'ninguna todavía'}
- Esperando GPS del pasajero: ${awaitingGps ? 'SÍ — no volver a pedir la dirección' : 'no'}
- Esperando confirmación de cancelación: ${pendingCancelConfirm ? 'SÍ' : 'no'}
- Tu último mensaje enviado: ${lastBotReply ? `"${lastBotReply}"` : 'ninguno (primera interacción)'}

## LENGUAJE COLOQUIAL DE SALTA QUE ENTENDÉS
- "mandame/mándame un remis/movil/auto" → pedido de viaje
- "me buscás/buscame/venís a buscarme/pasame a buscar/venís" → pedido de retiro
- "estoy en [lugar]", "estoy parado en [lugar]", "estoy acá en [lugar]" → dirección de retiro
- "me llevás a/hasta [lugar]", "quiero ir a [lugar]", "voy a [lugar]" → destino
- "cuánto falta", "dónde está el chofer/remis/auto", "ya viene", "tarda mucho" → consulta de estado
- "cancelá", "no quiero más", "olvidate", "ya no", "cancelar", "dejalo" → cancelación
- "para más tarde", "para las [hora]", "reservar para", "mañana a las" → solicitud programada
- Barrios: "tres cerr" → Tres Cerritos, "grand bourg/grand" → Grand Bourg, "castañ" → Castañares, "limache" → Limache, "portezuelo" → Portezuelo, "cpo quijano/campo quij" → Campo Quijano, "la loma" → La Loma, "el bosque" → El Bosque
- Lugares de referencia: "el hospital" → Hospital San Bernardo Salta, "la terminal" → Terminal de Ómnibus Salta, "el shopping" → Shopping Salta, "el correo" → Correo Argentino Salta, "la municipalidad" → Municipalidad de Salta, "el jockey" → Hipódromo Jockey Club Salta

## REGLA CRÍTICA — "PARA" EN PEDIDOS DE REMÍS
Cuando alguien dice "un movil/remis para [lugar]" o "un auto para [lugar]", el [lugar] es SIEMPRE la dirección de RETIRO (pickup_location), NO el destino. El chofer va a buscar al pasajero en ese lugar. Ejemplos:
- "un movil para zuviria y leguizamon" → pickup_location = "Zuviria y Leguizamón, Salta"
- "un remis para belgrano 500" → pickup_location = "Belgrano 500, Salta"
- "mandame un taxi para tres cerritos" → pickup_location = "Barrio Tres Cerritos, Salta"
Solo es destino si hay una segunda dirección explícita con palabras como "hasta", "a", "hacia", "me llevo a".

## INTERSECCIONES DE CALLES
El "y" entre dos palabras que parezcan calles = intersección, NO destino. Ejemplos:
- "zuviria y leguizamon" → query: "Zuviria y Leguizamón, Salta"
- "españa y belgrano" → query: "España y Belgrano, Salta"
- "san martin y corrientes" → query: "San Martín y Corrientes, Salta"
No confundir con "quiero ir a X y a Y" que sería dos destinos.

## CÓMO EXTRAER DIRECCIONES (pickup_location, origin, destination)
- Generá siempre una query geocodificable en Google Maps Argentina
- Formato ideal: "Calle Número, Salta" o "Calle y Calle, Salta" o "Barrio Nombre, Salta"
- Si solo dan el número: buscá la calle en el historial y completá ("Belgrano 1200, Salta")
- Esquina: "España y Belgrano, Salta"
- Barrio: "Barrio Tres Cerritos, Salta"
- Lugar conocido: "Hospital San Bernardo, Salta", "Terminal de Ómnibus, Salta"
- NO agregues "Argentina" — con "Salta" alcanza
- NO inventes calles ni números que el pasajero no dijo

## INTENTS POSIBLES
- "trip_request": quiere un remís ahora (con o sin dirección completa)
- "status_query": pregunta dónde está el chofer o cuánto falta
- "cancel_trip": quiere cancelar el viaje actual o ya no necesita el móvil
- "schedule_trip": quiere reservar para un horario futuro específico (no inmediato)
- "ask_human": queja grave, accidente, disputa de pago, insultos, o situación imposible de resolver automáticamente
- "other": saludo, agradecimiento, mensaje sin acción requerida, respuesta que solo requiere un "ok" o nada

## ESQUEMA DE RESPUESTA — Devolvé SOLO JSON válido, sin texto adicional:
{
  "intent": "trip_request" | "status_query" | "cancel_trip" | "schedule_trip" | "ask_human" | "other",
  "passenger_name": string | null,
  "pickup_location": string | null,
  "origin": string | null,
  "destination": string | null,
  "notes": string | null,
  "reply": string | null,
  "confidence": number,
  "missing_fields": string[],
  "cancel_confirmed": boolean,
  "schedule_time": string | null
}

## REGLAS CRÍTICAS
1. Si tu último mensaje ya pedía la dirección Y el pasajero no la dio → NO la pedís de nuevo con el mismo texto. Variá o esperá.
2. Si awaiting_gps=true → NO pedís dirección de texto, el sistema ya lo solicitó.
3. Si la dirección de retiro ya está en el contexto → NO la pedís de nuevo, usala directamente.
4. Si el estado es "awaiting_driver" o "trip_created" y el pasajero pregunta algo → respondé sobre el estado del viaje.
5. cancel_confirmed=true SOLO si el pasajero expresó clara e inequívocamente que quiere cancelar. Si hay ambigüedad, poné false y pedí confirmación en el reply.
6. Si pending_cancel_confirm=true y el pasajero dice "sí"/"dale"/"sí cancelá" → cancel_confirmed=true.
7. El reply debe sonar humano y natural. Variá el vocabulario entre respuestas.
8. Para trip_request sin pickup_location: pedí la dirección de forma natural y breve. Nunca repetir exactamente el mismo texto del lastBotReply.
9. NUNCA uses ask_human solo porque falta información del viaje. Solo para situaciones humanas reales.`;

  // Formateamos el historial como turns reales de conversación para que el modelo entienda el contexto nativo
  const historyMessages = history
    .filter((item) => Boolean(item.transcription || item.content))
    .map((item) => ({
      role: item.direction === 'outgoing' ? 'assistant' : 'user',
      content: String(item.transcription || item.content || '').slice(0, 600),
    }));

  // Mensaje de contexto actual para el modelo
  const contextParts = [
    passengerName ? `Nombre del pasajero: ${passengerName}` : null,
    Object.keys(context || {}).filter((k) => !['last_bot_reply', 'pending_poll'].includes(k)).length > 0
      ? `Contexto del viaje: ${JSON.stringify(
          Object.fromEntries(
            Object.entries(context).filter(([k]) => !['last_bot_reply', 'pending_poll'].includes(k))
          )
        )}`
      : null,
    `Mensajes del pasajero:\n${combinedText}`,
  ].filter(Boolean).join('\n\n');

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-5.4-mini',
    temperature: 0.15,
    max_completion_tokens: 650,
    messages: [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: contextParts },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  const match = raw?.match(/\{[\s\S]*\}/);
  if (!match) {
    logWebhook('ai_extract_intent_fallback', { reason: 'no_json', rawSnippet: raw?.slice(0, 200) });
    return {
      intent: 'other',
      passenger_name: null,
      pickup_location: null,
      origin: null,
      destination: null,
      notes: null,
      reply: hasPickupInContext ? null : '¿Desde dónde te buscamos?',
      confidence: 0,
      missing_fields: hasPickupInContext ? [] : ['pickup_location'],
      cancel_confirmed: false,
      schedule_time: null,
    };
  }

  const parsed = safeJsonParse(match[0], {
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
  });

  logWebhook('ai_extract_intent_ok', {
    intent: parsed?.intent || null,
    confidence: parsed?.confidence ?? null,
    hasPickup: Boolean(parsed?.pickup_location),
    hasOrigin: Boolean(parsed?.origin),
    hasDestination: Boolean(parsed?.destination),
    cancelConfirmed: Boolean(parsed?.cancel_confirmed),
    missingFields: Array.isArray(parsed?.missing_fields) ? parsed.missing_fields : [],
  });
  return parsed;
}

async function geocodeAddress(address) {
  const variants = buildAddressVariants(address);
  if (variants.length === 0) {
    throw new Error(`No se pudo geocodificar: ${address}`);
  }

  const candidates = [];

  for (const query of variants) {
    logWebhook('maps_geocode_start', { query });
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', query);
    url.searchParams.set('language', 'es');
    url.searchParams.set('region', 'ar');
    url.searchParams.set('components', 'country:AR');
    // Bias results to Salta capital area.
    url.searchParams.set('bounds', '-24.90,-65.55|-24.70,-65.30');
    url.searchParams.set('key', GOOGLE_MAPS_API_KEY);

    const response = await fetchWithRetry(url, {}, { label: 'geocode' });
    const payload = await response.json();
    if (payload.status !== 'OK' || !payload.results?.length) {
      logWebhook('maps_geocode_variant_fail', {
        query,
        status: payload.status || null,
        resultCount: payload.results?.length || 0,
      });
      continue;
    }

    for (const result of payload.results) {
      if (isCoarseGeocodeResult(result, query)) continue;

      const score = scoreGeocodeResult(result, query);
      candidates.push({ result, score, query });
    }
  }

  if (candidates.length === 0) {
    logWebhook('maps_geocode_fail', {
      originalAddress: address,
      reason: 'no_non_coarse_candidates',
      variantsTried: variants,
    });
    throw new Error(`Dirección demasiado amplia o ambigua: ${address}`);
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 0.25) {
    logWebhook('maps_geocode_fail', {
      originalAddress: address,
      reason: 'low_confidence_candidate',
      topScore: best?.score ?? null,
      topAddress: best?.result?.formatted_address || null,
    });
    throw new Error(`No se pudo geocodificar con confianza: ${address}`);
  }

  const resultPayload = {
    formattedAddress: best.result.formatted_address,
    lat: best.result.geometry.location.lat,
    lng: best.result.geometry.location.lng,
  };
  logWebhook('maps_geocode_ok', {
    query: best.query,
    score: Math.round(best.score * 100) / 100,
    formattedAddress: resultPayload.formattedAddress,
    lat: resultPayload.lat,
    lng: resultPayload.lng,
  });
  return resultPayload;
}

async function geocodeAddressMultiple(address, maxResults = 5) {
  const variants = buildAddressVariants(address);
  if (variants.length === 0) return [];

  const candidates = [];
  const seenKeys = new Set();

  for (const query of variants) {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', query);
    url.searchParams.set('language', 'es');
    url.searchParams.set('region', 'ar');
    url.searchParams.set('components', 'country:AR');
    url.searchParams.set('bounds', '-24.90,-65.55|-24.70,-65.30');
    url.searchParams.set('key', GOOGLE_MAPS_API_KEY);

    try {
      const response = await fetchWithRetry(url, {}, { label: 'geocode_multi' });
      const payload = await response.json();
      if (payload.status !== 'OK' || !payload.results?.length) continue;

      for (const result of payload.results) {
        if (isCoarseGeocodeResult(result, query)) continue;
        const key = (result.formatted_address || '').toLowerCase().trim();
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        const score = scoreGeocodeResult(result, query);
        if (score >= 0.20) {
          candidates.push({
            formattedAddress: result.formatted_address,
            lat: result.geometry.location.lat,
            lng: result.geometry.location.lng,
            score,
          });
        }
      }
    } catch (err) {
      logWebhook('maps_geocode_multi_variant_error', { query, error: err?.message || 'unknown' });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, maxResults);
}

/**
 * Usa la API de Autocomplete de Google Places para obtener múltiples sugerencias
 * de calle/dirección para un query ambiguo (ej: "Güemes 200" → Luis Güemes + General Güemes).
 * Cada sugerencia se geocodifica por place_id para obtener coordenadas precisas.
 */
async function autocompleteAndGeocodeAddress(query, maxResults = 5) {
  const safeQuery = sanitizeAddressInput(query);
  if (!safeQuery) return [];

  const input = /salta/i.test(safeQuery) ? safeQuery : `${safeQuery}, Salta`;

  const acUrl = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
  acUrl.searchParams.set('input', input);
  acUrl.searchParams.set('language', 'es');
  acUrl.searchParams.set('region', 'ar');
  acUrl.searchParams.set('components', 'country:AR');
  acUrl.searchParams.set('location', '-24.7829,-65.4122'); // Salta Capital centro
  acUrl.searchParams.set('radius', '20000');
  acUrl.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  let predictions;
  try {
    const acResp = await fetchWithRetry(acUrl, {}, { label: 'autocomplete_address' });
    const acData = await acResp.json();
    if (acData.status !== 'OK' || !Array.isArray(acData.predictions) || acData.predictions.length === 0) {
      logWebhook('maps_autocomplete_no_results', { query: safeQuery, status: acData.status || null });
      return [];
    }
    predictions = acData.predictions.slice(0, maxResults);
    logWebhook('maps_autocomplete_ok', { query: safeQuery, count: predictions.length });
  } catch (err) {
    logWebhook('maps_autocomplete_error', { query: safeQuery, error: err?.message || 'unknown' });
    return [];
  }

  const results = [];
  for (const prediction of predictions) {
    if (!prediction.place_id) continue;
    try {
      const geoUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      geoUrl.searchParams.set('place_id', prediction.place_id);
      geoUrl.searchParams.set('language', 'es');
      geoUrl.searchParams.set('key', GOOGLE_MAPS_API_KEY);

      const geoResp = await fetchWithRetry(geoUrl, {}, { label: 'geocode_place_id' });
      const geoData = await geoResp.json();
      if (geoData.status !== 'OK' || !geoData.results?.[0]) continue;

      const r = geoData.results[0];
      if (isCoarseGeocodeResult(r, safeQuery)) continue;

      const score = scoreGeocodeResult(r, safeQuery);
      if (score >= 0.10) {
        results.push({
          formattedAddress: r.formatted_address,
          lat: r.geometry.location.lat,
          lng: r.geometry.location.lng,
          score,
        });
      }
    } catch (err) {
      logWebhook('maps_autocomplete_geocode_place_error', { placeId: prediction.place_id, error: err?.message || 'unknown' });
    }
  }

  return results;
}

/**
 * Combina geocodificación por variantes y autocomplete para obtener el conjunto
 * más completo de candidatos de dirección — especialmente útil cuando el nombre
 * de calle es ambiguo (ej: "Güemes" → Luis Güemes, General Güemes).
 */
async function getAddressCandidates(query, maxResults = 5) {
  const [geocodeResult, autocompleteResult] = await Promise.allSettled([
    geocodeAddressMultiple(query, maxResults),
    autocompleteAndGeocodeAddress(query, maxResults),
  ]);

  const geocodeCandidates = geocodeResult.status === 'fulfilled' ? geocodeResult.value : [];
  const autocompleteCandidates = autocompleteResult.status === 'fulfilled' ? autocompleteResult.value : [];

  // Merge and deduplicate by formatted address (case-insensitive)
  const seenKeys = new Set();
  const merged = [];
  for (const c of [...geocodeCandidates, ...autocompleteCandidates]) {
    const key = (c.formattedAddress || '').toLowerCase().trim();
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    merged.push(c);
  }

  merged.sort((a, b) => b.score - a.score);
  logWebhook('maps_address_candidates_merged', {
    query,
    geocodeCount: geocodeCandidates.length,
    autocompleteCount: autocompleteCandidates.length,
    mergedCount: merged.length,
  });
  return merged.slice(0, maxResults);
}

/**
 * Puntúa un resultado de reverse-geocode por precisión.
 * Prioridad: tipo de resultado + tipo de ubicación geométrica.
 * Retorna un número mayor = mejor.
 */
function scoreReverseGeocodeResult(result) {
  const types = Array.isArray(result?.types) ? result.types : [];
  const locationType = result?.geometry?.location_type || '';
  const components = Array.isArray(result?.address_components) ? result.address_components : [];

  const hasStreetNumber = components.some((c) => Array.isArray(c.types) && c.types.includes('street_number'));
  const hasRoute = components.some((c) => Array.isArray(c.types) && c.types.includes('route'));

  let score = 0;

  // Tipo de resultado (cuanto más específico, mejor)
  if (types.includes('street_address')) score += 40;
  else if (types.includes('premise')) score += 35;
  else if (types.includes('subpremise')) score += 30;
  else if (types.includes('establishment')) score += 20;
  else if (types.includes('intersection')) score += 15;
  else if (types.includes('route')) score += 5;
  // Tipos muy generales = penalización fuerte
  if (types.some((t) => ['locality', 'administrative_area_level_1', 'administrative_area_level_2', 'country', 'political', 'postal_code'].includes(t))) {
    score -= 30;
  }

  // Tipo de geometría (ROOFTOP = coordenada exacta del edificio)
  if (locationType === 'ROOFTOP') score += 30;
  else if (locationType === 'RANGE_INTERPOLATED') score += 20;
  else if (locationType === 'GEOMETRIC_CENTER') score += 10;
  else if (locationType === 'APPROXIMATE') score -= 10;

  // Componentes de dirección completa
  if (hasStreetNumber) score += 15;
  if (hasRoute) score += 10;

  return score;
}

async function reverseGeocodeLatLng(lat, lng) {
  logWebhook('maps_reverse_geocode_start', { lat, lng });
  const fallback = `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;

  // Primera pasada: pedir solo street_address con ROOFTOP o RANGE_INTERPOLATED
  // Esto filtra de entrada a Google para que devuelva solo direcciones exactas
  const urlPrecise = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  urlPrecise.searchParams.set('latlng', `${lat},${lng}`);
  urlPrecise.searchParams.set('result_type', 'street_address');
  urlPrecise.searchParams.set('location_type', 'ROOFTOP|RANGE_INTERPOLATED');
  urlPrecise.searchParams.set('language', 'es');
  urlPrecise.searchParams.set('region', 'ar');
  urlPrecise.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  try {
    const preciseResp = await fetchWithRetry(urlPrecise, {}, { label: 'reverse_geocode_precise' });
    const precisePayload = await preciseResp.json();
    if (precisePayload.status === 'OK' && precisePayload.results?.length > 0) {
      // Tomar el resultado con mayor puntaje entre los devueltos
      const best = precisePayload.results
        .map((r) => ({ r, score: scoreReverseGeocodeResult(r) }))
        .sort((a, b) => b.score - a.score)[0];
      const formatted = best.r.formatted_address || fallback;
      logWebhook('maps_reverse_geocode_ok', {
        lat, lng,
        formattedAddress: formatted,
        locationType: best.r?.geometry?.location_type,
        resultType: (best.r?.types || [])[0] || null,
        score: best.score,
        pass: 'precise',
      });
      return formatted;
    }
  } catch (_) {
    // Si falla la pasada precisa, continuamos con la general
  }

  // Segunda pasada: consulta general, puntuamos todos los resultados y elegimos el mejor
  const urlGeneral = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  urlGeneral.searchParams.set('latlng', `${lat},${lng}`);
  urlGeneral.searchParams.set('language', 'es');
  urlGeneral.searchParams.set('region', 'ar');
  urlGeneral.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  const response = await fetchWithRetry(urlGeneral, {}, { label: 'reverse_geocode_general' });
  const payload = await response.json();

  if (payload.status !== 'OK' || !payload.results?.length) {
    logWebhook('maps_reverse_geocode_fail', {
      lat, lng,
      status: payload.status || null,
      resultCount: payload.results?.length || 0,
    });
    return fallback;
  }

  // Puntuar y elegir el resultado más preciso disponible
  const scored = payload.results
    .map((r) => ({ r, score: scoreReverseGeocodeResult(r) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const formatted = best.r.formatted_address || fallback;

  logWebhook('maps_reverse_geocode_ok', {
    lat, lng,
    formattedAddress: formatted,
    locationType: best.r?.geometry?.location_type,
    resultType: (best.r?.types || [])[0] || null,
    score: best.score,
    totalResults: scored.length,
    pass: 'general',
  });
  return formatted;
}

async function getRouteMetrics(origin, destination) {
  logWebhook('maps_route_start', {
    originLat: origin?.lat,
    originLng: origin?.lng,
    destinationLat: destination?.lat,
    destinationLng: destination?.lng,
  });
  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('origin', `${origin.lat},${origin.lng}`);
  url.searchParams.set('destination', `${destination.lat},${destination.lng}`);
  url.searchParams.set('language', 'es');
  url.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  const response = await fetchWithRetry(url, {}, { label: 'route_metrics' });
  const payload = await response.json();
  if (payload.status !== 'OK' || !payload.routes?.length) {
    logWebhook('maps_route_fail', {
      status: payload.status || null,
      routeCount: payload.routes?.length || 0,
    });
    return { distanceKm: null, durationMinutes: null };
  }

  const leg = payload.routes[0].legs[0];
  const metrics = {
    distanceKm: Math.round((leg.distance.value / 1000) * 10) / 10,
    durationMinutes: Math.round(leg.duration.value / 60),
  };
  logWebhook('maps_route_ok', metrics);
  return metrics;
}

async function getSettingsMap() {
  const { data, error } = await getSupabase().from('settings').select('key, value');
  if (error) throw error;
  const map = Object.fromEntries((data || []).map((item) => [item.key, item.value]));
  logWebhook('db_settings_ok', {
    total: (data || []).length,
    hasTariffPerKm: Object.prototype.hasOwnProperty.call(map, 'tariff_per_km'),
    hasTariffBase: Object.prototype.hasOwnProperty.call(map, 'tariff_base'),
    hasCommissionPercent: Object.prototype.hasOwnProperty.call(map, 'commission_percent'),
    hasWhatsappAmtFare: Object.prototype.hasOwnProperty.call(map, 'whatsapp_amt_fare'),
    hasWhatsappDriverCommission: Object.prototype.hasOwnProperty.call(map, 'whatsapp_driver_commission'),
  });
  return map;
}

function calculateWhatsAppTripPricing(settings, route) {
  const tariffPerKm = Number(settings.tariff_per_km || 0);
  const tariffBase = Number(settings.tariff_base || 0);
  const commissionPercent = Number(settings.commission_percent || 10);
  const whatsappAmtFare = Math.max(0, Number(settings.whatsapp_amt_fare || 0));
  const whatsappDriverCommission = Math.max(0, Number(settings.whatsapp_driver_commission || 0));

  const fallbackPrice = route.distanceKm == null ? null : Math.round(tariffBase + tariffPerKm * route.distanceKm);
  const fallbackCommission = fallbackPrice == null ? null : Math.round((fallbackPrice * commissionPercent) / 100);

  // WhatsApp AMT: per-km rate (uses same tariff_base as base)
  const whatsappPrice = whatsappAmtFare > 0 && route.distanceKm != null
    ? Math.round(tariffBase + whatsappAmtFare * route.distanceKm)
    : fallbackPrice;
  // WhatsApp commission: percentage of the WhatsApp price
  const whatsappCommission = whatsappDriverCommission > 0 && whatsappPrice != null
    ? Math.round((whatsappPrice * whatsappDriverCommission) / 100)
    : fallbackCommission;

  const price = whatsappAmtFare > 0 ? whatsappPrice : fallbackPrice;
  const commissionAmount = whatsappDriverCommission > 0 ? whatsappCommission : fallbackCommission;

  return {
    price,
    commissionAmount,
    pricingMode: whatsappAmtFare > 0 || whatsappDriverCommission > 0 ? 'whatsapp_amt' : 'distance_based',
    tariffPerKm,
    tariffBase,
    commissionPercent,
    whatsappAmtFare,
    whatsappDriverCommission,
  };
}

async function getBlockedDriverIds(driverIds) {
  if (driverIds.length === 0) return new Set();

  logWebhook('db_blocked_drivers_start', { driverCandidates: driverIds.length });

  const { data: trips, error: tripsError } = await getSupabase()
    .from('trips')
    .select('driver_id, commission_amount, completed_at')
    .in('driver_id', driverIds)
    .eq('status', 'completed')
    .gt('commission_amount', 0)
    .order('completed_at', { ascending: true });
  if (tripsError) throw tripsError;

  const { data: payments, error: paymentsError } = await getSupabase()
    .from('commission_payments')
    .select('driver_id, amount, created_at')
    .in('driver_id', driverIds)
    .order('created_at', { ascending: false });
  if (paymentsError) throw paymentsError;

  const paymentsByDriver = new Map();
  for (const payment of payments || []) {
    if (!paymentsByDriver.has(payment.driver_id)) paymentsByDriver.set(payment.driver_id, []);
    paymentsByDriver.get(payment.driver_id).push(payment);
  }

  const tripsByDriver = new Map();
  for (const trip of trips || []) {
    if (!tripsByDriver.has(trip.driver_id)) tripsByDriver.set(trip.driver_id, []);
    tripsByDriver.get(trip.driver_id).push(trip);
  }

  const blocked = new Set();
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  for (const driverId of driverIds) {
    const driverTrips = tripsByDriver.get(driverId) || [];
    if (driverTrips.length === 0) continue;
    const driverPayments = paymentsByDriver.get(driverId) || [];
    const totalCommission = driverTrips.reduce((sum, item) => sum + (Number(item.commission_amount) || 0), 0);
    const totalPaid = driverPayments.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const balance = totalCommission - totalPaid;
    if (balance <= 0) continue;

    const lastPaymentDate = driverPayments[0]?.created_at ? new Date(driverPayments[0].created_at) : null;
    const unpaidTrips = lastPaymentDate
      ? driverTrips.filter((trip) => new Date(trip.completed_at) > lastPaymentDate)
      : driverTrips;
    const oldestUnpaid = unpaidTrips[0];
    if (oldestUnpaid && new Date(oldestUnpaid.completed_at) < threeDaysAgo) {
      blocked.add(driverId);
    }
  }

  logWebhook('db_blocked_drivers_ok', {
    driverCandidates: driverIds.length,
    tripsRows: (trips || []).length,
    paymentsRows: (payments || []).length,
    blockedCount: blocked.size,
  });
  return blocked;
}

async function chooseDriver(origin, { excludedDriverIds = [] } = {}) {
  logWebhook('driver_select_start', { originLat: origin?.lat, originLng: origin?.lng });
  const { data: drivers, error } = await getSupabase()
    .from('drivers')
    .select('id, full_name, phone, push_token, current_lat, current_lng, vehicle_brand, vehicle_model, vehicle_plate, vehicle_color, is_available')
    .eq('is_available', true);
  if (error) throw error;

  const availableDrivers = (drivers || []).filter((driver) => driver.current_lat && driver.current_lng);
  if (availableDrivers.length === 0) {
    logWebhook('driver_select_no_available_coords', { totalAvailableFlagged: (drivers || []).length });
    return null;
  }

  const { data: activeTrips, error: activeTripsError } = await getSupabase()
    .from('trips')
    .select('driver_id, status, created_at')
    .in('status', DRIVER_BUSY_TRIP_STATUSES);
  if (activeTripsError) throw activeTripsError;

  const busyDriverIds = new Set();
  let ignoredStalePending = 0;
  for (const trip of activeTrips || []) {
    if (!trip?.driver_id) continue;

    const status = String(trip.status || '').toLowerCase();
    if (status !== 'pending') {
      busyDriverIds.add(trip.driver_id);
      continue;
    }

    // Pending trips can remain stale if a driver never accepted/rejected; ignore old ones.
    const ageMinutes = getTripAgeMinutes(trip);
    if (ageMinutes == null || ageMinutes <= DRIVER_PENDING_BUSY_MAX_AGE_MINUTES) {
      busyDriverIds.add(trip.driver_id);
    } else {
      ignoredStalePending += 1;
    }
  }

  const excludedDriverIdSet = new Set((excludedDriverIds || []).filter(Boolean));
  const candidateDrivers = availableDrivers.filter(
    (driver) => !busyDriverIds.has(driver.id) && !excludedDriverIdSet.has(driver.id)
  );
  if (candidateDrivers.length === 0) {
    logWebhook('driver_select_all_busy', {
      availableWithCoords: availableDrivers.length,
      busyCount: busyDriverIds.size,
      stalePendingIgnored: ignoredStalePending,
      excludedCount: excludedDriverIdSet.size,
    });
    return null;
  }

  const blockedDriverIds = await getBlockedDriverIds(candidateDrivers.map((driver) => driver.id));
  const finalCandidates = candidateDrivers.filter((driver) => !blockedDriverIds.has(driver.id));
  if (finalCandidates.length === 0) {
    logWebhook('driver_select_all_blocked', {
      candidateDrivers: candidateDrivers.length,
      blockedDrivers: blockedDriverIds.size,
    });
    return null;
  }

  // Calculate distance from each candidate to the passenger's pickup location
  const withDistance = finalCandidates
    .map((driver) => ({
      ...driver,
      distanceToOriginKm: haversineKm(
        Number(driver.current_lat),
        Number(driver.current_lng),
        origin.lat,
        origin.lng
      ),
    }))
    .sort((a, b) => a.distanceToOriginKm - b.distanceToOriginKm);

  // Expanding radius search: start at 1km, widen progressively (like Uber)
  for (const radiusKm of SEARCH_RADII_KM) {
    const inRadius = withDistance.filter((d) => d.distanceToOriginKm <= radiusKm);
    if (inRadius.length > 0) {
      const selected = inRadius[0];
      logWebhook('driver_select_ok', {
        searchRadiusKm: radiusKm,
        totalAvailable: (drivers || []).length,
        availableWithCoords: availableDrivers.length,
        busyCount: busyDriverIds.size,
        blockedCount: blockedDriverIds.size,
        finalCandidates: finalCandidates.length,
        driversInRadius: inRadius.length,
        selectedDriverId: selected.id,
        selectedDistanceKm: Math.round(selected.distanceToOriginKm * 10) / 10,
      });
      return { ...selected, searchRadiusKm: radiusKm };
    }
    logWebhook('driver_radius_expand', {
      currentRadiusKm: radiusKm,
      driversInRadius: 0,
      nextRadiusKm: SEARCH_RADII_KM[SEARCH_RADII_KM.indexOf(radiusKm) + 1] || null,
    });
  }

  // No driver found within maximum search radius
  logWebhook('driver_select_none_in_max_radius', {
    maxRadiusKm: SEARCH_RADII_KM[SEARCH_RADII_KM.length - 1],
    totalAvailable: (drivers || []).length,
    finalCandidates: finalCandidates.length,
    closestDriverKm: withDistance[0]?.distanceToOriginKm
      ? Math.round(withDistance[0].distanceToOriginKm * 10) / 10
      : null,
  });
  return null;
}

async function sendPushNotification(pushToken, payload) {
  if (!pushToken) return;
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      to: pushToken,
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      sound: 'default',
      priority: 'high',
      channelId: 'trips',
      badge: 1,
    }),
  });
}

async function createTripFromConversation({ conversation, extracted }) {
  logWebhook('trip_create_start', {
    conversationId: conversation?.id || null,
    phone: maskPhone(conversation?.phone || ''),
    hasOrigin: Boolean(extracted?.origin),
    hasDestination: Boolean(extracted?.destination),
  });

  const rawPickupQuery = extracted?.pickup_location || extracted?.origin || extracted?.destination || null;
  const pickupQuery = sanitizeAddressInput(rawPickupQuery);
  if (!pickupQuery) {
    return {
      ok: false,
      reason: 'missing_pickup_location',
      reply:
        'Necesito la ubicación donde te pasamos a buscar (calle y número). Mandamela y te derivo el móvil.',
      context: {
        passenger_name: extracted.passenger_name || conversation.push_name || 'Pasajero WhatsApp',
        pickup_location: extracted?.pickup_location || null,
        notes: extracted.notes || null,
      },
    };
  }

  let pickupLocation;
  if (extracted._preGeocodedPickup?.lat && extracted._preGeocodedPickup?.lng) {
    pickupLocation = {
      formattedAddress: extracted._preGeocodedPickup.formattedAddress,
      lat: extracted._preGeocodedPickup.lat,
      lng: extracted._preGeocodedPickup.lng,
    };
    logWebhook('trip_create_pickup_pre_geocoded', { formattedAddress: pickupLocation.formattedAddress });
  } else {
  try {
    pickupLocation = await geocodeAddress(pickupQuery);
  } catch (error) {
    logWebhook('trip_create_geocode_error', {
      conversationId: conversation?.id || null,
      error: error?.message || 'geocode_error',
      pickupQuery,
    });
    return {
      ok: false,
      reason: 'invalid_address',
      reply:
        'No pude ubicar bien esa dirección. Podés escribirme *calle y número* más claro, o compartir tu *ubicación en tiempo real* tocando el ícono de ubicación en WhatsApp y te mando el móvil directo.',
      context: {
        passenger_name: extracted.passenger_name || conversation.push_name || 'Pasajero WhatsApp',
        pickup_location: pickupQuery,
        notes: extracted.notes || null,
        awaiting_gps: true,
      },
    };
  }
  } // end pre-geocoded else

  const driver = await chooseDriver({ lat: pickupLocation.lat, lng: pickupLocation.lng });
  if (!driver) {
    logWebhook('trip_create_no_driver', {
      conversationId: conversation?.id || null,
      phone: maskPhone(conversation?.phone || ''),
      pickupAddress: pickupLocation.formattedAddress,
    });
    return {
      ok: false,
      reason: 'no_driver',
      reply:
        'Tomé tu pedido, pero ahora no hay choferes disponibles. Si querés, te aviso apenas se libere uno.',
      context: {
        passenger_name: extracted.passenger_name || conversation.push_name || 'Pasajero WhatsApp',
        pickup_location: pickupQuery,
        notes: extracted.notes || null,
      },
    };
  }

  const driverLat = Number(driver.current_lat);
  const driverLng = Number(driver.current_lng);
  const driverOriginAddress = await reverseGeocodeLatLng(driverLat, driverLng);
  const routeToPickup = await getRouteMetrics({ lat: driverLat, lng: driverLng }, pickupLocation);
  const finalDestinationHint = sanitizeAddressInput(extracted?.destination || '');

  // Intentar geocodificar el destino final si el pasajero lo proporcionó
  let finalDestinationGeo = null;
  if (finalDestinationHint) {
    try {
      finalDestinationGeo = await geocodeAddress(finalDestinationHint);
      logWebhook('trip_final_destination_geocoded', {
        hint: finalDestinationHint,
        formattedAddress: finalDestinationGeo.formattedAddress,
        lat: finalDestinationGeo.lat,
        lng: finalDestinationGeo.lng,
      });
    } catch (geoErr) {
      logWebhook('trip_final_destination_geocode_fail', {
        hint: finalDestinationHint,
        error: geoErr?.message || 'unknown',
      });
    }
  }

  // Approach-only trip: driver -> pickup has no fare.
  logWebhook('trip_approach_only_created', {
    approachDistanceKm: routeToPickup.distanceKm,
    approachDurationMinutes: routeToPickup.durationMinutes,
    hasFinalDestinationHint: Boolean(finalDestinationHint),
    hasFinalDestinationGeo: Boolean(finalDestinationGeo),
  });

  // Embeber el destino final geocodificado en notes como JSON parseable
  // para que la driver-app pueda pre-cargar el destino sin voz
  const finalDestJson = finalDestinationGeo
    ? `[FINAL_DEST_JSON:${JSON.stringify({
        address: finalDestinationGeo.formattedAddress,
        lat: finalDestinationGeo.lat,
        lng: finalDestinationGeo.lng,
      })}]`
    : null;

  const tripPayload = {
    driver_id: driver.id,
    passenger_name: extracted.passenger_name || conversation.push_name || 'Pasajero WhatsApp',
    passenger_phone: conversation.phone,
    origin_address: driverOriginAddress,
    origin_lat: driverLat,
    origin_lng: driverLng,
    destination_address: pickupLocation.formattedAddress,
    destination_lat: pickupLocation.lat,
    destination_lng: pickupLocation.lng,
    status: 'pending',
    price: null,
    commission_amount: null,
    distance_km: null,
    duration_minutes: null,
    notes: [
      '[APPROACH_ONLY]',
      extracted.notes || 'Creado automáticamente desde WhatsApp (chofer -> retiro pasajero, sin cobro inicial).',
      finalDestJson || (finalDestinationHint
        ? `Destino final sugerido por pasajero: ${finalDestinationHint}`
        : 'Destino final: se define al subir el pasajero.'),
    ].join(' '),
  };

  const { data: trip, error } = await getSupabase().from('trips').insert(tripPayload).select().single();
  if (error) throw error;

  logWebhook('db_trip_insert_ok', {
    tripId: trip?.id || null,
    driverId: trip?.driver_id || null,
    price: trip?.price ?? null,
    distanceKm: trip?.distance_km ?? null,
  });

  await sendPushNotification(driver.push_token, {
    title: 'Nuevo viaje asignado',
    body: `${trip.passenger_name} → ${trip.destination_address}`,
    data: {
      type: 'new_trip',
      tripId: trip.id,
      trip,
    },
  });

  const driverLabel = [driver.vehicle_brand, driver.vehicle_model].filter(Boolean).join(' ');
  const driverMeta = [driver.full_name, driverLabel, driver.vehicle_plate].filter(Boolean).join(' · ');

  const destinationConfirmLine = finalDestinationGeo
    ? `\nDestino: *${finalDestinationGeo.formattedAddress}*`
    : finalDestinationHint
      ? `\nDestino indicado: *${finalDestinationHint}*`
      : '';

  return {
    ok: true,
    trip,
    driver,
    reply:
      `Tomé tu pedido y ya lo derivé. Apenas un chofer lo acepte, te paso por WhatsApp quién va a buscarte.\n\nRetiro: *${pickupLocation.formattedAddress}*${destinationConfirmLine}`,
    context: {
      passenger_name: extracted.passenger_name || conversation.push_name || 'Pasajero WhatsApp',
      pickup_location: pickupQuery,
      destination: finalDestinationHint || null,
      notes: extracted.notes || null,
      confirmed_trip_id: null,
      last_cancellation_notified_trip_id: null,
    },
  };
}

async function processTripLifecycleTransitions() {
  logWebhook('trip_transition_scan_start');

  const { data: conversations, error } = await getSupabase()
    .from('whatsapp_conversations')
    .select('id, phone, status, context, last_trip_id')
    .in('status', ['awaiting_driver', 'trip_created'])
    .not('last_trip_id', 'is', null)
    .order('updated_at', { ascending: true });

  if (error) throw error;

  let confirmed = 0;
  let reassigned = 0;
  let reset = 0;

  for (const conversation of conversations || []) {
    const context = safeJsonParse(conversation.context, {});
    const trip = await getConversationFlowTripById(conversation.last_trip_id);

    if (!trip) {
      await finalizeConversation(conversation.id, {
        status: 'open',
        context: {},
        last_trip_id: null,
      });
      reset += 1;
      continue;
    }

    if (ACTIVE_TRIP_STATUSES.includes(String(trip.status || '').toLowerCase())) {
      if (context.confirmed_trip_id !== trip.id) {
        const driver = await getDriverById(trip.driver_id);
        if (driver) {
          const reply = await buildPassengerDriverConfirmationMessage(trip, driver);
          await sendWhatsAppText(conversation.phone, reply);
          await finalizeConversation(conversation.id, {
            status: 'trip_created',
            context: {
              ...context,
              confirmed_trip_id: trip.id,
            },
            last_trip_id: trip.id,
          });
          confirmed += 1;
        }
      }
      continue;
    }

    if (String(trip.status || '').toLowerCase() === 'pending') {
      if (conversation.status !== 'awaiting_driver' || context.confirmed_trip_id === trip.id) {
        await finalizeConversation(conversation.id, {
          status: 'awaiting_driver',
          context: {
            ...context,
            confirmed_trip_id: null,
          },
          last_trip_id: trip.id,
        });
      }
      continue;
    }

    if (String(trip.status || '').toLowerCase() === 'cancelled') {
      const wasPassengerNotified = context.confirmed_trip_id === trip.id;
      const cancellationAlreadyNotified = context.last_cancellation_notified_trip_id === trip.id;
      const shouldReassign = shouldReassignCancelledTrip(trip);

      if (!shouldReassign) {
        await finalizeConversation(conversation.id, {
          status: 'open',
          context: {},
          last_trip_id: null,
        });
        reset += 1;
        continue;
      }

      // Acumular choferes excluidos a través de múltiples cancelaciones para nunca
      // reasignar el mismo viaje al chofer que ya lo rechazó.
      const prevExcluded = Array.isArray(context.excluded_driver_ids) ? context.excluded_driver_ids : [];
      const accumulatedExcluded = [...new Set([...prevExcluded, trip.driver_id].filter(Boolean))];

      if (!cancellationAlreadyNotified) {
        if (wasPassengerNotified) {
          await sendWhatsAppText(
            conversation.phone,
            'El chofer asignado no va a poder tomar el viaje. Estoy buscando otro móvil y te aviso apenas quede confirmado.'
          );
        } else {
          await sendWhatsAppText(
            conversation.phone,
            'Estoy buscando un chofer disponible, te aviso en cuanto haya uno cerca.'
          );
        }
      }

      const replacement = await createReplacementTripFromCancelledTrip(trip, {
        excludedDriverIds: accumulatedExcluded,
      });

      if (!replacement.ok) {
        logWebhook('trip_reassign_no_driver', {
          conversationId: conversation.id,
          cancelledTripId: trip.id,
          excludedCount: accumulatedExcluded.length,
          reason: replacement.reason,
        });
      }

      await finalizeConversation(conversation.id, {
        status: 'awaiting_driver',
        context: {
          ...context,
          confirmed_trip_id: null,
          last_cancellation_notified_trip_id: trip.id,
          excluded_driver_ids: accumulatedExcluded,
        },
        last_trip_id: replacement.ok ? replacement.trip.id : trip.id,
      });

      if (replacement.ok) reassigned += 1;
      continue;
    }

    if (!isOpenTripStatus(trip.status)) {
      await finalizeConversation(conversation.id, {
        status: 'open',
        context: {},
        last_trip_id: null,
      });
      reset += 1;
    }
  }

  logWebhook('trip_transition_scan_done', {
    total: (conversations || []).length,
    confirmed,
    reassigned,
    reset,
  });

  return {
    watched: (conversations || []).length,
    confirmed,
    reassigned,
    reset,
  };
}

async function processTripLifecycleTransitionsForTripId(tripId) {
  if (!tripId) {
    return { watched: 0, confirmed: 0, reassigned: 0, reset: 0 };
  }

  logWebhook('trip_transition_trip_scan_start', { tripId });

  const { data: conversations, error } = await getSupabase()
    .from('whatsapp_conversations')
    .select('id, phone, status, context, last_trip_id')
    .in('status', ['awaiting_driver', 'trip_created'])
    .eq('last_trip_id', tripId)
    .order('updated_at', { ascending: true });

  if (error) throw error;

  let confirmed = 0;
  let reassigned = 0;
  let reset = 0;

  for (const conversation of conversations || []) {
    const context = safeJsonParse(conversation.context, {});
    const trip = await getConversationFlowTripById(conversation.last_trip_id);

    if (!trip) {
      await finalizeConversation(conversation.id, {
        status: 'open',
        context: {},
        last_trip_id: null,
      });
      reset += 1;
      continue;
    }

    const tripStatus = String(trip.status || '').toLowerCase();

    if (ACTIVE_TRIP_STATUSES.includes(tripStatus)) {
      if (context.confirmed_trip_id !== trip.id) {
        const driver = await getDriverById(trip.driver_id);
        if (driver) {
          const reply = await buildPassengerDriverConfirmationMessage(trip, driver);
          await sendWhatsAppText(conversation.phone, reply);
          await finalizeConversation(conversation.id, {
            status: 'trip_created',
            context: {
              ...context,
              confirmed_trip_id: trip.id,
            },
            last_trip_id: trip.id,
          });
          confirmed += 1;
        }
      }
      continue;
    }

    if (tripStatus === 'pending') {
      if (conversation.status !== 'awaiting_driver' || context.confirmed_trip_id === trip.id) {
        await finalizeConversation(conversation.id, {
          status: 'awaiting_driver',
          context: {
            ...context,
            confirmed_trip_id: null,
          },
          last_trip_id: trip.id,
        });
      }
      continue;
    }

    if (tripStatus === 'cancelled') {
      const wasPassengerNotified = context.confirmed_trip_id === trip.id;
      const cancellationAlreadyNotified = context.last_cancellation_notified_trip_id === trip.id;
      const shouldReassign = shouldReassignCancelledTrip(trip);

      if (!shouldReassign) {
        await finalizeConversation(conversation.id, {
          status: 'open',
          context: {},
          last_trip_id: null,
        });
        reset += 1;
        continue;
      }

      // Acumular choferes excluidos a través de múltiples cancelaciones para nunca
      // reasignar el mismo viaje al chofer que ya lo rechazó.
      const prevExcluded = Array.isArray(context.excluded_driver_ids) ? context.excluded_driver_ids : [];
      const accumulatedExcluded = [...new Set([...prevExcluded, trip.driver_id].filter(Boolean))];

      if (!cancellationAlreadyNotified) {
        if (wasPassengerNotified) {
          await sendWhatsAppText(
            conversation.phone,
            'El chofer asignado no va a poder tomar el viaje. Estoy buscando otro móvil y te aviso apenas quede confirmado.'
          );
        } else {
          await sendWhatsAppText(
            conversation.phone,
            'Estoy buscando un chofer disponible, te aviso en cuanto haya uno cerca.'
          );
        }
      }

      const replacement = await createReplacementTripFromCancelledTrip(trip, {
        excludedDriverIds: accumulatedExcluded,
      });

      if (!replacement.ok) {
        logWebhook('trip_reassign_no_driver', {
          conversationId: conversation.id,
          cancelledTripId: trip.id,
          excludedCount: accumulatedExcluded.length,
          reason: replacement.reason,
        });
      }

      await finalizeConversation(conversation.id, {
        status: 'awaiting_driver',
        context: {
          ...context,
          confirmed_trip_id: null,
          last_cancellation_notified_trip_id: trip.id,
          excluded_driver_ids: accumulatedExcluded,
        },
        last_trip_id: replacement.ok ? replacement.trip.id : trip.id,
      });

      if (replacement.ok) reassigned += 1;
      continue;
    }

    if (!isOpenTripStatus(tripStatus)) {
      await finalizeConversation(conversation.id, {
        status: 'open',
        context: {},
        last_trip_id: null,
      });
      reset += 1;
    }
  }

  const result = {
    watched: (conversations || []).length,
    confirmed,
    reassigned,
    reset,
  };

  logWebhook('trip_transition_trip_scan_done', { tripId, ...result });
  return result;
}

async function processClaimedConversation(batch) {
  logWebhook('conversation_process_start', {
    conversationId: batch?.id || null,
    phone: maskPhone(batch?.phone || ''),
    currentStatus: batch?.status || null,
  });

  const pendingMessages = safeJsonParse(batch.pending_messages, []);
  if (!Array.isArray(pendingMessages) || pendingMessages.length === 0) {
    logWebhook('conversation_process_no_pending', { conversationId: batch?.id || null });
    return { handled: false, updates: { processing_started_at: null } };
  }

  logWebhook('conversation_pending_loaded', {
    conversationId: batch?.id || null,
    pendingCount: pendingMessages.length,
  });

  // --- Resolución temprana de selección de dirección por encuesta ---
  // Cuando el pasajero vota en el poll de dirección, lo resolvemos aquí ANTES de
  // cualquier lógica de reset de contexto, porque el pending_poll vive en batch.context
  // y necesitamos preservarlo.
  if (batch.status === 'awaiting_address_selection') {
    const savedContext = safeJsonParse(batch.context, {});
    const pendingPoll = savedContext.pending_poll;
    const votedText = pendingMessages.map((m) => m?.contenido).filter(Boolean).join(' ').trim();

    if (pendingPoll?.candidates?.length > 0 && votedText) {
      const normVoted = normalizeForMatch(votedText);
      const match = pendingPoll.candidates.find((c) => {
        const normLabel = normalizeForMatch(c.label || c.formattedAddress || '');
        const normFmt = normalizeForMatch(c.formattedAddress || '');
        if (!normLabel && !normFmt) return false;
        // Coincidencia exacta
        if (normFmt === normVoted || normLabel === normVoted) return true;
        // Coincidencia parcial: el texto votado empieza con los primeros tokens del candidato
        const candidatePrefix = normLabel.split(' ').slice(0, 4).join(' ');
        const votedPrefix = normVoted.split(' ').slice(0, 4).join(' ');
        return candidatePrefix && votedPrefix && (
          normVoted.startsWith(candidatePrefix) || normLabel.startsWith(votedPrefix)
        );
      });

      if (match) {
        logWebhook('conversation_address_poll_resolved', {
          conversationId: batch?.id || null,
          votedText,
          matchedAddress: match.formattedAddress,
          lat: match.lat,
          lng: match.lng,
        });

        const extractedFromPoll = {
          ...(pendingPoll.extracted || {}),
          pickup_location: match.formattedAddress,
          _preGeocodedPickup: {
            formattedAddress: match.formattedAddress,
            lat: match.lat,
            lng: match.lng,
          },
        };

        const tripResult = await createTripFromConversation({
          conversation: batch,
          extracted: extractedFromPoll,
        });
        await sendWhatsAppText(batch.phone, tripResult.reply);

        logWebhook('conversation_trip_result', {
          conversationId: batch?.id || null,
          ok: Boolean(tripResult?.ok),
          reason: tripResult?.reason || null,
          tripId: tripResult?.trip?.id || null,
          driverId: tripResult?.driver?.id || null,
        });

        return {
          handled: true,
          updates: {
            status: tripResult.ok ? 'awaiting_driver' : 'awaiting_info',
            context: tripResult.context || {},
            last_trip_id: tripResult.trip?.id || batch.last_trip_id || null,
            processing_started_at: null,
            last_processed_at: new Date().toISOString(),
          },
        };
      }

      // El texto votado no coincide con ningún candidato — limpiar el poll pero preservar
      // el contexto del pasajero (nombre, dirección original) para el flujo normal
      logWebhook('conversation_address_poll_no_match', {
        conversationId: batch?.id || null,
        votedText,
        candidateCount: pendingPoll.candidates.length,
      });
      // Reescribir el contexto sin pending_poll y forzar estado 'open' para que el flujo
      // normal procese el nuevo mensaje sin el bloqueo de awaiting_address_selection
      const pollContextWithoutPoll = { ...savedContext };
      delete pollContextWithoutPoll.pending_poll;
      // Mutar las propiedades relevantes del batch para el resto del procesamiento
      batch.context = JSON.stringify(pollContextWithoutPoll);
      batch.status = 'open';
    }
  }

  const lastTripById = await getTripById(batch.last_trip_id);

  // If the previous trip is already closed, start the new request with a clean context/history.
  let shouldResetConversationState = Boolean(lastTripById && !isOpenTripStatus(lastTripById.status));
  if (shouldResetConversationState) {
    logWebhook('conversation_reset_closed_trip_context', {
      conversationId: batch?.id || null,
      tripId: lastTripById.id,
      tripStatus: lastTripById.status,
      completedAt: lastTripById.completed_at || null,
    });
  }

  // Si last_trip_id es null (fue limpiado al completar un viaje previo), verificar si el
  // último viaje del pasajero ya está cerrado para resetear el historial y evitar
  // que GPT use contexto contaminado de sesiones anteriores.
  if (!shouldResetConversationState && !batch.last_trip_id) {
    const { data: latestTripByPhone } = await getSupabase()
      .from('trips')
      .select('id, status, completed_at')
      .eq('passenger_phone', normalizePhone(batch.phone))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestTripByPhone && !isOpenTripStatus(latestTripByPhone.status)) {
      shouldResetConversationState = true;
      logWebhook('conversation_reset_last_trip_closed_by_phone', {
        conversationId: batch?.id || null,
        tripId: latestTripByPhone.id,
        tripStatus: latestTripByPhone.status,
        completedAt: latestTripByPhone.completed_at || null,
      });
    }
  }

  // Idempotency guard: if the passenger already has an open trip, do not create another one.
  const openTripByLastId = lastTripById && isOpenTripStatus(lastTripById.status) ? lastTripById : null;
  const openTripByPhone = openTripByLastId || await getLatestOpenTripByPhone(batch.phone);

  // Detect cancellation intent BEFORE applying the guard, so passengers can cancel
  // a trip that's already been accepted/in progress (going_to_pickup, in_progress, etc.).
  const combinedTextForCancelCheck = pendingMessages.map((m) => m?.contenido).filter(Boolean).join('\n');
  const ctxForCancelCheck = safeJsonParse(batch.context, {});
  const hasPendingCancelConfirm = Boolean(ctxForCancelCheck?.pending_cancel_confirm);
  const CANCEL_INTENT_RE = /\b(cancel[aá]|ya no|no quiero|dej[aá]lo|olv[ií]date|borralo|no va[sy]?|cor[tá]|no lo necesito|no necesito|no gracias|chau viaje|no voy|para todo)\b/i;
  const looksLikeCancelRequest = CANCEL_INTENT_RE.test(combinedTextForCancelCheck);
  const looksLikeCancelConfirm = hasPendingCancelConfirm && /\b(s[ií]|dale|okay|ok|bueno|claro|confirm[aá]?|cancel[aá])\b/i.test(combinedTextForCancelCheck);
  const passengerWantsToCancel = looksLikeCancelRequest || looksLikeCancelConfirm;

  if (openTripByPhone && !shouldBlockForOpenTrip(openTripByPhone)) {
    logWebhook('conversation_open_trip_guard_ignored_stale_pending', {
      conversationId: batch?.id || null,
      tripId: openTripByPhone.id,
      tripStatus: openTripByPhone.status,
      ageMinutes: getTripAgeMinutes(openTripByPhone),
      maxAgeMinutes: PENDING_GUARD_MAX_AGE_MINUTES,
      matchedBy: openTripByLastId ? 'last_trip_id' : 'phone',
    });
  }
  if (openTripByPhone && shouldBlockForOpenTrip(openTripByPhone) && !passengerWantsToCancel) {
    logWebhook('conversation_open_trip_guard', {
      conversationId: batch?.id || null,
      tripId: openTripByPhone.id,
      tripStatus: openTripByPhone.status,
      ageMinutes: getTripAgeMinutes(openTripByPhone),
      matchedBy: openTripByLastId ? 'last_trip_id' : 'phone',
    });

    const openTripStatus = String(openTripByPhone.status || '').toLowerCase();
    const alreadyAssignedMessage = openTripStatus === 'pending'
      ? `Tu pedido ya está tomado y estamos esperando que un chofer lo confirme.${openTripByPhone.destination_address ? `\nRetiro: *${openTripByPhone.destination_address}*` : ''}`
      : `Ya tenés un móvil asignado para este pedido. Tu viaje sigue en curso.${openTripByPhone.destination_address ? `\nRetiro: *${openTripByPhone.destination_address}*` : ''}`;

    await sendWhatsAppText(batch.phone, alreadyAssignedMessage);

    return {
      handled: true,
      updates: {
        status: openTripStatus === 'pending' ? 'awaiting_driver' : 'trip_created',
        context: safeJsonParse(batch.context, {}),
        last_trip_id: openTripByPhone.id,
        processing_started_at: null,
        last_processed_at: new Date().toISOString(),
      },
    };
  }

  if (openTripByPhone && shouldBlockForOpenTrip(openTripByPhone) && passengerWantsToCancel) {
    logWebhook('conversation_open_trip_guard_bypassed_for_cancel', {
      conversationId: batch?.id || null,
      tripId: openTripByPhone.id,
      tripStatus: openTripByPhone.status,
      looksLikeCancelRequest,
      looksLikeCancelConfirm,
    });
  }

  const combinedText = pendingMessages
    .map((item) => item?.contenido)
    .filter(Boolean)
    .join('\n');
  const context = shouldResetConversationState ? {} : safeJsonParse(batch.context, {});
  const history = shouldResetConversationState ? [] : await getRecentConversationMessages(batch.id, 12);

  // Extraemos el último mensaje del bot del historial para evitar repeticiones
  const rawLastBotReply = history.length > 0
    ? (history.filter((m) => m.direction === 'outgoing').pop()?.content || null)
    : null;
  // Limpiamos prefijos internos (encuesta, etc.) y truncamos para el prompt
  const lastBotReply = rawLastBotReply
    ? rawLastBotReply.replace(/^\[ENCUESTA\]\s*/i, '').slice(0, 350)
    : null;

  const extracted = await extractTripIntent({
    combinedText,
    context,
    pushName: batch.push_name,
    phone: batch.phone,
    history,
    conversationStatus: batch.status || 'open',
    lastBotReply,
  });

  const heuristics = inferTripHeuristics(combinedText, context);
  if (extracted.intent === 'other' && heuristics.looksLikeTripRequest) {
    logWebhook('conversation_override_other_to_trip_request', {
      conversationId: batch?.id || null,
      reason: 'heuristics_detected_trip_request',
    });
    extracted.intent = 'trip_request';
  }

  const pickupLocation =
    extracted.pickup_location ||
    heuristics.pickup ||
    extractDirectAddressCandidate(combinedText) ||
    extracted.origin ||
    context.pickup_location ||
    null;

  const destinationHint =
    extracted.destination ||
    heuristics.destination ||
    context.destination ||
    null;

  const nextContext = {
    passenger_name: extracted.passenger_name || context.passenger_name || batch.push_name || null,
    // Pickup should map to passenger origin. Destination remains only as final-destination hint.
    pickup_location: sanitizeAddressInput(pickupLocation),
    origin: sanitizeAddressInput(extracted.origin || heuristics.pickup || ''),
    destination: sanitizeAddressInput(destinationHint),
    notes: extracted.notes || context.notes || null,
  };

  // --- Cancelación solicitada por el pasajero ---
  if (extracted.intent === 'cancel_trip') {
    if (!extracted.cancel_confirmed) {
      // Enviar encuesta nativa de WhatsApp para confirmar la cancelación
      await sendWhatsAppPoll(
        batch.phone,
        '¿Confirmás la cancelación de tu viaje?',
        ['Sí, cancelar', 'No, mantener el viaje']
      );
      logWebhook('conversation_cancel_pending_confirm', { conversationId: batch?.id || null });
      return {
        handled: true,
        updates: {
          status: batch.status || 'open',
          context: { ...nextContext, pending_cancel_confirm: true },
          last_trip_id: batch.last_trip_id || null,
          processing_started_at: null,
          last_processed_at: new Date().toISOString(),
        },
      };
    }

    // cancel_confirmed = true: cancelar el viaje abierto si existe
    const tripToCancel =
      openTripByPhone && isOpenTripStatus(openTripByPhone.status) ? openTripByPhone : null;
    if (tripToCancel) {
      // Obtener datos completos del viaje (incluye driver_id) para notificar al chofer
      const fullTripToCancel = await getConversationFlowTripById(tripToCancel.id);
      const { error: cancelErr } = await getSupabase()
        .from('trips')
        .update({ status: 'cancelled', cancel_reason: 'Pasajero canceló por WhatsApp' })
        .eq('id', tripToCancel.id);
      if (cancelErr) {
        logWebhook('conversation_cancel_trip_error', {
          conversationId: batch?.id || null,
          tripId: tripToCancel.id,
          error: summarizeDbError(cancelErr),
        });
      } else {
        logWebhook('conversation_passenger_cancelled_trip', {
          conversationId: batch?.id || null,
          tripId: tripToCancel.id,
          driverId: fullTripToCancel?.driver_id || null,
        });
        // Notificar al chofer que el pasajero canceló
        if (fullTripToCancel?.driver_id) {
          const cancelledDriver = await getDriverById(fullTripToCancel.driver_id);
          if (cancelledDriver?.push_token) {
            await sendPushNotification(cancelledDriver.push_token, {
              title: 'Viaje cancelado',
              body: 'El pasajero canceló el viaje por WhatsApp.',
              data: { type: 'trip_cancelled', tripId: tripToCancel.id },
            });
          }
        }
      }
    }
    const cancelReply =
      extracted.reply ||
      (tripToCancel
        ? 'Listo, cancelé el pedido. Avisame cuando necesites otro móvil.'
        : 'No encontré ningún viaje activo para cancelar. ¿Necesitás un móvil?');
    await sendWhatsAppText(batch.phone, cancelReply);
    return {
      handled: true,
      updates: {
        status: 'open',
        context: {},
        last_trip_id: null,
        processing_started_at: null,
        last_processed_at: new Date().toISOString(),
      },
    };
  }

  // --- Consulta de estado del viaje ---
  if (extracted.intent === 'status_query') {
    const tripForStatus =
      openTripByPhone && isOpenTripStatus(openTripByPhone.status) ? openTripByPhone : null;
    let statusReply;
    if (!tripForStatus) {
      statusReply = extracted.reply || '¿Necesitás un móvil? Mandame desde dónde te busco.';
    } else {
      const ts = String(tripForStatus.status || '').toLowerCase();
      if (ts === 'pending') {
        statusReply =
          extracted.reply ||
          'Tu pedido está tomado, esperando que el chofer lo confirme. Te aviso apenas quede asignado.';
      } else if (ts === 'accepted' || ts === 'going_to_pickup') {
        statusReply = extracted.reply || 'El chofer ya aceptó y está yendo a buscarte.';
      } else if (ts === 'in_progress') {
        statusReply = extracted.reply || 'Tu viaje está en curso.';
      } else {
        statusReply = extracted.reply || 'Tu viaje está activo.';
      }
    }
    await sendWhatsAppText(batch.phone, statusReply);
    logWebhook('conversation_status_query', {
      conversationId: batch?.id || null,
      tripStatus: tripForStatus?.status || null,
    });
    return {
      handled: true,
      updates: {
        status: batch.status || 'open',
        context: nextContext,
        last_trip_id: batch.last_trip_id || null,
        processing_started_at: null,
        last_processed_at: new Date().toISOString(),
      },
    };
  }

  // --- Solicitud programada (no soportada automáticamente) ---
  if (extracted.intent === 'schedule_trip') {
    const scheduleReply =
      extracted.reply ||
      'Por ahora solo tomamos pedidos inmediatos. Cuando estés listo para salir, mandame un mensaje y te mando el móvil enseguida.';
    await sendWhatsAppText(batch.phone, scheduleReply);
    logWebhook('conversation_schedule_trip', {
      conversationId: batch?.id || null,
      scheduleTime: extracted.schedule_time || null,
    });
    return {
      handled: true,
      updates: {
        status: 'open',
        context: { ...nextContext, schedule_time: extracted.schedule_time || null },
        last_trip_id: shouldResetConversationState ? null : batch.last_trip_id || null,
        processing_started_at: null,
        last_processed_at: new Date().toISOString(),
      },
    };
  }

  if (extracted.intent === 'other') {
    if (extracted.reply) {
      await sendWhatsAppText(batch.phone, extracted.reply);
    }
    logWebhook('conversation_intent_other', { conversationId: batch?.id || null });
    return {
      handled: true,
      updates: {
        status: 'open',
        context: nextContext,
        last_trip_id: shouldResetConversationState ? null : batch.last_trip_id || null,
        processing_started_at: null,
        last_processed_at: new Date().toISOString(),
      },
    };
  }

  if (extracted.intent === 'ask_human') {
    // If there's a partial trip address, the AI misclassified — treat as trip_request with missing info
    const hasPartialTripData = extracted.destination || extracted.origin || nextContext.pickup_location;
    if (hasPartialTripData) {
      logWebhook('conversation_ask_human_overridden_to_trip', {
        conversationId: batch?.id || null,
        hasDestination: Boolean(extracted.destination),
        hasOrigin: Boolean(extracted.origin),
      });
      extracted.intent = 'trip_request';
      // Fall through to trip_request handling below
    } else {
      const reply = extracted.reply || 'Te paso con un operador para revisar bien el pedido.';
      await sendWhatsAppText(batch.phone, reply);
      logWebhook('conversation_intent_ask_human', { conversationId: batch?.id || null });
      return {
        handled: true,
        updates: {
          status: 'paused',
          context: nextContext,
          last_trip_id: shouldResetConversationState ? null : batch.last_trip_id || null,
          processing_started_at: null,
          last_processed_at: new Date().toISOString(),
        },
      };
    }
  }

  if (!nextContext.pickup_location) {
    // Si ya estamos esperando el GPS, no volver a pedir
    const alreadyAwaitingGps = safeJsonParse(batch.context, {})?.awaiting_gps === true;
    const reply = alreadyAwaitingGps
      ? null
      : extracted.reply ||
        'Para derivarte un móvil necesito tu ubicación de retiro. Podés mandarme la dirección (calle y número) o compartir tu *ubicación en tiempo real* tocando el ícono de ubicación en WhatsApp.';
    if (reply) await sendWhatsAppText(batch.phone, reply);
    logWebhook('conversation_missing_fields', {
      conversationId: batch?.id || null,
      missingPickupLocation: true,
      alreadyAwaitingGps,
    });
    return {
      handled: true,
      updates: {
        status: 'awaiting_info',
        context: { ...nextContext, awaiting_gps: true },
        last_trip_id: shouldResetConversationState ? null : batch.last_trip_id || null,
        processing_started_at: null,
        last_processed_at: new Date().toISOString(),
      },
    };
  }

  // --- Desambiguación de dirección: obtener candidatos de geocodificación ---
  // Usamos autocomplete + geocoding por variantes para capturar calles ambiguas
  // (ej: "Güemes 200" → Luis Güemes 200 Y General Güemes 200)
  const addressCandidates = await getAddressCandidates(nextContext.pickup_location, 5).catch(() => []);
  const distinctCandidates = addressCandidates.filter(
    (c, i, arr) =>
      i === 0 ||
      arr.slice(0, i).every(
        (prev) =>
          Math.abs(prev.lat - c.lat) > 0.001 ||
          Math.abs(prev.lng - c.lng) > 0.001
      )
  );

  if (
    distinctCandidates.length >= 2 &&
    distinctCandidates[0].score - (distinctCandidates[1]?.score ?? 0) < 0.40
  ) {
    const pollOptions = distinctCandidates.slice(0, 5).map((c) => c.formattedAddress);
    let pollMsgId = null;
    try {
      const pollResult = await sendWhatsAppPoll(
        batch.phone,
        '¿Cuál es tu dirección de retiro?',
        pollOptions
      );
      pollMsgId = pollResult.msgId;
    } catch (err) {
      logWebhook('poll_send_error', { conversationId: batch?.id || null, error: err?.message });
    }

    if (pollMsgId) {
      logWebhook('conversation_address_poll_sent', {
        conversationId: batch?.id || null,
        pollMsgId,
        optionCount: pollOptions.length,
      });
      return {
        handled: true,
        updates: {
          status: 'awaiting_address_selection',
          context: {
            ...nextContext,
            pending_poll: {
              msg_id: pollMsgId,
              phone: batch.phone,
              candidates: distinctCandidates.slice(0, 5).map((c) => ({
                label: c.formattedAddress,
                formattedAddress: c.formattedAddress,
                lat: c.lat,
                lng: c.lng,
              })),
              extracted: nextContext,
            },
          },
          last_trip_id: shouldResetConversationState ? null : batch.last_trip_id || null,
          processing_started_at: null,
          last_processed_at: new Date().toISOString(),
        },
      };
    }
  }

  const tripResult = await createTripFromConversation({ conversation: batch, extracted: nextContext });
  await sendWhatsAppText(batch.phone, tripResult.reply);

  logWebhook('conversation_trip_result', {
    conversationId: batch?.id || null,
    ok: Boolean(tripResult?.ok),
    reason: tripResult?.reason || null,
    tripId: tripResult?.trip?.id || null,
    driverId: tripResult?.driver?.id || null,
  });

  return {
    handled: true,
    updates: {
      status: 'awaiting_driver',
      context: tripResult.context,
      last_trip_id: tripResult.trip?.id || (shouldResetConversationState ? null : batch.last_trip_id || null),
      processing_started_at: null,
      last_processed_at: new Date().toISOString(),
    },
  };
}

async function processConversationById(conversationId) {
  logWebhook('conversation_process_by_id_start', { conversationId });
  const batch = await claimConversationBatch(conversationId);
  if (!batch?.id) {
    logWebhook('conversation_process_by_id_skipped', { conversationId, reason: 'not_claimed' });
    return { ok: true, skipped: true };
  }

  // Declarar fuera del try para poder acceder al contexto nuevo en el catch
  let claimedResult = null;
  try {
    claimedResult = await processClaimedConversation(batch);
    await finalizeConversation(conversationId, claimedResult.updates);
    logWebhook('conversation_process_by_id_ok', {
      conversationId,
      skipped: false,
      nextStatus: claimedResult?.updates?.status || null,
    });
    return { ok: true, skipped: false };
  } catch (error) {
    // Preservar el contexto nuevo (ej: pending_poll con candidatos de dirección)
    // para que el handler de poll.results pueda encontrarlo aunque el status falle.
    const fallbackContext = claimedResult?.updates?.context || safeJsonParse(batch.context, {});
    await finalizeConversation(conversationId, {
      status: 'open',
      processing_started_at: null,
      context: fallbackContext,
      last_processed_at: new Date().toISOString(),
    }).catch(() => {});
    logWebhook('conversation_process_by_id_error', {
      conversationId,
      error: error?.message || 'unknown_error',
    });
    throw error;
  }
}

function scheduleConversationProcessing(conversationId, delayMs = ACCUMULATION_MS) {
  if (IS_SERVERLESS) {
    logWebhook('timer_skipped', {
      reason: 'serverless_runtime',
      conversationId,
      delayMs,
    });
    return;
  }

  if (processingTimers.has(conversationId)) {
    clearTimeout(processingTimers.get(conversationId));
  }

  const timer = setTimeout(async () => {
    processingTimers.delete(conversationId);
    try {
      await processConversationById(conversationId);
    } catch (error) {
      console.error('Error procesando conversación programada:', error);
    }
  }, delayMs);

  processingTimers.set(conversationId, timer);
}

async function processPendingConversations() {
  logWebhook('pending_scan_start', { accumulationMs: ACCUMULATION_MS });
  const threshold = new Date(Date.now() - ACCUMULATION_MS).toISOString();
  const { data, error } = await getSupabase()
    .from('whatsapp_conversations')
    .select('id')
    .eq('is_collecting', true)
    .lt('accumulation_started_at', threshold);
  if (error) throw error;

  logWebhook('pending_scan_found', { total: (data || []).length, threshold });

  let processed = 0;
  let skipped = 0;
  for (const item of data || []) {
    try {
      const result = await processConversationById(item.id);
      if (result.skipped) skipped += 1;
      else processed += 1;
    } catch (error) {
      console.error(`Error procesando conversación ${item.id}:`, error);
    }
  }

  logWebhook('pending_scan_done', { processed, skipped, total: (data || []).length });
  return { processed, skipped, total: (data || []).length };
}

async function processWebhookBody(body, requestMeta = {}) {
  try {
    const payloadBody = body || {};
    const event = payloadBody.event;
    logWebhook('received', { event: event || 'unknown' });

    if (event === 'trip.transition') {
      const authHeader = requestMeta.authHeader || '';
      const tripTransitionSecretHeader = requestMeta.tripTransitionSecretHeader || '';

      if (!isTripTransitionAuthorized({ authHeader, tripTransitionSecretHeader })) {
        logWebhook('trip_transition_unauthorized');
        return { status: 401, body: { success: false, error: 'Unauthorized' } };
      }

      const tripId = String(payloadBody.tripId || '').trim();
      if (!tripId) {
        return { status: 400, body: { success: false, error: 'tripId is required' } };
      }

      ensureServerConfig();
      const transitions = await processTripLifecycleTransitionsForTripId(tripId);
      return {
        status: 200,
        body: {
          success: true,
          event: 'trip.transition',
          tripId,
          transitions,
        },
      };
    }

    if (event === 'webhook.test') {
      logWebhook('ignored', { reason: 'webhook_test' });
      return { status: 200, body: { success: true, ignored: true, reason: 'webhook_test' } };
    }

    if (UPSERT_ONLY && event === 'messages.received') {
      logWebhook('ignored', { reason: 'received_ignored_upsert_only' });
      return { status: 200, body: { success: true, ignored: true, reason: 'received_ignored_upsert_only' } };
    }

    if (event === 'poll.results') {
      const missing = getMissingServerConfig();
      if (missing.length > 0) {
        return { status: 200, body: { success: true, ignored: true, reason: 'missing_server_env' } };
      }

      const pollMsgId = String(body?.data?.key?.id || '').trim();
      const pollResult = Array.isArray(body?.data?.pollResult) ? body.data.pollResult : [];

      if (!pollMsgId) {
        logWebhook('poll_results_ignored', { reason: 'missing_poll_msg_id' });
        return { status: 200, body: { success: true, ignored: true, reason: 'missing_poll_msg_id' } };
      }

      const voted = pollResult.find((r) => Array.isArray(r.voters) && r.voters.length > 0);
      if (!voted) {
        logWebhook('poll_results_ignored', { reason: 'no_votes_yet', pollMsgId });
        return { status: 200, body: { success: true, ignored: true, reason: 'no_votes_yet' } };
      }

      // Extraer el teléfono del votante lo antes posible.
      // Según docs de WASender, voters[] contiene el JID del votante.
      // Si fromMe=true, remoteJid también es el JID del pasajero.
      // En ambos casos puede ser @s.whatsapp.net (directo) o @lid (necesita resolución).
      const voterJid =
        voted.voters[0] ||
        body?.data?.key?.remoteJid ||
        '';
      const voterPhone = await resolvePhoneFromJid(voterJid).catch(() => null);
      logWebhook('poll_results_voter_phone', {
        voterJid,
        voterPhone: voterPhone ? maskPhone(voterPhone) : null,
        pollMsgId,
      });

      // Búsqueda primaria: buscar por msg_id del poll en el contexto de CUALQUIER conversación
      // activa (incluye 'processing' por si la conversación fue reclamada por un cron en ese instante).
      const { data: pollConvs, error: pollConvError } = await getSupabase()
        .from('whatsapp_conversations')
        .select('id, phone, push_name, context')
        .in('status', [
          'awaiting_address_selection',
          'open',
          'awaiting_info',
          'processing',
          'awaiting_driver',
        ]);

      if (pollConvError) {
        logWebhook('poll_results_db_error', { error: summarizeDbError(pollConvError) });
        return { status: 500, body: { success: false, error: 'db_error' } };
      }

      // Búsqueda primaria: conversación que tenga el msg_id del poll en su contexto.
      // NOTA: pending_poll.msg_id almacena el ID numérico de WASender (ej: "43156652"), pero
      // poll.results llega con el ID de formato WhatsApp (ej: "3EB09B15..."). Por eso la
      // coincidencia exacta de msg_id casi nunca funciona.
      // Se intenta igual, y a continuación se busca también por opción votada en candidatos.
      let matchedConv = (pollConvs || []).find((c) => {
        const ctx = safeJsonParse(c.context, {});
        return ctx?.pending_poll?.msg_id === pollMsgId;
      });

      // Búsqueda primaria alternativa: por opción votada en candidatos almacenados.
      // Funciona aunque los IDs no coincidan (caso habitual).
      if (!matchedConv) {
        const convByOption = (pollConvs || []).find((c) => {
          const ctx = safeJsonParse(c.context, {});
          const cands = ctx?.pending_poll?.candidates || [];
          return (
            cands.length > 0 &&
            cands.some((can) => can.label === voted.name || can.formattedAddress === voted.name)
          );
        });
        if (convByOption) {
          matchedConv = convByOption;
          logWebhook('poll_results_matched_by_voted_option', {
            conversationId: convByOption.id,
            votedName: voted.name,
            storedMsgId: safeJsonParse(convByOption.context, {})?.pending_poll?.msg_id,
            pollMsgId,
          });
        }
      }

      let pollCtx = safeJsonParse(matchedConv?.context, {});
      let pollCandidates = pollCtx?.pending_poll?.candidates || [];
      let selectedCandidate = pollCandidates.find(
        (c) => c.label === voted.name || c.formattedAddress === voted.name
      );

      // Fallback 1: buscar por external_message_id en whatsapp_messages.
      if (!matchedConv || !selectedCandidate) {
        logWebhook('poll_results_fallback_by_msg_id', {
          pollMsgId,
          votedName: voted.name,
          reason: !matchedConv ? 'conv_not_found' : 'candidate_not_found',
        });

        const { data: pollMsg } = await getSupabase()
          .from('whatsapp_messages')
          .select('conversation_id')
          .eq('external_message_id', pollMsgId)
          .maybeSingle();

        if (pollMsg?.conversation_id) {
          const { data: convFromMsg } = await getSupabase()
            .from('whatsapp_conversations')
            .select('id, phone, push_name, context')
            .eq('id', pollMsg.conversation_id)
            .maybeSingle();

          if (convFromMsg) {
            matchedConv = convFromMsg;
            pollCtx = safeJsonParse(convFromMsg.context, {});

            // El nombre votado ya es una dirección formateada por Google → re-geocodificar directo
            try {
              const geo = await geocodeAddress(voted.name);
              selectedCandidate = {
                label: voted.name,
                formattedAddress: geo.formattedAddress,
                lat: geo.lat,
                lng: geo.lng,
              };
              logWebhook('poll_results_fallback_geocoded', {
                conversationId: matchedConv.id,
                votedName: voted.name,
                formattedAddress: geo.formattedAddress,
              });
            } catch (geoErr) {
              logWebhook('poll_results_fallback_geocode_fail', {
                votedName: voted.name,
                error: geoErr?.message || 'geocode_error',
              });
            }
          }
        }
      }

      // Fallback 2: si los fallbacks anteriores no encontraron la conversación, buscar en
      // TODOS los estados (sin filtro de status) por si la conversación quedó en un estado
      // inesperado (ej: hubo un error al guardar el status correcto).
      if (!matchedConv) {
        logWebhook('poll_results_fallback_all_statuses', { pollMsgId, votedName: voted.name });

        const { data: allConvs } = await getSupabase()
          .from('whatsapp_conversations')
          .select('id, phone, push_name, context, status')
          .not('context', 'is', null);

        const broadMatch =
          // Intentar primero por msg_id
          (allConvs || []).find((c) => {
            const ctx = safeJsonParse(c.context, {});
            return ctx?.pending_poll?.msg_id === pollMsgId;
          }) ||
          // Luego por opción votada en candidatos (robusto ante mismatch de ID)
          (allConvs || []).find((c) => {
            const ctx = safeJsonParse(c.context, {});
            const cands = ctx?.pending_poll?.candidates || [];
            return (
              cands.length > 0 &&
              cands.some((can) => can.label === voted.name || can.formattedAddress === voted.name)
            );
          });

        if (broadMatch) {
          matchedConv = broadMatch;
          pollCtx = safeJsonParse(broadMatch.context, {});
          pollCandidates = pollCtx?.pending_poll?.candidates || [];
          selectedCandidate = pollCandidates.find(
            (c) => c.label === voted.name || c.formattedAddress === voted.name
          );
          logWebhook('poll_results_fallback_all_statuses_found', {
            conversationId: broadMatch.id,
            status: broadMatch.status,
            pollMsgId,
          });

          // Re-geocodificar si no hay candidato coincidente en el contexto recuperado
          if (!selectedCandidate) {
            try {
              const geo = await geocodeAddress(voted.name);
              selectedCandidate = {
                label: voted.name,
                formattedAddress: geo.formattedAddress,
                lat: geo.lat,
                lng: geo.lng,
              };
              logWebhook('poll_results_fallback_all_statuses_geocoded', {
                conversationId: broadMatch.id,
                votedName: voted.name,
                formattedAddress: geo.formattedAddress,
              });
            } catch (geoErr) {
              logWebhook('poll_results_fallback_geocode_fail', {
                votedName: voted.name,
                error: geoErr?.message || 'geocode_error',
              });
            }
          }
        }
      }

      // Fallback 3: buscar por teléfono del votante (resuelto desde voters[0] o remoteJid).
      // Cubre el caso donde el contexto ya fue limpiado O el JID era un LID resuelto via API.
      if (!matchedConv) {
        if (voterPhone && voterPhone.length >= 8) {
          const { data: convByPhone } = await getSupabase()
            .from('whatsapp_conversations')
            .select('id, phone, push_name, context')
            .eq('phone', voterPhone)
            .maybeSingle();
          if (convByPhone) {
            matchedConv = convByPhone;
            pollCtx = safeJsonParse(convByPhone.context, {});
            pollCandidates = pollCtx?.pending_poll?.candidates || [];
            selectedCandidate = pollCandidates.find(
              (c) => c.label === voted.name || c.formattedAddress === voted.name
            );
            logWebhook('poll_results_fallback_by_phone', {
              conversationId: convByPhone.id,
              phone: maskPhone(voterPhone),
              pollMsgId,
            });
          }
        }

        // Último recurso: buscar la única conversación en awaiting_address_selection que tenga
        // un pending_poll con candidatos que incluyan la opción votada.
        if (!matchedConv) {
          const { data: awaitingConvs } = await getSupabase()
            .from('whatsapp_conversations')
            .select('id, phone, push_name, context')
            .eq('status', 'awaiting_address_selection');
          const awaitingMatch = (awaitingConvs || []).find((c) => {
            const ctx = safeJsonParse(c.context, {});
            const cands = ctx?.pending_poll?.candidates || [];
            return (
              cands.length > 0 &&
              cands.some((can) => can.label === voted.name || can.formattedAddress === voted.name)
            );
          });
          if (awaitingMatch) {
            matchedConv = awaitingMatch;
            pollCtx = safeJsonParse(awaitingMatch.context, {});
            pollCandidates = pollCtx?.pending_poll?.candidates || [];
            selectedCandidate = pollCandidates.find(
              (c) => c.label === voted.name || c.formattedAddress === voted.name
            );
            logWebhook('poll_results_fallback_awaiting_by_option', {
              conversationId: awaitingMatch.id,
              phone: maskPhone(awaitingMatch.phone),
              votedName: voted.name,
              pollMsgId,
            });
          }
        }
      }

      // Si encontramos la conv pero no hay candidato coincidente (context ya fue limpiado),
      // geocodificar la opción votada directamente.
      if (matchedConv && !selectedCandidate) {
        try {
          const geo = await geocodeAddress(voted.name);
          selectedCandidate = {
            label: voted.name,
            formattedAddress: geo.formattedAddress,
            lat: geo.lat,
            lng: geo.lng,
          };
          logWebhook('poll_results_phone_fallback_geocoded', {
            conversationId: matchedConv.id,
            votedName: voted.name,
            formattedAddress: geo.formattedAddress,
          });
        } catch (geoErr) {
          logWebhook('poll_results_fallback_geocode_fail', {
            votedName: voted.name,
            error: geoErr?.message || 'geocode_error',
          });
        }
      }

      if (!matchedConv) {
        logWebhook('poll_results_ignored', { reason: 'conversation_not_found', pollMsgId });
        return { status: 200, body: { success: true, ignored: true, reason: 'conversation_not_found' } };
      }

      if (!selectedCandidate) {
        logWebhook('poll_results_ignored', { reason: 'voted_option_not_found', votedName: voted.name });
        return { status: 200, body: { success: true, ignored: true, reason: 'voted_option_not_found' } };
      }

      logWebhook('poll_results_address_selected', {
        conversationId: matchedConv.id,
        phone: maskPhone(matchedConv.phone),
        selectedAddress: selectedCandidate.formattedAddress,
      });

      const pendingExtracted = pollCtx?.pending_poll?.extracted || {};
      const pollTripResult = await createTripFromConversation({
        conversation: matchedConv,
        extracted: {
          ...pendingExtracted,
          pickup_location: selectedCandidate.formattedAddress,
          _preGeocodedPickup: {
            formattedAddress: selectedCandidate.formattedAddress,
            lat: selectedCandidate.lat,
            lng: selectedCandidate.lng,
          },
        },
      });

      await sendWhatsAppText(matchedConv.phone, pollTripResult.reply);

      await finalizeConversation(matchedConv.id, {
        status: pollTripResult.ok ? 'awaiting_driver' : 'open',
        context: pollTripResult.ok
          ? { ...pollTripResult.context, pending_poll: null }
          : { ...pollCtx, pending_poll: null },
        last_trip_id: pollTripResult.trip?.id || null,
        processing_started_at: null,
        last_processed_at: new Date().toISOString(),
      });

      logWebhook('poll_results_trip_result', {
        conversationId: matchedConv.id,
        tripId: pollTripResult.trip?.id || null,
        ok: Boolean(pollTripResult.ok),
        reason: pollTripResult.reason || null,
      });

      return {
        status: 200,
        body: {
          success: true,
          event: 'poll.results',
          tripId: pollTripResult.trip?.id || null,
        },
      };
    }

    if (!['messages.upsert', 'messages.received'].includes(event)) {
      logWebhook('ignored', { reason: 'event_not_supported', event: event || 'unknown' });
      return { status: 200, body: { success: true, ignored: true, reason: 'event_not_supported' } };
    }

    const missing = getMissingServerConfig();
    if (missing.length > 0) {
      logWebhook('ignored', { reason: 'missing_server_env', missing });
      return {
        status: 200,
        body: {
          success: true,
          ignored: true,
          reason: 'missing_server_env',
          missing,
        },
      };
    }

    const rawMessage = payloadBody?.data?.messages || payloadBody?.data;
    const messageData = Array.isArray(rawMessage) ? rawMessage[0] : rawMessage;
    if (!messageData?.key) {
      logWebhook('ignored', { reason: 'invalid_payload' });
      return { status: 200, body: { success: true, ignored: true, reason: 'invalid_payload' } };
    }

    if (messageData.key.fromMe) {
      logWebhook('ignored', { reason: 'outgoing' });
      return { status: 200, body: { success: true, ignored: true, reason: 'outgoing' } };
    }

    if (messageData.key.remoteJid?.includes('@g.us')) {
      logWebhook('ignored', { reason: 'group' });
      return { status: 200, body: { success: true, ignored: true, reason: 'group' } };
    }

    const phone = extractPhoneFromMessage(messageData);
    if (!phone || phone.length < 8) {
      logWebhook('ignored', { reason: 'invalid_phone' });
      return { status: 200, body: { success: true, ignored: true, reason: 'invalid_phone' } };
    }

    if (!isAuthorizedPhone(phone)) {
      logWebhook('ignored', { reason: 'phone_not_allowed', phone: maskPhone(phone) });
      return { status: 200, body: { success: true, ignored: true, reason: 'phone_not_allowed' } };
    }

    const messageType = detectMessageType(messageData.message);
    const pushName = messageData.pushName || messageData.key.pushName || null;
    const messageId = messageData.key.id;
    let content = extractMessageText(messageData);
    let transcription = null;
    let mediaUrl = null;

    // --- Manejo especial de ubicación GPS en tiempo real ---
    if (messageType === 'location') {
      const locMsg = messageData.message?.locationMessage || {};
      const gpsLat = locMsg.degreesLatitude;
      const gpsLng = locMsg.degreesLongitude;

      if (typeof gpsLat === 'number' && typeof gpsLng === 'number') {
        logWebhook('location_message_received', { phone: maskPhone(phone), lat: gpsLat, lng: gpsLng });

        const { data: existingConv } = await getSupabase()
          .from('whatsapp_conversations')
          .select('id, status, context, push_name, last_trip_id')
          .eq('phone', normalizePhone(phone))
          .maybeSingle();

        const convStatus = existingConv?.status || '';
        const convCtx = safeJsonParse(existingConv?.context, {});
        const wantsGps =
          convCtx?.awaiting_gps === true ||
          ['awaiting_info', 'awaiting_address_selection', 'open'].includes(convStatus);

        if (existingConv?.id && wantsGps) {
          // WhatsApp ya trae la dirección en el payload de la ubicación.
          // Usarla directamente evita el reverse geocode y sus posibles errores de datos.
          // Campos posibles: locMsg.name (lugar), locMsg.address (dirección de calle).
          const waName = String(locMsg.name || '').trim();
          const waAddress = String(locMsg.address || '').trim();
          // Preferir address (más específico), luego name, luego reverse geocode como último recurso
          const waProvidedAddress = waAddress || waName || null;

          let reverseAddress;
          if (waProvidedAddress) {
            // La dirección viene del payload de WhatsApp — es la misma que muestra el usuario en la preview
            reverseAddress = waProvidedAddress;
            logWebhook('location_address_from_wa_payload', {
              phone: maskPhone(phone),
              waAddress: waProvidedAddress,
              lat: gpsLat,
              lng: gpsLng,
            });
          } else {
            // Fallback: reverse geocode con nuestro algoritmo de dos pasadas
            try {
              reverseAddress = await reverseGeocodeLatLng(gpsLat, gpsLng);
            } catch {
              reverseAddress = `${gpsLat.toFixed(6)}, ${gpsLng.toFixed(6)}`;
            }
          }

          const gpsTripResult = await createTripFromConversation({
            conversation: { ...existingConv, phone, push_name: existingConv.push_name || pushName },
            extracted: {
              ...convCtx,
              passenger_name: convCtx.passenger_name || pushName || null,
              pickup_location: reverseAddress,
              _preGeocodedPickup: {
                formattedAddress: reverseAddress,
                lat: gpsLat,
                lng: gpsLng,
              },
              awaiting_gps: false,
            },
          });

          await sendWhatsAppText(phone, gpsTripResult.reply);

          await finalizeConversation(existingConv.id, {
            status: gpsTripResult.ok ? 'awaiting_driver' : 'open',
            context: {
              ...(gpsTripResult.context || convCtx),
              awaiting_gps: false,
            },
            last_trip_id: gpsTripResult.trip?.id || existingConv.last_trip_id || null,
            processing_started_at: null,
            last_processed_at: new Date().toISOString(),
          });

          logWebhook('location_gps_trip_created', {
            conversationId: existingConv.id,
            phone: maskPhone(phone),
            tripId: gpsTripResult.trip?.id || null,
            ok: Boolean(gpsTripResult.ok),
          });

          return {
            status: 200,
            body: { success: true, gpsHandled: true, tripId: gpsTripResult.trip?.id || null },
          };
        }
      }

      // Si no hay conversación activa esperando GPS, dejar que fluya normal como mensaje
    }

    if (messageType === 'audio') {
      mediaUrl = await decryptAudioMessage(messageData);
      transcription = mediaUrl ? await transcribeAudioFromUrl(mediaUrl) : null;
      content = transcription || content || '[audio]';
    }

    const appendResult = await appendIncomingMessage({
      phone,
      pushName,
      messageId,
      messageType,
      content: content || `[${messageType}]`,
      mediaUrl,
      transcription,
      rawPayload: payloadBody,
    });

    if (!appendResult?.inserted) {
      logWebhook('ignored', { reason: 'duplicate_message', phone: maskPhone(phone), messageId });
      return { status: 200, body: { success: true, ignored: true, reason: 'duplicate_message' } };
    }

    // Los mensajes de tipo poll_response son votos en encuestas de dirección.
    // El evento poll.results (siempre posterior) los procesa de forma canónica con la
    // opción ya descifrada. Si intentamos procesar aquí también, corremos el riesgo de
    // que la coincidencia de texto falle y borre el pending_poll del contexto antes de
    // que llegue poll.results. Por eso, simplemente registramos el mensaje y salimos.
    if (messageType === 'poll_response') {
      logWebhook('poll_response_deferred', {
        conversationId: appendResult.conversation_id,
        phone: maskPhone(phone),
        messageId,
        reason: 'handled_by_poll_results_event',
      });
      return {
        status: 200,
        body: { success: true, queued: false, deferred: true, reason: 'poll_response_handled_by_poll_results' },
      };
    }

    scheduleConversationProcessing(appendResult.conversation_id, ACCUMULATION_MS);
    logWebhook('queued', {
      phone: maskPhone(phone),
      messageId,
      messageType,
      conversationId: appendResult.conversation_id,
      accumulationMs: ACCUMULATION_MS,
    });

    if (IMMEDIATE_PROCESSING) {
      const processResult = await processConversationById(appendResult.conversation_id);
      logWebhook('processed_immediately', {
        conversationId: appendResult.conversation_id,
        skipped: Boolean(processResult?.skipped),
      });
      return {
        status: 200,
        body: {
          success: true,
          queued: true,
          processedImmediately: true,
          conversationId: appendResult.conversation_id,
        },
      };
    }

    logWebhook('awaiting_cron', {
      conversationId: appendResult.conversation_id,
      accumulationMs: ACCUMULATION_MS,
      immediateProcessing: false,
    });

    return {
      status: 200,
      body: {
        success: true,
        queued: true,
        awaitingCron: true,
        conversationId: appendResult.conversation_id,
      },
    };
  } catch (error) {
    console.error('Error en webhook Wasender:', error);
    return { status: 500, body: { success: false, error: error.message } };
  }
}

function isVercelCronInvocation({ userAgent = '', xVercelCron = '' } = {}) {
  const ua = String(userAgent || '').toLowerCase();
  const cronHeader = String(xVercelCron || '').toLowerCase();
  return cronHeader === '1' || ua.includes('vercel-cron');
}

async function processPendingConversationsRequest({ authHeader = '', userAgent = '', xVercelCron = '' } = {}) {
  try {
    const isVercelCron = isVercelCronInvocation({ userAgent, xVercelCron });
    if (CRON_SECRET) {
      if (!isVercelCron && authHeader !== `Bearer ${CRON_SECRET}`) {
        return { status: 401, body: { success: false, error: 'Unauthorized' } };
      }
    }

    logWebhook('cron_run', {
      viaVercelCron: isVercelCron,
      hasAuthHeader: Boolean(authHeader),
    });

    ensureServerConfig();
    const pendingResult = await processPendingConversations();
    const transitionResult = await processTripLifecycleTransitions();
    return { status: 200, body: { success: true, ...pendingResult, tripTransitions: transitionResult } };
  } catch (error) {
    console.error('Error procesando pendientes:', error);
    return { status: 500, body: { success: false, error: error.message } };
  }
}

function getHealthPayload() {
  return { success: true, accumulationMs: ACCUMULATION_MS };
}

async function warmPendingTimers() {
  const { data, error } = await getSupabase()
    .from('whatsapp_conversations')
    .select('id, accumulation_started_at')
    .eq('is_collecting', true)
    .not('accumulation_started_at', 'is', null);

  if (error) throw error;

  for (const conversation of data || []) {
    const startedAt = new Date(conversation.accumulation_started_at).getTime();
    const remaining = Math.max(0, ACCUMULATION_MS - (Date.now() - startedAt));
    scheduleConversationProcessing(conversation.id, remaining);
  }
}

async function ensureWarm() {
  if (warmed) return;
  warmed = true;

  const missing = getMissingServerConfig();
  if (missing.length > 0) {
    console.warn(`Warmup omitido por variables faltantes: ${missing.join(', ')}`);
    return;
  }

  try {
    await warmPendingTimers();
  } catch (error) {
    console.error('No se pudieron rehidratar timers pendientes:', error.message);
  }
}

export async function POST(req) {
  await ensureWarm();
  const body = await req.json();
  const authHeader = req.headers.get('authorization') || '';
  const tripTransitionSecretHeader = req.headers.get('x-trip-transition-secret') || '';
  logWebhook('http_post', {
    vercelId: req.headers.get('x-vercel-id') || null,
    hasEvent: Boolean(body?.event),
    event: body?.event || null,
  });
  const result = await processWebhookBody(body, { authHeader, tripTransitionSecretHeader });
  logWebhook('http_post_result', { status: result.status, success: result.body?.success === true });
  return Response.json(result.body, { status: result.status });
}

export async function GET(req) {
  await ensureWarm();
  const url = new URL(req.url);

  if (url.searchParams.get('health') === '1') {
    return Response.json(getHealthPayload(), { status: 200 });
  }

  const authHeader = req.headers.get('authorization') || '';
  const userAgent = req.headers.get('user-agent') || '';
  const xVercelCron = req.headers.get('x-vercel-cron') || '';
  const result = await processPendingConversationsRequest({ authHeader, userAgent, xVercelCron });
  return Response.json(result.body, { status: result.status });
}
