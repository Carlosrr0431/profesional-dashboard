import { after, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { triggerDispatchWorker } from '../../../../src/lib/triggerDispatchWorker';
import { canDriverReleaseTripToQueue } from '../../../../src/lib/tripRequeue';
import {
  isDriverReleaseAlreadyApplied,
  releaseTripToQueue,
} from '../../../../src/lib/driverReleaseTrip';
import { notifyPassengerDriverReleased } from '../../../../src/lib/notifyPassengerDriverReleased';

export const maxDuration = 60;

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Missing Supabase env vars');
  return createClient(url, serviceRoleKey, {
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

function schedulePassengerReleaseNotice(supabase, trip) {
  if (!trip?.id) return;
  const run = () => notifyPassengerDriverReleased(supabase, trip).catch(() => {});
  try {
    after(run);
  } catch {
    void run();
  }
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

    if (!tripId) {
      return NextResponse.json({ success: false, error: 'tripId es requerido' }, { status: 400 });
    }

    const { data: tripRow, error: tripError } = await supabase
      .from('trips')
      .select('id, status, driver_id, wa_context, notes, passenger_phone, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng, cancel_reason, started_at')
      .eq('id', tripId)
      .maybeSingle();

    if (tripError) throw tripError;

    if (!tripRow) {
      return NextResponse.json({ success: false, error: 'Viaje no encontrado' }, { status: 404 });
    }

    if (isDriverReleaseAlreadyApplied(tripRow, driverId)) {
      return NextResponse.json({ success: true, tripId: tripRow.id, idempotent: true });
    }

    if (String(tripRow.driver_id || '') !== String(driverId)) {
      return NextResponse.json({ success: false, error: 'Viaje no asignado a este chofer' }, { status: 403 });
    }

    if (!canDriverReleaseTripToQueue(tripRow)) {
      return NextResponse.json({
        success: false,
        error: 'El viaje ya no se puede devolver a la cola',
        unavailable: true,
      }, { status: 409 });
    }

    const { data, wasAssigned, releasedTrip, error, unavailable } = await releaseTripToQueue(supabase, {
      tripRow,
      driverId,
      reason,
    });

    if (error) throw error;

    if (!data?.id) {
      const { data: refreshedTrip } = await supabase
        .from('trips')
        .select('id, status, driver_id, wa_context, notes, passenger_phone, cancel_reason')
        .eq('id', tripId)
        .maybeSingle();

      if (refreshedTrip && isDriverReleaseAlreadyApplied(refreshedTrip, driverId)) {
        return NextResponse.json({ success: true, tripId: refreshedTrip.id, idempotent: true });
      }

      return NextResponse.json({
        success: false,
        error: unavailable ? 'El viaje ya no se puede devolver a la cola' : 'El viaje ya no estaba asignado a este chofer',
        unavailable: true,
      }, { status: 409 });
    }

    triggerDispatchWorker({ reason: 'driver_reject', tripId: data.id });
    if (wasAssigned) {
      schedulePassengerReleaseNotice(supabase, releasedTrip);
    }

    return NextResponse.json({
      success: true,
      tripId: data.id,
      requeued: true,
      sameTrip: true,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Error interno' },
      { status: 500 },
    );
  }
}
