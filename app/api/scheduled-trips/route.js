import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  cancelScheduledBooking,
  fetchScheduledTripsSnapshot,
} from '../../../src/lib/scheduledTripsSnapshot';

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
    const trips = await fetchScheduledTripsSnapshot(supabase);
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
    const data = await cancelScheduledBooking(supabase, body?.tripId);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const code = err?.code || 'SERVER_ERROR';
    const status = code === 'missing_trip_id' ? 400 : code === 'not_cancellable' ? 409 : 500;
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
