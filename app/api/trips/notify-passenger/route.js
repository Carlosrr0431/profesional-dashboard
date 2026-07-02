/**
 * POST /api/trips/notify-passenger
 *
 * Envía push FCM al pasajero cuando el chofer acepta o avanza en el viaje.
 *
 * Auth:
 *   1. Bearer == CRON_SECRET → llamadas server-to-server
 *   2. Bearer == cualquier JWT válido de Supabase → driver-app
 *      (no se verifica que sea el conductor asignado: el viaje ya fue
 *       aceptado en Supabase con RLS — esa es la verificación real)
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

/**
 * Verifica que el Bearer token sea válido.
 * Acepta CRON_SECRET o cualquier JWT activo de Supabase.
 * La identidad del conductor NO se verifica aquí — Supabase RLS
 * ya garantizó que solo el conductor asignado pudo aceptar el viaje.
 */
async function authenticate(bearerToken) {
  if (!bearerToken) return { ok: false, reason: 'missing_token' };

  const cronSecret = process.env.CRON_SECRET || '';
  if (cronSecret && bearerToken === cronSecret) {
    return { ok: true };
  }

  // Cualquier JWT válido de Supabase (driver-app, dashboard, etc.)
  try {
    const { data, error } = await getSupabaseAnon().auth.getUser(bearerToken);
    if (!error && data?.user?.id) return { ok: true };
  } catch (_) {}

  return { ok: false, reason: 'invalid_token' };
}

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

export async function POST(req) {
  try {
    const bearerToken = extractBearerToken(req);
    const body        = await req.json().catch(() => ({}));
    const tripId      = String(body?.tripId || '').trim();
    const force       = Boolean(body?.force);

    if (!tripId) {
      return NextResponse.json({ ok: false, reason: 'missing_trip_id' }, { status: 400 });
    }

    const auth = await authenticate(bearerToken);
    if (!auth.ok) {
      console.warn('[notify-passenger] Auth fallida:', auth.reason, '| tripId:', tripId);
      return NextResponse.json({ ok: false, reason: auth.reason }, { status: 401 });
    }

    const trip = await fetchTrip(tripId);
    if (!trip) {
      return NextResponse.json({ ok: false, reason: 'trip_not_found' }, { status: 404 });
    }

    if (!isPassengerAppTrip(trip)) {
      return NextResponse.json({ ok: false, reason: 'not_passenger_app_trip' }, { status: 200 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const driver = await fetchDriver(trip.driver_id);

    let result;

    if (force) {
      const passengerPhone = normalizePassengerPhoneForDb(trip.passenger_phone);
      if (!passengerPhone) {
        return NextResponse.json({ ok: false, reason: 'missing_passenger_phone' });
      }

      const tripStatus = String(trip.status || '').toLowerCase();
      const pushStatus = resolvePassengerPushStatus(trip) || 'accepted';
      const driverName = driver?.full_name || driver?.name || null;
      const content    = getPassengerTripPushContent(pushStatus, { driverName });

      if (!content) {
        return NextResponse.json({ ok: false, reason: 'no_push_content_for_status' });
      }

      // Todas las variantes del teléfono, incluyendo formato local sin código de país
      const rawPhone = String(trip.passenger_phone || '').replace(/\D/g, '');
      const phoneVariants = [...new Set([
        passengerPhone,
        rawPhone,
        passengerPhone.startsWith('549') ? `54${passengerPhone.slice(3)}` : `549${passengerPhone.slice(2)}`,
        passengerPhone.startsWith('549') ? passengerPhone.slice(3) : passengerPhone.slice(2),
      ].filter(Boolean))];

      // Busca token en passenger_auth_sessions primero, luego passenger_devices
      let pushToken = null;

      const { data: sessionRows } = await supabaseAdmin
        .from('passenger_auth_sessions')
        .select('push_token')
        .in('phone', phoneVariants)
        .not('push_token', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1);
      pushToken = sessionRows?.[0]?.push_token || null;

      if (!pushToken) {
        const { data: deviceRows } = await supabaseAdmin
          .from('passenger_devices')
          .select('push_token')
          .in('phone', phoneVariants)
          .order('updated_at', { ascending: false })
          .limit(1);
        pushToken = deviceRows?.[0]?.push_token || null;
      }

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
