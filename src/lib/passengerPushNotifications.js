import {
  getFirebaseMessagingClient,
  isLegacyExpoPushToken,
  isLikelyFcmToken,
  normalizeFcmDataPayload,
  normalizeFirebaseSendError,
} from './firebaseAdmin';
import { isPassengerAppTrip } from '../../shared/trip-contract.js';
import { normalizePassengerPhoneForDb } from './passengerAuthPhone';

export const PASSENGER_PUSHABLE_STATUSES = [
  'pending',
  'accepted',
  'going_to_pickup',
  'in_progress',
  'completed',
  'cancelled',
];

const STALE_TOKEN_REASONS = new Set(['device_not_registered', 'invalid_registration_token']);

function parseWaContext(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getPassengerPushSentStatuses(waContext) {
  const ctx = parseWaContext(waContext);
  const list = Array.isArray(ctx.passenger_push_statuses) ? ctx.passenger_push_statuses : [];
  return new Set(list.map((item) => String(item || '').trim()).filter(Boolean));
}

export function buildPassengerPushWaContext(waContext, status) {
  const ctx = parseWaContext(waContext);
  const sent = getPassengerPushSentStatuses(ctx);
  sent.add(String(status || '').trim());
  return {
    ...ctx,
    passenger_push_statuses: [...sent],
  };
}

export function getPassengerTripPushContent(status, { driverName } = {}) {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const driver = String(driverName || '').trim();

  const messages = {
    pending: {
      title: 'Asignando conductor',
      body: 'Un conductor está confirmando tu viaje.',
      channelId: 'viajes',
    },
    accepted: {
      title: '¡Conductor asignado!',
      body: driver ? `${driver} aceptó tu viaje.` : 'Tu conductor aceptó el viaje.',
      channelId: 'viajes',
    },
    going_to_pickup: {
      title: 'El conductor viene a buscarte',
      body: driver
        ? `${driver} está en camino a tu ubicación.`
        : 'Preparate, el conductor está en camino.',
      channelId: 'conductor',
    },
    in_progress: {
      title: '¡Viaje en curso!',
      body: 'Disfrutá tu viaje.',
      channelId: 'viajes',
    },
    completed: {
      title: '¡Viaje completado!',
      body: '¡Gracias por usar Profesional! Hasta la próxima.',
      channelId: 'viajes',
    },
    cancelled: {
      title: 'Viaje cancelado',
      body: 'Tu viaje fue cancelado. Podés pedir uno nuevo.',
      channelId: 'viajes',
    },
  };

  return messages[normalizedStatus] || null;
}

/**
 * El chofer acepta directo en going_to_pickup (sin pasar por accepted en BD).
 * Mapeamos el primer push de aceptación al mensaje de "accepted".
 */
export function resolvePassengerPushStatus(trip) {
  const tripStatus = String(trip?.status || '').trim().toLowerCase();
  if (!PASSENGER_PUSHABLE_STATUSES.includes(tripStatus)) {
    return null;
  }

  const sent = getPassengerPushSentStatuses(trip?.wa_context);

  if (tripStatus === 'going_to_pickup') {
    if (!sent.has('accepted')) return 'accepted';
    return null;
  }

  if (sent.has(tripStatus)) {
    return null;
  }

  return tripStatus;
}

function buildPassengerPhoneLookupVariants(passengerPhone) {
  const canonical = normalizePassengerPhoneForDb(passengerPhone);
  if (!canonical) return [];

  const variants = new Set([canonical]);
  if (canonical.startsWith('54') && !canonical.startsWith('549')) {
    variants.add(`549${canonical.slice(2)}`);
  }
  if (canonical.startsWith('549')) {
    variants.add(`54${canonical.slice(3)}`);
  }

  return [...variants];
}

async function lookupPassengerPushToken(supabase, passengerPhone) {
  const variants = buildPassengerPhoneLookupVariants(passengerPhone);
  if (!variants.length) return null;

  // 1) Fuente principal: passenger_auth_sessions (token más reciente por phone)
  const { data: sessionRows } = await supabase
    .from('passenger_auth_sessions')
    .select('phone, push_token, updated_at')
    .in('phone', variants)
    .not('push_token', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1);

  const sessionToken = String(sessionRows?.[0]?.push_token || '').trim();
  if (sessionToken) return sessionToken;

  // 2) Fallback: passenger_devices (tabla legacy)
  const { data, error } = await supabase
    .from('passenger_devices')
    .select('phone, push_token, updated_at')
    .in('phone', variants)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return String(row?.push_token || '').trim() || null;
}

async function clearStalePassengerPushToken(supabase, passengerPhone, reason) {
  if (!STALE_TOKEN_REASONS.has(reason)) {
    return { cleared: false };
  }

  const variants = buildPassengerPhoneLookupVariants(passengerPhone);
  if (!variants.length) {
    return { cleared: false };
  }

  // Limpiar en ambas tablas (no lanzar si alguna falla)
  const [sessResult, devResult] = await Promise.allSettled([
    supabase
      .from('passenger_auth_sessions')
      .update({ push_token: null })
      .in('phone', variants),
    supabase
      .from('passenger_devices')
      .delete()
      .in('phone', variants),
  ]);

  const error = sessResult.value?.error || devResult.value?.error;
  if (error) {
    return { cleared: false, clearError: error.message || 'passenger_push_token_clear_failed' };
  }

  return { cleared: true };
}

export async function sendPassengerPushNotification(pushToken, { title, body, data = {}, channelId = 'viajes' } = {}) {
  const token = String(pushToken || '').trim();
  if (!token) {
    return { ok: false, reason: 'no_push_token' };
  }

  if (!isLikelyFcmToken(token)) {
    return {
      ok: false,
      reason: isLegacyExpoPushToken(token) ? 'legacy_expo_token_format' : 'invalid_push_token_format',
    };
  }

  const safeTitle = String(title || '').trim();
  const safeBody = String(body || '').trim();
  if (!safeTitle || !safeBody) {
    return { ok: false, reason: 'invalid_payload' };
  }

  try {
    const messageId = await getFirebaseMessagingClient().send({
      token,
      notification: { title: safeTitle, body: safeBody },
      data: normalizeFcmDataPayload(data),
      android: {
        priority: 'high',
        notification: {
          channelId: String(channelId || 'viajes'),
          sound: 'default',
        },
      },
    });

    return { ok: true, messageId: messageId || null };
  } catch (error) {
    const normalized = normalizeFirebaseSendError(error);
    return {
      ok: false,
      reason: normalized.reason || 'push_error',
      code: normalized.code || null,
      message: normalized.message || null,
    };
  }
}

/**
 * Envía push FCM al pasajero si el viaje es de la app y aún no se notificó ese estado.
 */
export async function trySendPassengerAppTripPush(supabase, trip, driver = null) {
  if (!supabase || !trip?.id || !isPassengerAppTrip(trip)) {
    return { ok: false, reason: 'not_passenger_app_trip' };
  }

  const tripStatus = String(trip.status || '').trim().toLowerCase();
  const pushStatus = resolvePassengerPushStatus(trip);
  if (!pushStatus) {
    return {
      ok: false,
      reason: PASSENGER_PUSHABLE_STATUSES.includes(tripStatus) ? 'already_sent' : 'status_not_pushable',
      status: tripStatus,
    };
  }

  const passengerPhone = normalizePassengerPhoneForDb(trip.passenger_phone);
  if (!passengerPhone) {
    return { ok: false, reason: 'missing_passenger_phone', status: pushStatus };
  }

  const content = getPassengerTripPushContent(pushStatus, {
    driverName: driver?.full_name || driver?.name || null,
  });
  if (!content) {
    return { ok: false, reason: 'missing_push_content', status: pushStatus };
  }

  const pushToken = await lookupPassengerPushToken(supabase, passengerPhone);
  if (!pushToken) {
    return { ok: false, reason: 'no_push_token', status: pushStatus };
  }

  const pushResult = await sendPassengerPushNotification(pushToken, {
    title: content.title,
    body: content.body,
    channelId: content.channelId,
    data: {
      type: 'trip_status',
      screen: 'ActiveTrip',
      tripId: trip.id,
      status: tripStatus,
      pushStatus,
      trackingToken: trip.tracking_token || trip.id,
    },
  });

  if (!pushResult.ok) {
    if (STALE_TOKEN_REASONS.has(pushResult.reason)) {
      await clearStalePassengerPushToken(supabase, passengerPhone, pushResult.reason);
    }
    return { ...pushResult, status: pushStatus, tripStatus };
  }

  let nextWaContext = buildPassengerPushWaContext(trip.wa_context, pushStatus);
  if (pushStatus === 'accepted' && tripStatus === 'going_to_pickup') {
    nextWaContext = buildPassengerPushWaContext(nextWaContext, 'going_to_pickup');
  }
  const { error: updateError } = await supabase
    .from('trips')
    .update({ wa_context: nextWaContext })
    .eq('id', trip.id);

  if (updateError) {
    return {
      ok: true,
      status: pushStatus,
      tripStatus,
      messageId: pushResult.messageId,
      contextUpdateError: updateError.message,
    };
  }

  return { ok: true, status: pushStatus, tripStatus, messageId: pushResult.messageId };
}

export { isPassengerAppTrip };
