import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getDirectionsResponse } from '../../../../../src/lib/geo/index.js';
import {
  resolveTripFinalDestCoords,
  resolveTripPickupCoords,
} from '../../../../../shared/trip-contract.js';

export const dynamic = 'force-dynamic';

const TRIP_ROUTE_FIELDS =
  'id, status, notes, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng';

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

function resolveRouteTarget(trip) {
  const goingToDestination = trip?.status === 'in_progress' || trip?.status === 'completed';
  if (goingToDestination) {
    const dropoff = resolveTripFinalDestCoords(trip);
    if (dropoff && Number.isFinite(Number(dropoff.lat)) && Number.isFinite(Number(dropoff.lng))) {
      return {
        lat: Number(dropoff.lat),
        lng: Number(dropoff.lng),
        stage: 'destination',
      };
    }
    return null;
  }

  const pickup = resolveTripPickupCoords(trip);
  if (pickup && Number.isFinite(Number(pickup.lat)) && Number.isFinite(Number(pickup.lng))) {
    return {
      lat: Number(pickup.lat),
      lng: Number(pickup.lng),
      stage: 'pickup',
    };
  }
  return null;
}

async function resolveTrip(supabase, token) {
  const { data: tripByToken, error: tripByTokenError } = await supabase
    .from('trips')
    .select(TRIP_ROUTE_FIELDS)
    .eq('tracking_token', token)
    .maybeSingle();

  if (tripByTokenError) throw tripByTokenError;
  if (tripByToken) return tripByToken;

  if (!isUuid(token)) return null;

  const { data: tripById, error: tripByIdError } = await supabase
    .from('trips')
    .select(TRIP_ROUTE_FIELDS)
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

    const target = resolveRouteTarget(trip);
    if (!target) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'Trip destination coordinates missing' } },
        { status: 400 }
      );
    }

    const route = await getDirectionsResponse(
      { lat: originLat, lng: originLng },
      { lat: target.lat, lng: target.lng },
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
        destination: { lat: target.lat, lng: target.lng },
        stage: target.stage,
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
