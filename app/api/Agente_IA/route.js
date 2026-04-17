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
const ALLOWED_PHONES = new Set(['5493878630173']);
const IS_SERVERLESS = Boolean(process.env.VERCEL);
const IMMEDIATE_PROCESSING =
  (process.env.WHATSAPP_IMMEDIATE_PROCESSING || '').toLowerCase() === 'true';

const ACTIVE_TRIP_STATUSES = ['accepted', 'going_to_pickup', 'in_progress'];
const OPEN_TRIP_STATUSES = ['pending', ...ACTIVE_TRIP_STATUSES];
const PENDING_GUARD_MAX_AGE_MINUTES = Number(process.env.WHATSAPP_PENDING_GUARD_MAX_AGE_MINUTES || 5);
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
  const cityOnlyPatterns = ['salta, argentina', 'salta, salta, argentina'];
  const isCityOnly = cityOnlyPatterns.includes(formatted);

  const onlyBroadTypes = types.every((t) =>
    ['locality', 'administrative_area_level_1', 'administrative_area_level_2', 'country', 'political'].includes(t)
  );

  if (isCityOnly) return true;
  if (onlyBroadTypes) return true;
  if (locationType === 'APPROXIMATE' && !hasRoute && !hasStreetNumber && !hasPremise) return true;
  if (queryHasNumber && !hasStreetNumber) return true;

  return false;
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
  return 'text';
}

