import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getDirectionsResponse } from '../../../../../src/lib/geo/index.js';

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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

async function resolveTrip(supabase, token) {
  const { data: tripByToken, error: tripByTokenError } = await supabase
    .from('trips')
    .select('id, status, origin_lat, origin_lng, destination_lat, destination_lng')
    .eq('tracking_token', token)
    .maybeSingle();

  if (tripByTokenError) throw tripByTokenError;
  if (tripByToken) return tripByToken;

  if (!isUuid(token)) return null;

  const { data: tripById, error: tripByIdError } = await supabase
    .from('trips')
    .select('id, status, origin_lat, origin_lng, destination_lat, destination_lng')
    .eq('id', token)
    .maybeSingle();

  if (tripByIdError) throw tripByIdError;
  return tripById || null;
}

export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const token = resolvedParams?.token;
    if (!token) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'token is required' } },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const originLat = Number.parseFloat(searchParams.get('originLat'));
    const originLng = Number.parseFloat(searchParams.get('originLng'));

    if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'originLat and originLng are required' } },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const trip = await resolveTrip(supabase, token);
    if (!trip) {
      return NextResponse.json(
        { ok: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } },
        { status: 404 }
      );
    }

    const goingToDestination = trip.status === 'in_progress' || trip.status === 'completed';
    const destLat = Number.parseFloat(goingToDestination ? trip.destination_lat : trip.origin_lat);
    const destLng = Number.parseFloat(goingToDestination ? trip.destination_lng : trip.origin_lng);

    if (!Number.isFinite(destLat) || !Number.isFinite(destLng)) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'Trip destination coordinates missing' } },
        { status: 400 }
      );
    }

    const route = await getDirectionsResponse(
      { lat: originLat, lng: originLng },
      { lat: destLat, lng: destLng },
    );

    const durationSeconds = route.durationValue;
    const distanceMeters = route.distanceValue;

    return NextResponse.json({
      ok: true,
      data: {
        polyline: route.polyline || '',
        durationMinutes: durationSeconds != null ? Math.max(1, Math.round(durationSeconds / 60)) : null,
        durationSeconds,
        distanceMeters,
        distanceKm: distanceMeters != null ? Math.round((distanceMeters / 1000) * 10) / 10 : null,
        destination: { lat: destLat, lng: destLng },
        stage: goingToDestination ? 'destination' : 'pickup',
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: err?.code || 'SERVER_ERROR',
          message: err?.message || 'Unexpected server error',
        },
      },
      { status: 500 }
    );
  }
}
