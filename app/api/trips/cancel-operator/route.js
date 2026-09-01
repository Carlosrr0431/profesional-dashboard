import { NextResponse } from 'next/server';
import { requireAdminUser } from '../../../../src/lib/adminAuthServer';
import { cancelTripAsOperator } from '../../../../src/lib/cancelTripAsOperator';
import { notifyOperatorCancelledTrip } from '../../../../src/lib/notifyOperatorCancelledTrip';
import { getSupabaseAdmin } from '../../../../src/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function statusForCode(code) {
  if (code === 'missing_trip_id') return 400;
  if (code === 'trip_not_found') return 404;
  if (code === 'not_cancellable') return 409;
  return 500;
}

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json(
      { ok: false, message: auth.error || 'No autorizado' },
      { status: auth.status || 401 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'JSON inválido' }, { status: 400 });
  }

  const tripId = String(body?.trip_id || body?.tripId || '').trim();
  if (!tripId) {
    return NextResponse.json(
      { ok: false, message: 'Falta el viaje a cancelar.' },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const result = await cancelTripAsOperator(supabase, tripId);

    if (!result.alreadyCancelled) {
      try {
        await notifyOperatorCancelledTrip(supabase, result.trip);
      } catch (notifyError) {
        console.error('[trips/cancel-operator] notify', notifyError);
      }
    }

    return NextResponse.json({
      ok: true,
      trip: result.trip,
      alreadyCancelled: Boolean(result.alreadyCancelled),
    });
  } catch (err) {
    const code = err?.code || 'SERVER_ERROR';
    return NextResponse.json(
      { ok: false, message: err?.message || 'No se pudo cancelar el viaje.' },
      { status: statusForCode(code) },
    );
  }
}
