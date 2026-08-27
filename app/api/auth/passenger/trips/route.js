import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validatePassengerSession } from '../../../../../src/lib/passengerOtp';
import { getPassengerPhoneVariants } from '../../../../../src/spa/shared/phone';
import { isOpenTripStatus } from '../../../../../src/spa/shared/tripStatus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HISTORY_FIELDS =
  'id, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng, notes, status, created_at, completed_at, price, distance_km, duration_minutes, driver_id, passenger_name, tracking_token, passenger_phone';

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

export async function POST(req) {
  try {
    const payload = await req.json().catch(() => null);
    const phone = String(payload?.phone || '').trim();
    const sessionToken = String(payload?.sessionToken || '').trim();

    const auth = await validatePassengerSession(phone, sessionToken);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status || 401 },
      );
    }

    const variants = getPassengerPhoneVariants(auth.phone || phone);
    if (!variants.length) {
      return NextResponse.json({ ok: true, trips: [], activeTrip: null });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('trips')
      .select(HISTORY_FIELDS)
      .in('passenger_phone', variants)
      .order('created_at', { ascending: false })
      .limit(40);

    if (error) throw error;

    const trips = data || [];
    const activeTrip = trips.find((trip) => isOpenTripStatus(trip.status)) || null;

    return NextResponse.json({
      ok: true,
      phone: auth.phone,
      name: auth.name || null,
      trips,
      activeTrip,
    });
  } catch (error) {
    console.error('[passenger/trips]', error);
    return NextResponse.json(
      { ok: false, message: 'No pudimos cargar tus viajes.' },
      { status: 500 },
    );
  }
}