function extractMessageText(messageData) {
  const message = messageData?.message || {};
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

async function extractTripIntent({ combinedText, context, pushName, phone, history }) {
  logWebhook('ai_extract_intent_start', {
    phone: maskPhone(phone),
    textLen: combinedText?.length || 0,
    historyCount: history?.length || 0,
    hasContext: Boolean(context && Object.keys(context).length),
    hasPushName: Boolean(pushName),
  });

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-5.4-mini',
    temperature: 0.1,
    max_completion_tokens: 500,
    messages: [
      {
        role: 'system',
        content: `Sos un operador que convierte mensajes de WhatsApp en pedidos de remís para Salta Capital, Argentina.

Tu tarea es leer los mensajes acumulados y extraer datos para crear un viaje.

Devolvé SOLO JSON válido con este esquema:
{
  "intent": "trip_request" | "ask_human" | "other",
  "passenger_name": string | null,
  "origin": string | null,
  "destination": string | null,
  "notes": string | null,
  "reply": string | null,
  "confidence": number,
  "missing_fields": string[]
}

Reglas:
- Considerá el contexto previo: si el cliente antes dijo el origen y ahora manda el destino, unificá todo.
- "origin" y "destination" deben ser queries cortas y geocodificables en Google Maps, con sesgo a Salta. Ejemplo: "Belgrano 245, Salta" o "Barrio Tres Cerritos, Salta".
- Si no hay suficientes datos para pedir un viaje, marcá los faltantes exactos en missing_fields.
- Un viaje requiere como mínimo origen y destino.
- Si el texto es un saludo o algo que no pide viaje, devolvé intent="other".
- Si parece que el caso debe verlo una persona, devolvé intent="ask_human".
- reply debe ser una respuesta breve en español argentino lista para WhatsApp.
- No inventes direcciones.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          pushName,
          phone,
          currentContext: context || {},
          history: history.map((item) => ({
            direction: item.direction,
            content: item.transcription || item.content,
          })),
          latestBatch: combinedText,
        }),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  const match = raw?.match(/\{[\s\S]*\}/);
  if (!match) {
    logWebhook('ai_extract_intent_fallback', { reason: 'no_json' });
    return {
      intent: 'other',
      passenger_name: null,
      origin: null,
      destination: null,
      notes: null,
      reply: 'No terminé de entender el pedido. Pasame origen y destino así te asigno un móvil.',
      confidence: 0,
      missing_fields: ['origin', 'destination'],
    };
  }

  const parsed = safeJsonParse(match[0], {
    intent: 'other',
    passenger_name: null,
    origin: null,
    destination: null,
    notes: null,
    reply: null,
    confidence: 0,
    missing_fields: [],
  });

  logWebhook('ai_extract_intent_ok', {
    intent: parsed?.intent || null,
    confidence: parsed?.confidence ?? null,
    hasOrigin: Boolean(parsed?.origin),
    hasDestination: Boolean(parsed?.destination),
    missingFields: Array.isArray(parsed?.missing_fields) ? parsed.missing_fields : [],
  });
  return parsed;
}

async function geocodeAddress(address) {
  const query = /salta/i.test(address) ? address : `${address}, Salta, Argentina`;
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
    logWebhook('maps_geocode_fail', {
      query,
      status: payload.status || null,
      resultCount: payload.results?.length || 0,
    });
    throw new Error(`No se pudo geocodificar: ${address}`);
  }

  const result = payload.results.find((candidate) => !isCoarseGeocodeResult(candidate, query));
  if (!result) {
    logWebhook('maps_geocode_fail', {
      query,
      status: payload.status || null,
      reason: 'coarse_result_only',
      topFormatted: payload.results?.[0]?.formatted_address || null,
    });
    throw new Error(`Dirección demasiado amplia o ambigua: ${address}`);
  }

  const resultPayload = {
    formattedAddress: result.formatted_address,
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
  };
  logWebhook('maps_geocode_ok', {
    query,
    formattedAddress: resultPayload.formattedAddress,
    lat: resultPayload.lat,
    lng: resultPayload.lng,
  });
  return resultPayload;
}

async function reverseGeocodeLatLng(lat, lng) {
  logWebhook('maps_reverse_geocode_start', { lat, lng });
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${lat},${lng}`);
  url.searchParams.set('language', 'es');
  url.searchParams.set('region', 'ar');
  url.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  const response = await fetchWithRetry(url, {}, { label: 'reverse_geocode' });
  const payload = await response.json();
  if (payload.status !== 'OK' || !payload.results?.length) {
    logWebhook('maps_reverse_geocode_fail', {
      lat,
      lng,
      status: payload.status || null,
      resultCount: payload.results?.length || 0,
    });
    return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
  }

  const formatted = payload.results[0]?.formatted_address || `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
  logWebhook('maps_reverse_geocode_ok', { lat, lng, formattedAddress: formatted });
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

async function chooseDriver(origin) {
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
    .select('driver_id')
    .in('status', ACTIVE_TRIP_STATUSES);
  if (activeTripsError) throw activeTripsError;

  const busyDriverIds = new Set((activeTrips || []).map((trip) => trip.driver_id).filter(Boolean));
  const candidateDrivers = availableDrivers.filter((driver) => !busyDriverIds.has(driver.id));
  if (candidateDrivers.length === 0) {
    logWebhook('driver_select_all_busy', {
      availableWithCoords: availableDrivers.length,
      busyCount: busyDriverIds.size,
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
        'No pude ubicar bien la dirección de retiro. Pasame *calle y número* (o referencia bien precisa) para derivarte el móvil correcto.',
      context: {
        passenger_name: extracted.passenger_name || conversation.push_name || 'Pasajero WhatsApp',
        pickup_location: pickupQuery,
        notes: extracted.notes || null,
      },
    };
  }

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

  // Approach-only trip: driver -> pickup has no fare.
  logWebhook('trip_approach_only_created', {
    approachDistanceKm: routeToPickup.distanceKm,
    approachDurationMinutes: routeToPickup.durationMinutes,
    hasFinalDestinationHint: Boolean(finalDestinationHint),
  });

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
      finalDestinationHint ? `Destino final sugerido por pasajero: ${finalDestinationHint}` : 'Destino final: se define al subir el pasajero.',
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
  const etaText = routeToPickup.durationMinutes != null ? `\nLlegada estimada: *~${routeToPickup.durationMinutes} min*` : '';
  const distText = driver.distanceToOriginKm != null
    ? ` (a ${Math.round(driver.distanceToOriginKm * 10) / 10} km)`
    : '';

  return {
    ok: true,
    trip,
    driver,
    reply:
      `Listo, ya te asigné un móvil que va en camino a buscarte.\n\nChofer: *${driver.full_name || 'Sin nombre'}*${distText}${driverMeta ? `\n${driverMeta}` : ''}${etaText}\nRetiro: *${pickupLocation.formattedAddress}*\n\nEl precio se calcula recién cuando subís y se define el destino final.`,
    context: {},
  };
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

  // Idempotency guard: if the passenger already has an open trip, do not create another one.
  const openTripByLastId = await getOpenTripById(batch.last_trip_id);
  const openTripByPhone = openTripByLastId || await getLatestOpenTripByPhone(batch.phone);
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
  if (openTripByPhone && shouldBlockForOpenTrip(openTripByPhone)) {
    logWebhook('conversation_open_trip_guard', {
      conversationId: batch?.id || null,
      tripId: openTripByPhone.id,
      tripStatus: openTripByPhone.status,
      ageMinutes: getTripAgeMinutes(openTripByPhone),
      matchedBy: openTripByLastId ? 'last_trip_id' : 'phone',
    });

    await sendWhatsAppText(
      batch.phone,
      `Ya tenés un móvil asignado para este pedido. Tu viaje sigue en curso.${openTripByPhone.destination_address ? `\nRetiro: *${openTripByPhone.destination_address}*` : ''}`
    );

    return {
      handled: true,
      updates: {
        status: 'trip_created',
        context: safeJsonParse(batch.context, {}),
        last_trip_id: openTripByPhone.id,
        processing_started_at: null,
        last_processed_at: new Date().toISOString(),
      },
    };
  }

  const combinedText = pendingMessages
    .map((item) => item?.contenido)
    .filter(Boolean)
    .join('\n');
  const context = safeJsonParse(batch.context, {});
  const history = await getRecentConversationMessages(batch.id, 12);
  const extracted = await extractTripIntent({
    combinedText,
    context,
    pushName: batch.push_name,
    phone: batch.phone,
    history,
  });

  const nextContext = {
    passenger_name: extracted.passenger_name || context.passenger_name || batch.push_name || null,
    // Pickup should map to passenger origin. Destination remains only as final-destination hint.
    pickup_location: extracted.origin || context.pickup_location || extracted.destination || null,
    origin: extracted.origin || null,
    destination: extracted.destination || null,
    notes: extracted.notes || context.notes || null,
  };

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
        processing_started_at: null,
        last_processed_at: new Date().toISOString(),
      },
    };
  }

  if (extracted.intent === 'ask_human') {
    const reply = extracted.reply || 'Te paso con un operador para revisar bien el pedido.';
    await sendWhatsAppText(batch.phone, reply);
    logWebhook('conversation_intent_ask_human', { conversationId: batch?.id || null });
    return {
      handled: true,
      updates: {
        status: 'paused',
        context: nextContext,
        processing_started_at: null,
        last_processed_at: new Date().toISOString(),
      },
    };
  }

  if (!nextContext.pickup_location) {
    const reply =
      extracted.reply ||
      'Para derivarte un móvil necesito la ubicación de retiro (calle y número). Mandamela en un solo mensaje si podés.';
    await sendWhatsAppText(batch.phone, reply);
    logWebhook('conversation_missing_fields', {
      conversationId: batch?.id || null,
      missingPickupLocation: !nextContext.pickup_location,
    });
    return {
      handled: true,
      updates: {
        status: 'awaiting_info',
        context: nextContext,
        processing_started_at: null,
        last_processed_at: new Date().toISOString(),
      },
    };
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
      status: tripResult.ok ? 'trip_created' : 'awaiting_driver',
      context: tripResult.context,
      last_trip_id: tripResult.trip?.id || batch.last_trip_id || null,
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

  try {
    const result = await processClaimedConversation(batch);
    await finalizeConversation(conversationId, result.updates);
    logWebhook('conversation_process_by_id_ok', {
      conversationId,
      skipped: false,
      nextStatus: result?.updates?.status || null,
    });
    return { ok: true, skipped: false };
  } catch (error) {
    await finalizeConversation(conversationId, {
      status: 'open',
      processing_started_at: null,
      context: safeJsonParse(batch.context, {}),
    });
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

async function processWebhookBody(body) {
  try {
    const payloadBody = body || {};
    const event = payloadBody.event;
    logWebhook('received', { event: event || 'unknown' });

    if (event === 'webhook.test') {
      logWebhook('ignored', { reason: 'webhook_test' });
      return { status: 200, body: { success: true, ignored: true, reason: 'webhook_test' } };
    }

    if (UPSERT_ONLY && event === 'messages.received') {
      logWebhook('ignored', { reason: 'received_ignored_upsert_only' });
      return { status: 200, body: { success: true, ignored: true, reason: 'received_ignored_upsert_only' } };
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
    const result = await processPendingConversations();
    return { status: 200, body: { success: true, ...result } };
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
  logWebhook('http_post', {
    vercelId: req.headers.get('x-vercel-id') || null,
    hasEvent: Boolean(body?.event),
    event: body?.event || null,
  });
  const result = await processWebhookBody(body);
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
