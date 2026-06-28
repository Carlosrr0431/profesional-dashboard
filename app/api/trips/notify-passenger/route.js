/**
 * POST /api/trips/notify-passenger
 *
 * Endpoint dedicado para enviar push FCM al pasajero cuando el chofer acepta.
 * Diseñado para ser rápido, simple y confiable — sin el overhead de Agente_IA.
 *
 * Autenticación: Bearer <driver_supabase_jwt>
 * Body: { tripId: string, force?: boolean }
 *
 * El parámetro `force` (opcional, default false) omite la deduplicación por wa_context.
 * Útil para reenviar manualmente si el push no llegó.
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

async function authenticateDriver(bearerToken) {
  if (!bearerToken) return { ok: false, reason: 'missing_token' };

  try {
    const supabase = getSupabaseAnon();
    const { data, error } = await supabase.auth.getUser(bearerToken);
    if (error || !data?.user?.id) {
      return { ok: false, reason: 'invalid_token' };
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: driver, error: driverErr } = await supabaseAdmin
      .from('drivers')
      .select('id, full_name, name')
      .eq('user_id', data.user.id)
      .maybeSingle();

    if (driverErr || !driver?.id) {
      return { ok: false, reason: 'driver_not_found' };
    }

    return { ok: true, driverId: driver.id, driverName: driver.full_name || driver.name || null };
  } catch (err) {
    return { ok: false, reason: 'auth_error', message: err?.message };
  }
}

async function fetchTrip(tripId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('trips')
    .select(
      'id, driver_id, status, passenger_name, passenger_phone, tracking_token, origin_address, origin_lat, origin_lng, destination_address, notes, wa_context'
    )
    .eq('id', tripId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function POST(req) {
  try {
    const bearerToken = extractBearerToken(req);
    const body = await req.json().catch(() => ({}));

    const tripId = String(body?.tripId || '').trim();
    const force = Boolean(body?.force);

    if (!tripId) {
      return NextResponse.json(
        { ok: false, reason: 'missing_trip_id' },
        { status: 400 }
      );
    }

    // Autenticar al chofer
    const auth = await authenticateDriver(bearerToken);
    if (!auth.ok) {
      console.warn('[notify-passenger] Auth fallida:', auth.reason, '| tripId:', tripId);
      return NextResponse.json(
        { ok: false, reason: auth.reason },
        { status: 401 }
      );
    }

    // Buscar el viaje
    const trip = await fetchTrip(tripId);
    if (!trip) {
      return NextResponse.json(
        { ok: false, reason: 'trip_not_found' },
        { status: 404 }
      );
    }

    // Verificar que el chofer es el asignado al viaje
    if (String(trip.driver_id || '') !== String(auth.driverId)) {
      console.warn('[notify-passenger] Chofer no asignado al viaje:', {
        tripId,
        tripDriverId: trip.driver_id,
        authDriverId: auth.driverId,
      });
      return NextResponse.json(
        { ok: false, reason: 'driver_mismatch' },
        { status: 403 }
      );
    }

    // Verificar que es un viaje de la app de pasajeros
    if (!isPassengerAppTrip(trip)) {
      return NextResponse.json(
        { ok: false, reason: 'not_passenger_app_trip' },
        { status: 200 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const driver = { id: auth.driverId, full_name: auth.driverName, name: auth.driverName };

    let result;

    if (force) {
      // Modo forzado: omite la deduplicación de wa_context, envía directamente
      const passengerPhone = normalizePassengerPhoneForDb(trip.passenger_phone);
      if (!passengerPhone) {
        return NextResponse.json({ ok: false, reason: 'missing_passenger_phone' });
      }

      const tripStatus = String(trip.status || '').toLowerCase();
      const pushStatus = resolvePassengerPushStatus(trip) || 'accepted';
      const content = getPassengerTripPushContent(pushStatus, { driverName: auth.driverName });

      if (!content) {
        return NextResponse.json({ ok: false, reason: 'no_push_content_for_status' });
      }

      const { data: deviceRow } = await supabaseAdmin
        .from('passenger_devices')
        .select('push_token, phone, updated_at')
        .in('phone', [
          passengerPhone,
          passengerPhone.startsWith('549') ? `54${passengerPhone.slice(3)}` : `549${passengerPhone.slice(2)}`,
        ])
        .order('updated_at', { ascending: false })
        .limit(1);

      const pushToken = deviceRow?.[0]?.push_token;
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
        tripId,
        reason: result.reason,
        status: result.status,
        tripStatus: trip.status,
      });
    } else {
      console.log('[notify-passenger] Push enviado:', {
        tripId,
        pushStatus: result.status,
        tripStatus: trip.status,
        messageId: result.messageId,
      });
    }

    return NextResponse.json({
      ok: result.ok,
      reason: result.reason || null,
      pushStatus: result.status || null,
      tripStatus: trip.status,
      messageId: result.messageId || null,
    });
  } catch (err) {
    console.error('[notify-passenger] Error interno:', err?.message || err);
    return NextResponse.json(
      { ok: false, reason: 'server_error', message: err?.message },
      { status: 500 }
    );
  }
}
