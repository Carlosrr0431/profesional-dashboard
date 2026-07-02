/**
 * POST /api/trips/notify-passenger
 *
 * Envía push FCM al pasajero cuando el chofer acepta o avanza en el viaje.
 *
 * Auth (en orden de prioridad):
 *   1. Bearer == CRON_SECRET  → llamadas server-to-server (Agente_IA, dashboard)
 *   2. Bearer == JWT Supabase del conductor  → llamadas desde driver-app
 *
 * Body: { tripId: string, force?: boolean }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  trySendPassengerAppTripPush,
  sendPassengerPushNotification,
  getPassengerTripPushContent,
  resolvePassengerPushStatus,
} from '../../../../src/lib/passengerPushNotifications';
import { isPassengerAppTrip } from '../../../../shared/trip-contract.js';
import { normalizePassengerPhoneForDb } from '../../../../src/lib/passengerAuthPhone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// ─── Supabase helpers ────────────────────────────────────────────────────────

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurado');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getSupabaseAnon() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL o SUPABASE_ANON_KEY no configurado');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function extractBearerToken(req) {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

/**
 * Normaliza un teléfono de Supabase Auth (puede venir con +, sin prefijo, etc.)
 * a los formatos que usamos en drivers.phone_normalized.
 */
function buildDriverPhoneVariants(rawPhone) {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits || digits.length < 7) return [];

  const variants = new Set([digits]);

  if (digits.startsWith('549')) {
    variants.add(`54${digits.slice(3)}`);   // 549xxx → 54xxx
  } else if (digits.startsWith('54')) {
    variants.add(`549${digits.slice(2)}`);  // 54xxx  → 549xxx
  } else {
    variants.add(`549${digits}`);            // 387xxx → 549387xxx
    variants.add(`54${digits}`);             // 387xxx → 54387xxx
  }

  return [...variants];
}

/**
 * Autentica usando el JWT Supabase del conductor.
 * Prueba: user_id → auth_email → teléfono del usuario Auth.
 */
async function authenticateViaDriverJwt(bearerToken) {
  if (!bearerToken) return { ok: false, reason: 'missing_token' };

  try {
    const { data, error } = await getSupabaseAnon().auth.getUser(bearerToken);
    if (error || !data?.user?.id) return { ok: false, reason: 'invalid_token' };

    const userId    = data.user.id;
    const userEmail = String(data.user.email  || '').trim().toLowerCase();
    const userPhone = String(data.user.phone  || '').trim();
    const supabase  = getSupabaseAdmin();

    // 1) Por user_id
    const { data: byId } = await supabase
      .from('drivers')
      .select('id, full_name, name')
      .eq('user_id', userId)
      .maybeSingle();

    if (byId?.id) {
      return { ok: true, driverId: byId.id, driverName: byId.full_name || byId.name || null };
    }

    // 2) Por auth_email (cuentas con user_id desincronizado)
    if (userEmail) {
      const { data: byEmail } = await supabase
        .from('drivers')
        .select('id, full_name, name, user_id')
        .eq('auth_email', userEmail)
        .maybeSingle();

      if (byEmail?.id) {
        if (byEmail.user_id !== userId) {
          supabase.from('drivers').update({ user_id: userId }).eq('id', byEmail.id)
            .then(() => {}).catch(() => {});
        }
        return { ok: true, driverId: byEmail.id, driverName: byEmail.full_name || byEmail.name || null };
      }
    }

    // 3) Por teléfono (conductores que inician sesión con OTP de teléfono)
    if (userPhone) {
      const variants = buildDriverPhoneVariants(userPhone);
      if (variants.length) {
        const { data: byPhone } = await supabase
          .from('drivers')
          .select('id, full_name, name, user_id')
          .in('phone_normalized', variants)
          .maybeSingle();

        if (byPhone?.id) {
          if (byPhone.user_id !== userId) {
            supabase.from('drivers').update({ user_id: userId }).eq('id', byPhone.id)
              .then(() => {}).catch(() => {});
          }
          console.log('[notify-passenger] Auth via phone fallback:', {
            userId, driverId: byPhone.id,
          });
          return { ok: true, driverId: byPhone.id, driverName: byPhone.full_name || byPhone.name || null };
        }
      }
    }

    return { ok: false, reason: 'driver_not_found' };
  } catch (err) {
    return { ok: false, reason: 'auth_error', message: err?.message };
  }
}

/**
 * Decide quién llama al endpoint y devuelve { ok, driverId?, driverName?, serverSide }.
 *
 * - CRON_SECRET → serverSide: true, sin driverId (se resuelve desde el trip)
 * - JWT conductor → driverId del conductor autenticado
 */
async function authenticate(bearerToken) {
  if (!bearerToken) {
    return { ok: false, reason: 'missing_token' };
  }

  // Auth server-to-server: CRON_SECRET
  const cronSecret = process.env.CRON_SECRET || '';
  if (cronSecret && bearerToken === cronSecret) {
    return { ok: true, serverSide: true, driverId: null, driverName: null };
  }

  // Auth conductor: JWT Supabase
  const driverAuth = await authenticateViaDriverJwt(bearerToken);
  if (driverAuth.ok) {
    return { ...driverAuth, serverSide: false };
  }

  return { ok: false, reason: driverAuth.reason };
}

