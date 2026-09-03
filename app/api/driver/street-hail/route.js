import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../src/lib/supabaseAdmin';
import { selectDriversCompat } from '../../../../src/lib/driversBillingSelect';
import { isDriverEligibleForDispatch } from '../../../../shared/driver-billing.js';
import { buildStreetHailTripInsert } from '../../../../shared/trip-contract.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sanitizeText(value, maxLen = 500) {
  return String(value || '').trim().slice(0, maxLen);
}

async function getDriverForUser(supabase, userId) {
  const { data, error } = await selectDriversCompat(
    supabase,
    'id, billing_mode, commission_blocked, pending_commission, commission_debt_since_at',
    (query) => query.eq('user_id', userId).maybeSingle(),
  );
  if (error) throw error;
  return data || null;
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

    const driver = await getDriverForUser(supabase, userData.user.id);
    if (!driver?.id) {
      return NextResponse.json({ success: false, error: 'Conductor no encontrado' }, { status: 403 });
    }

    if (!isDriverEligibleForDispatch(driver)) {
      return NextResponse.json(
        { success: false, error: 'driver_blocked', message: 'Tu cuenta no puede tomar viajes ahora.' },
        { status: 409 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const originLat = toNumberOrNull(body?.origin_lat ?? body?.lat);
    const originLng = toNumberOrNull(body?.origin_lng ?? body?.lng);
    const originAddress = sanitizeText(body?.origin_address || body?.originAddress, 500);

    if (originLat == null || originLng == null || (originLat === 0 && originLng === 0)) {
      return NextResponse.json(
        { success: false, error: 'origin_required', message: 'No hay ubicación GPS.' },
        { status: 400 },
      );
    }

    const { data: liveTrip } = await supabase
      .from('trips')
      .select('id, status')
      .eq('driver_id', driver.id)
      .in('status', ['pending', 'accepted', 'going_to_pickup', 'in_progress'])
      .limit(1)
      .maybeSingle();

    if (liveTrip?.id) {
      return NextResponse.json(
        {
          success: false,
          error: 'driver_busy',
          message: 'Ya tenés un viaje activo.',
          trip_id: liveTrip.id,
        },
        { status: 409 },
      );
    }

    const tripPayload = buildStreetHailTripInsert({
      driverId: driver.id,
      originAddress,
      originLat,
      originLng,
    });

    const { data, error } = await supabase.from('trips').insert(tripPayload).select().single();
    if (error) {
      console.error('[driver/street-hail]', error);
      return NextResponse.json(
        { success: false, error: error.message || 'No se pudo crear el viaje.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, trip: data });
  } catch (err) {
    console.error('[driver/street-hail]', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Error interno' },
      { status: 500 },
    );
  }
}
