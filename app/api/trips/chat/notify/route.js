/**
 * POST /api/trips/chat/notify
 *
 * Notifica por FCM al receptor de un mensaje del chat del viaje.
 * Usado por driver-app tras insertar el mensaje en Supabase.
 *
 * Auth: Bearer JWT de Supabase (conductor asignado al viaje).
 * Body: { tripId, messageId?, messageType?, body?, senderRole? }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyTripChatRecipient } from '../../../../../src/lib/tripChatPush';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getDriverForUser(supabase, userId) {
  const { data, error } = await supabase
    .from('drivers')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

export async function POST(req) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!jwt) {
      return NextResponse.json({ ok: false, reason: 'unauthorized', message: 'No autenticado.' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data: userData, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !userData?.user) {
      return NextResponse.json({ ok: false, reason: 'unauthorized', message: 'Token inválido.' }, { status: 401 });
    }

    const driverId = await getDriverForUser(supabase, userData.user.id);
    if (!driverId) {
      return NextResponse.json({ ok: false, reason: 'forbidden', message: 'Conductor no encontrado.' }, { status: 403 });
    }

    const payload = await req.json().catch(() => ({}));
    const tripId = String(payload?.tripId || payload?.trip_id || '').trim();
    const messageId = String(payload?.messageId || payload?.message_id || '').trim() || null;
    const messageType = String(payload?.messageType || payload?.message_type || 'text').trim();
    const body = payload?.body;
    const senderRole = String(payload?.senderRole || 'driver').trim().toLowerCase();

    if (!tripId) {
      return NextResponse.json(
        { ok: false, reason: 'missing_params', message: 'Falta tripId.' },
        { status: 400 }
      );
    }

    if (senderRole !== 'driver') {
      return NextResponse.json(
        { ok: false, reason: 'invalid_sender_role', message: 'Solo el conductor usa este endpoint.' },
        { status: 400 }
      );
    }

    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('id, driver_id, status')
      .eq('id', tripId)
      .maybeSingle();

    if (tripError) throw tripError;
    if (!trip) {
      return NextResponse.json({ ok: false, reason: 'trip_not_found', message: 'Viaje no encontrado.' }, { status: 404 });
    }

    if (String(trip.driver_id || '') !== String(driverId)) {
      return NextResponse.json(
        { ok: false, reason: 'forbidden', message: 'Este viaje no está asignado a tu cuenta.' },
        { status: 403 }
      );
    }

    const result = await notifyTripChatRecipient(supabase, {
      tripId,
      senderRole: 'driver',
      messageType,
      body,
      messageId,
    });

    // No fallar el flujo del chat si no hay token: el mensaje ya se guardó.
    return NextResponse.json({
      ok: true,
      push: result,
    });
  } catch (err) {
    console.error('[trips/chat/notify]', err);
    return NextResponse.json(
      { ok: false, reason: 'server_error', message: err?.message || 'No se pudo notificar.' },
      { status: 500 }
    );
  }
}
