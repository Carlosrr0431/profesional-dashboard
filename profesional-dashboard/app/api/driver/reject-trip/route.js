import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { triggerDispatchWorker } from '../../../../src/lib/triggerDispatchWorker';
import { buildPendingToQueuedUpdate } from '../../../../src/lib/tripRequeue';
import {
  buildWaContextWithExcludedDriver,
  getTripDispatchExcludedDriverIds,
} from '../../../../src/lib/dispatchExclusions';

export const maxDuration = 60;

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Missing Supabase env vars');
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isRejectAlreadyApplied(tripRow, driverId) {
  const status = String(tripRow?.status || '').toLowerCase();
  if (status !== 'queued' || tripRow?.driver_id) return false;
  return getTripDispatchExcludedDriverIds(tripRow.wa_context).includes(String(driverId));
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

export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!jwt) {
      return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data: userData, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !userData?.user) {
      return NextResponse.json({ success: false, error: 'Token inválido' }, { status: 401 });
    }

    const driverId = await getDriverForUser(supabase, userData.user.id);
    if (!driverId) {
      return NextResponse.json({ success: false, error: 'Conductor no encontrado' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const tripId = String(body?.tripId || body?.trip_id || '').trim();
    const reason = String(body?.reason || 'Rechazado por chofer').trim();
    const isTimeout = reason === 'Tiempo agotado';

    if (!tripId) {
      return NextResponse.json({ success: false, error: 'tripId es requerido' }, { status: 400 });
    }

    const { data: tripRow, error: tripError } = await supabase
      .from('trips')
      .select('id, status, driver_id, wa_context, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng')
      .eq('id', tripId)
      .maybeSingle();

    if (tripError) throw tripError;

    if (!tripRow) {
      return NextResponse.json({ success: false, error: 'Viaje no encontrado' }, { status: 404 });
    }

    if (isRejectAlreadyApplied(tripRow, driverId)) {
      return NextResponse.json({ success: true, tripId: tripRow.id, idempotent: true });
    }

    if (String(tripRow.driver_id || '') !== String(driverId)) {
      return NextResponse.json({ success: false, error: 'Viaje no asignado a este chofer' }, { status: 403 });
    }

    if (tripRow.status !== 'pending') {
      return NextResponse.json({
        success: false,
        error: 'El viaje ya no está pendiente',
        unavailable: true,
      }, { status: 409 });
    }

    const wa_context = buildWaContextWithExcludedDriver(
      tripRow.wa_context,
      driverId,
      isTimeout ? 'driver_timeout' : 'driver_rejected',
    );

    const { data, error } = await supabase
      .from('trips')
      .update(buildPendingToQueuedUpdate(tripRow, {
        next_dispatch_at: new Date().toISOString(),
        wa_context,
        cancel_reason: isTimeout ? 'Tiempo agotado' : reason,
      }))
      .eq('id', tripId)
      .eq('driver_id', driverId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (error) throw error;

    if (!data?.id) {
      const { data: refreshedTrip } = await supabase
        .from('trips')
        .select('id, status, driver_id, wa_context')
        .eq('id', tripId)
        .maybeSingle();

      if (refreshedTrip && isRejectAlreadyApplied(refreshedTrip, driverId)) {
        return NextResponse.json({ success: true, tripId: refreshedTrip.id, idempotent: true });
      }

      return NextResponse.json({
        success: false,
        error: 'El viaje ya no estaba pendiente',
        unavailable: true,
      }, { status: 409 });
    }

    triggerDispatchWorker({ reason: 'driver_reject', tripId: data.id });

    return NextResponse.json({ success: true, tripId: data.id });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Error interno' },
      { status: 500 },
    );
  }
}