// ─── Trip ────────────────────────────────────────────────────────────────────

async function fetchTrip(tripId) {
  const { data, error } = await getSupabaseAdmin()
    .from('trips')
    .select(
      'id, driver_id, status, passenger_name, passenger_phone, tracking_token, ' +
      'origin_address, origin_lat, origin_lng, destination_address, notes, wa_context'
    )
    .eq('id', tripId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function fetchDriver(driverId) {
  if (!driverId) return null;
  const { data } = await getSupabaseAdmin()
    .from('drivers')
    .select('id, full_name, name')
    .eq('id', driverId)
    .maybeSingle();
  return data || null;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req) {
  try {
    const bearerToken = extractBearerToken(req);
    const body        = await req.json().catch(() => ({}));
    const tripId      = String(body?.tripId || '').trim();
    const force       = Boolean(body?.force);

    if (!tripId) {
      return NextResponse.json({ ok: false, reason: 'missing_trip_id' }, { status: 400 });
    }

    // Autenticar
    const auth = await authenticate(bearerToken);
    if (!auth.ok) {
      console.warn('[notify-passenger] Auth fallida:', auth.reason, '| tripId:', tripId);
      return NextResponse.json({ ok: false, reason: auth.reason }, { status: 401 });
    }

    // Buscar el viaje
    const trip = await fetchTrip(tripId);
    if (!trip) {
      return NextResponse.json({ ok: false, reason: 'trip_not_found' }, { status: 404 });
    }

    // Verificar que el conductor autenticado sea el asignado
    // (solo en llamadas desde driver-app; serverSide confía en el tripId)
    if (!auth.serverSide) {
      if (String(trip.driver_id || '') !== String(auth.driverId)) {
        console.warn('[notify-passenger] Chofer no asignado al viaje:', {
          tripId, tripDriverId: trip.driver_id, authDriverId: auth.driverId,
        });
        return NextResponse.json({ ok: false, reason: 'driver_mismatch' }, { status: 403 });
      }
    }

    // Solo aplica a viajes de la passenger-app
    if (!isPassengerAppTrip(trip)) {
      return NextResponse.json({ ok: false, reason: 'not_passenger_app_trip' }, { status: 200 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Resolver el conductor (para el nombre en la notificación)
    const driverId   = auth.driverId || trip.driver_id || null;
    const driverName = auth.driverName || null;
    const driver     = driverId
      ? (await fetchDriver(driverId)) || { id: driverId, full_name: driverName, name: driverName }
      : { id: null, full_name: null, name: null };

    let result;

    if (force) {
      // Modo forzado: omite deduplicación de wa_context
      const passengerPhone = normalizePassengerPhoneForDb(trip.passenger_phone);
      if (!passengerPhone) {
        return NextResponse.json({ ok: false, reason: 'missing_passenger_phone' });
      }

      const tripStatus = String(trip.status || '').toLowerCase();
      const pushStatus = resolvePassengerPushStatus(trip) || 'accepted';
      const content    = getPassengerTripPushContent(pushStatus, { driverName: driver.full_name || driver.name });

      if (!content) {
        return NextResponse.json({ ok: false, reason: 'no_push_content_for_status' });
      }

      const altPhone = passengerPhone.startsWith('549')
        ? `54${passengerPhone.slice(3)}`
        : `549${passengerPhone.slice(2)}`;

      const { data: deviceRow } = await supabaseAdmin
        .from('passenger_auth_sessions')
        .select('push_token, phone, updated_at')
        .in('phone', [passengerPhone, altPhone])
        .order('updated_at', { ascending: false })
        .limit(1);

      const pushToken = deviceRow?.[0]?.push_token
        // fallback tabla legacy
        || await supabaseAdmin
          .from('passenger_devices')
          .select('push_token')
          .in('phone', [passengerPhone, altPhone])
          .order('updated_at', { ascending: false })
          .limit(1)
          .then(({ data }) => data?.[0]?.push_token || null);

      if (!pushToken) {
        console.warn('[notify-passenger] Force mode: token no encontrado para', passengerPhone);
        return NextResponse.json({ ok: false, reason: 'no_push_token', phone: passengerPhone });
      }

      result = await sendPassengerPushNotification(pushToken, {
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

      console.log('[notify-passenger] Force push result:', result);
    } else {
      result = await trySendPassengerAppTripPush(supabaseAdmin, trip, driver);
    }

    if (!result.ok) {
      console.warn('[notify-passenger] Push falló:', {
        tripId, reason: result.reason, tripStatus: trip.status,
      });
    } else {
      console.log('[notify-passenger] Push enviado:', {
        tripId, pushStatus: result.status, tripStatus: trip.status, messageId: result.messageId,
      });
    }

    return NextResponse.json({
      ok:         result.ok,
      reason:     result.reason    || null,
      pushStatus: result.status    || null,
      tripStatus: trip.status,
      messageId:  result.messageId || null,
    });
  } catch (err) {
    console.error('[notify-passenger] Error interno:', err?.message || err);
    return NextResponse.json(
      { ok: false, reason: 'server_error', message: err?.message },
      { status: 500 }
    );
  }
}
