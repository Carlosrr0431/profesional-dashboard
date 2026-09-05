import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cancelTripAsOperator } from '../../../src/lib/cancelTripAsOperator';
import { notifyOperatorCancelledTrip } from '../../../src/lib/notifyOperatorCancelledTrip';
import { fetchScheduledTripsSnapshot } from '../../../src/lib/scheduledTripsSnapshot';
import {
  DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS,
  isScheduledTripDue,
  promoteDueScheduledTrips,
} from '../../../src/lib/promoteDueScheduledTrips';
import { triggerDispatchWorker } from '../../../src/lib/triggerDispatchWorker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
};

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    let trips = await fetchScheduledTripsSnapshot(supabase);
    const nowMs = Date.now();
    const due = trips.some((trip) => isScheduledTripDue(trip, nowMs, DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS));
    if (due) {
      const result = await promoteDueScheduledTrips({ supabase, nowMs });
      if (result.promoted > 0) {
        triggerDispatchWorker({ reason: 'scheduled_monitor_due' });
        trips = await fetchScheduledTripsSnapshot(supabase);
      }
    }
    return NextResponse.json({ ok: true, data: { trips } }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: err?.code || 'SERVER_ERROR',
          message: err?.message || 'No se pudieron leer los viajes programados',
        },
      },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);
    const action = String(body?.action || 'cancel').trim().toLowerCase();
    if (action !== 'cancel') {
      return NextResponse.json(
        { ok: false, error: { code: 'unsupported_action', message: 'Acción no soportada.' } },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const result = await cancelTripAsOperator(supabase, body?.tripId);
    if (!result.alreadyCancelled) {
      try {
        await notifyOperatorCancelledTrip(supabase, result.trip);
      } catch (notifyError) {
        console.error('[scheduled-trips] notify', notifyError);
      }
    }
    return NextResponse.json({ ok: true, data: { id: result.trip.id } });
  } catch (err) {
    const code = err?.code || 'SERVER_ERROR';
    const status = code === 'missing_trip_id' ? 400
      : code === 'trip_not_found' ? 404
      : code === 'not_cancellable' ? 409
      : 500;
    return NextResponse.json(
      {
        ok: false,
        error: {
          code,
          message: err?.message || 'No se pudo cancelar el viaje programado',
        },
      },
      { status },
    );
  }
}
