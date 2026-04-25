import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

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

export async function GET(_request, { params }) {
  try {
    const resolvedParams = await params;
    const token = resolvedParams?.token;

    if (!token) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'token is required' } },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('*')
      .eq('tracking_token', token)
      .maybeSingle();

    if (tripError) throw tripError;
    if (!trip) {
      return NextResponse.json(
        { ok: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } },
        { status: 404 }
      );
    }

    let driver = null;
    if (trip.driver_id) {
      const { data: driverData, error: driverError } = await supabase
        .from('drivers')
        .select('id, full_name, vehicle_brand, vehicle_model, vehicle_plate, vehicle_color, photo_url, current_lat, current_lng')
        .eq('id', trip.driver_id)
        .maybeSingle();
      if (driverError) throw driverError;
      driver = driverData || null;
    }

    const { data: lastTrack, error: trackError } = await supabase
      .from('trip_tracking')
      .select('lat, lng, recorded_at')
      .eq('trip_id', trip.id)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (trackError) throw trackError;

    return NextResponse.json({
      ok: true,
      data: {
        trip,
        driver,
        lastTrack: lastTrack || null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: err?.code || 'SERVER_ERROR',
          message: err?.message || 'Unexpected server error',
          details: err?.details || null,
          hint: err?.hint || null,
        },
      },
      { status: 500 }
    );
  }
}
