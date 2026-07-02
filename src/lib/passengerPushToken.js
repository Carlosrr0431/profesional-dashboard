import { getSupabaseAdmin } from './passengerOtp';
import { normalizePassengerPhoneForDb } from './passengerAuthPhone';
import { isPassengerAppTrip, trySendPassengerAppTripPush } from './passengerPushNotifications';

const ACTIVE_TRIP_STATUSES = ['pending', 'going_to_pickup', 'in_progress'];

function buildPassengerPhoneVariants(phone) {
  const raw = String(phone || '').replace(/\D/g, '');
  const canonical = normalizePassengerPhoneForDb(phone);
  if (!canonical && !raw) return [];

  const variants = new Set([canonical, raw].filter(Boolean));

  if (canonical.startsWith('54') && !canonical.startsWith('549')) {
    variants.add(`549${canonical.slice(2)}`); // 543878... → 5493878...
    variants.add(canonical.slice(2));          // 543878... → 3878... (local sin país)
  }
  if (canonical.startsWith('549')) {
    variants.add(`54${canonical.slice(3)}`);  // 5493878... → 543878...
    variants.add(canonical.slice(3));          // 5493878... → 3878... (local sin país)
  }

  return [...variants].filter(Boolean);
}

/**
 * Guarda el token FCM del pasajero en passenger_auth_sessions (fuente principal)
 * y en passenger_devices (tabla legacy, como fallback).
 */
export async function upsertPassengerPushToken(phone, pushToken) {
  const token = String(pushToken || '').trim();
  if (!token) {
    return { ok: false, reason: 'missing_push_token' };
  }

  const canonical = normalizePassengerPhoneForDb(phone);
  const variants  = buildPassengerPhoneVariants(phone);
  if (!variants.length) {
    return { ok: false, reason: 'invalid_phone' };
  }

  const now     = new Date().toISOString();
  const supabase = getSupabaseAdmin();

  // 1) Actualizar push_token en passenger_auth_sessions (por cada variante de phone)
  //    Solo actualiza filas existentes — si no existe sesión aún, no pasa nada.
  const sessionUpdates = variants.map((variantPhone) =>
    supabase
      .from('passenger_auth_sessions')
      .update({ push_token: token, updated_at: now })
      .eq('phone', variantPhone)
  );
  await Promise.allSettled(sessionUpdates);

  // 2) Upsert en passenger_devices (fuente legacy, mantiene compatibilidad)
  const deviceRows = variants.map((variantPhone) => ({
    phone: variantPhone,
    push_token: token,
    updated_at: now,
  }));

  const { error } = await supabase
    .from('passenger_devices')
    .upsert(deviceRows, { onConflict: 'phone' });

  if (error) {
    return { ok: false, reason: 'db_error', message: error.message || 'upsert_failed' };
  }

  return { ok: true, phone: canonical, variants };
}

async function getDriverById(supabase, driverId) {
  if (!driverId) return null;
  const { data, error } = await supabase
    .from('drivers')
    .select('id, full_name, name')
    .eq('id', driverId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/**
 * Tras registrar token, intenta enviar pushes de viajes activos que aún no se notificaron.
 */
export async function syncPassengerTripPushesForPhone(phone) {
  const variants = buildPassengerPhoneVariants(phone);
  if (!variants.length) {
    return { ok: false, reason: 'invalid_phone', sent: 0 };
  }

  const supabase = getSupabaseAdmin();
  const { data: trips, error } = await supabase
    .from('trips')
    .select('id, status, passenger_phone, notes, wa_context, tracking_token, driver_id')
    .in('passenger_phone', variants)
    .in('status', ACTIVE_TRIP_STATUSES)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    return { ok: false, reason: 'db_error', message: error.message, sent: 0 };
  }

  let sent = 0;
  const results = [];

  for (const trip of trips || []) {
    if (!isPassengerAppTrip(trip)) continue;

    const driver = await getDriverById(supabase, trip.driver_id);
    const pushResult = await trySendPassengerAppTripPush(supabase, trip, driver);
    results.push({ tripId: trip.id, ...pushResult });
    if (pushResult?.ok) sent += 1;
  }

  return { ok: true, sent, results };
}
