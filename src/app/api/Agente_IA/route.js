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

const ACTIVE_TRIP_STATUSES = ['pending', 'accepted', 'going_to_pickup', 'in_progress'];
const processingTimers = new Map();

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

function ensureServerConfig() {
  const missing = getMissingServerConfig();
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno: ${missing.join(', ')}`);
  }
}

function getMissingServerConfig() {
  const missing = [];
  if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  if (!WASENDER_API_KEY) missing.push('WASENDER_API_KEY');
  if (!GOOGLE_MAPS_API_KEY && !process.env.VITE_GOOGLE_MAPS_API_KEY) missing.push('GOOGLE_MAPS_API_KEY');
  return missing;
}

function getSupabase() {
  ensureServerConfig();
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
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

  const response = await fetch(`${WASENDER_BASE_URL}/decrypt-media`, {
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
  const response = await fetch(audioUrl);
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

  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
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
  const response = await fetch(`${WASENDER_BASE_URL}/send-message`, {
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
  const { data, error } = await getSupabase().rpc('claim_whatsapp_conversation_batch', {
    p_conversation_id: conversationId,
  });

  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
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
  if (error) throw error;
}

async function getRecentConversationMessages(conversationId, limit = 12) {
  const { data, error } = await getSupabase()
    .from('whatsapp_messages')
    .select('direction, content, transcription, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).reverse();
}

async function extractTripIntent({ combinedText, context, pushName, phone, history }) {
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

  return safeJsonParse(match[0], {
    intent: 'other',
    passenger_name: null,
    origin: null,
    destination: null,
    notes: null,
    reply: null,
    confidence: 0,
    missing_fields: [],
  });
}

async function geocodeAddress(address) {
  const query = /salta/i.test(address) ? address : `${address}, Salta, Argentina`;
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('language', 'es');
  url.searchParams.set('region', 'ar');
  url.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  const response = await fetch(url);
  const payload = await response.json();
  if (payload.status !== 'OK' || !payload.results?.length) {
    throw new Error(`No se pudo geocodificar: ${address}`);
  }

  const result = payload.results[0];
  return {
    formattedAddress: result.formatted_address,
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
  };
}

async function getRouteMetrics(origin, destination) {
  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('origin', `${origin.lat},${origin.lng}`);
  url.searchParams.set('destination', `${destination.lat},${destination.lng}`);
  url.searchParams.set('language', 'es');
  url.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  const response = await fetch(url);
  const payload = await response.json();
  if (payload.status !== 'OK' || !payload.routes?.length) {
    return { distanceKm: null, durationMinutes: null };
  }

  const leg = payload.routes[0].legs[0];
  return {
    distanceKm: Math.round((leg.distance.value / 1000) * 10) / 10,
    durationMinutes: Math.round(leg.duration.value / 60),
  };
}

async function getSettingsMap() {
  const { data, error } = await getSupabase().from('settings').select('key, value');
  if (error) throw error;
  return Object.fromEntries((data || []).map((item) => [item.key, item.value]));
}

async function getBlockedDriverIds(driverIds) {
  if (driverIds.length === 0) return new Set();

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

  return blocked;
}

async function chooseDriver(origin) {
  const { data: drivers, error } = await getSupabase()
    .from('drivers')
    .select('id, full_name, phone, push_token, current_lat, current_lng, vehicle_brand, vehicle_model, vehicle_plate, vehicle_color, is_available')
    .eq('is_available', true);
  if (error) throw error;

  const availableDrivers = (drivers || []).filter((driver) => driver.current_lat && driver.current_lng);
  if (availableDrivers.length === 0) return null;

  const { data: activeTrips, error: activeTripsError } = await getSupabase()
    .from('trips')
    .select('driver_id')
    .in('status', ACTIVE_TRIP_STATUSES);
  if (activeTripsError) throw activeTripsError;

  const busyDriverIds = new Set((activeTrips || []).map((trip) => trip.driver_id).filter(Boolean));
  const candidateDrivers = availableDrivers.filter((driver) => !busyDriverIds.has(driver.id));
  if (candidateDrivers.length === 0) return null;

  const blockedDriverIds = await getBlockedDriverIds(candidateDrivers.map((driver) => driver.id));
  const finalCandidates = candidateDrivers.filter((driver) => !blockedDriverIds.has(driver.id));
  if (finalCandidates.length === 0) return null;

  return finalCandidates
    .map((driver) => ({
      ...driver,
      distanceToOriginKm: haversineKm(
        Number(driver.current_lat),
        Number(driver.current_lng),
        origin.lat,
        origin.lng
      ),
    }))
    .sort((a, b) => a.distanceToOriginKm - b.distanceToOriginKm)[0];
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
  const origin = await geocodeAddress(extracted.origin);
  const destination = await geocodeAddress(extracted.destination);
  const route = await getRouteMetrics(origin, destination);
  const settings = await getSettingsMap();
  const tariffPerKm = Number(settings.tariff_per_km || 0);
  const tariffBase = Number(settings.tariff_base || 0);
  const commissionPercent = Number(settings.commission_percent || 10);
  const price = route.distanceKm == null ? null : Math.round(tariffBase + tariffPerKm * route.distanceKm);
  const commissionAmount = price == null ? null : Math.round((price * commissionPercent) / 100);

  const driver = await chooseDriver({ lat: origin.lat, lng: origin.lng });
  if (!driver) {
    return {
      ok: false,
      reason: 'no_driver',
      reply:
        'Tomé tu pedido, pero ahora no hay choferes disponibles. Si querés, te aviso apenas se libere uno.',
      context: {
        passenger_name: extracted.passenger_name || conversation.push_name || 'Pasajero WhatsApp',
        origin: extracted.origin,
        destination: extracted.destination,
        notes: extracted.notes || null,
      },
    };
  }

  const tripPayload = {
    driver_id: driver.id,
    passenger_name: extracted.passenger_name || conversation.push_name || 'Pasajero WhatsApp',
    passenger_phone: conversation.phone,
    origin_address: origin.formattedAddress,
    origin_lat: origin.lat,
    origin_lng: origin.lng,
    destination_address: destination.formattedAddress,
    destination_lat: destination.lat,
    destination_lng: destination.lng,
    status: 'pending',
    price,
    commission_amount: commissionAmount,
    distance_km: route.distanceKm,
    duration_minutes: route.durationMinutes,
    notes: extracted.notes || 'Creado automáticamente desde WhatsApp',
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

  const driverLabel = [driver.vehicle_brand, driver.vehicle_model].filter(Boolean).join(' ');
  const driverMeta = [driver.full_name, driverLabel, driver.vehicle_plate].filter(Boolean).join(' · ');

  return {
    ok: true,
    trip,
    driver,
    reply:
      `Listo, ya te busqué un móvil.\nChofer: *${driver.full_name || 'Sin nombre'}*${driverMeta ? `\n${driverMeta}` : ''}${price ? `\nTarifa estimada: *$${price.toLocaleString('es-AR')}*` : ''}`,
    context: {},
  };
}

async function processClaimedConversation(batch) {
  const pendingMessages = safeJsonParse(batch.pending_messages, []);
  if (!Array.isArray(pendingMessages) || pendingMessages.length === 0) {
    return { handled: false, updates: { processing_started_at: null } };
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
    origin: extracted.origin || context.origin || null,
    destination: extracted.destination || context.destination || null,
    notes: extracted.notes || context.notes || null,
  };

  if (extracted.intent === 'other') {
    if (extracted.reply) {
      await sendWhatsAppText(batch.phone, extracted.reply);
    }
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

  if (!nextContext.origin || !nextContext.destination) {
    const missing = [];
    if (!nextContext.origin) missing.push('origen');
    if (!nextContext.destination) missing.push('destino');
    const reply =
      extracted.reply ||
      `Para asignarte un móvil necesito ${missing.join(' y ')}. Mandamelo en un solo mensaje si podés.`;
    await sendWhatsAppText(batch.phone, reply);
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
  const batch = await claimConversationBatch(conversationId);
  if (!batch?.id) return { ok: true, skipped: true };

  try {
    const result = await processClaimedConversation(batch);
    await finalizeConversation(conversationId, result.updates);
    return { ok: true, skipped: false };
  } catch (error) {
    await finalizeConversation(conversationId, {
      status: 'open',
      processing_started_at: null,
      context: safeJsonParse(batch.context, {}),
    });
    throw error;
  }
}

function scheduleConversationProcessing(conversationId, delayMs = ACCUMULATION_MS) {
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
  const threshold = new Date(Date.now() - ACCUMULATION_MS).toISOString();
  const { data, error } = await getSupabase()
    .from('whatsapp_conversations')
    .select('id')
    .eq('is_collecting', true)
    .lt('accumulation_started_at', threshold);
  if (error) throw error;

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
    return { status: 200, body: { success: true, queued: true, conversationId: appendResult.conversation_id } };
  } catch (error) {
    console.error('Error en webhook Wasender:', error);
    return { status: 500, body: { success: false, error: error.message } };
  }
}

async function processPendingConversationsRequest(authHeader = '') {
  try {
    if (CRON_SECRET) {
      if (authHeader !== `Bearer ${CRON_SECRET}`) {
        return { status: 401, body: { success: false, error: 'Unauthorized' } };
      }
    }

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
  const result = await processPendingConversationsRequest(authHeader);
  return Response.json(result.body, { status: result.status });
}
