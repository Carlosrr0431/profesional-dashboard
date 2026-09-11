import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validatePassengerSession } from '../../../../src/lib/passengerOtp';
import { phonesMatchTrip } from '../../../../src/lib/tripChat';
import {
  assertCanSubmitDriverRating,
  buildDriverRatingInsert,
  isUniqueViolation,
  parseStars,
  summarizeDriverRating,
} from '../../../../src/lib/driverRating';

export const runtime = 'nodejs';
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

async function authorizePassengerTrip(tripId, phone, sessionToken) {
  const auth = await validatePassengerSession(phone, sessionToken);
  if (!auth.ok) {
    return {
      ok: false,
      status: auth.status || 401,
      message: auth.message || 'Sesión inválida.',
      reason: 'unauthorized',
    };
  }

  const supabase = getSupabaseAdmin();
  const { data: trip, error } = await supabase
    .from('trips')
    .select('id, status, passenger_phone, driver_id, passenger_rating')
    .eq('id', tripId)
    .maybeSingle();

  if (error) throw error;
  if (!trip) {
    return { ok: false, status: 404, message: 'No encontramos el viaje.', reason: 'trip_not_found' };
  }

  if (!phonesMatchTrip(trip.passenger_phone, auth.phone)) {
    return { ok: false, status: 403, message: 'No tenés acceso a este viaje.', reason: 'forbidden' };
  }

  return { ok: true, supabase, trip, phone: auth.phone };
}

async function loadDriverSummary(supabase, driverId) {
  if (!driverId) return null;
  const { data } = await supabase
    .from('drivers')
    .select('id, rating, rating_count, rating_star_1, rating_star_2, rating_star_3, rating_star_4, rating_star_5')
    .eq('id', driverId)
    .maybeSingle();
  return data ? summarizeDriverRating(data) : null;
}

function jsonError(payload, status) {
  return NextResponse.json({ ok: false, ...payload }, { status });
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const tripId = String(url.searchParams.get('tripId') || '').trim();
    const phone = String(url.searchParams.get('phone') || '').trim();
    const sessionToken = String(url.searchParams.get('sessionToken') || '').trim();

    if (!tripId) {
      return jsonError({ reason: 'missing_trip_id', message: 'Falta el identificador del viaje.' }, 400);
    }

    const access = await authorizePassengerTrip(tripId, phone, sessionToken);
    if (!access.ok) {
      return jsonError({ reason: access.reason, message: access.message }, access.status);
    }

    const existingStars = parseStars(access.trip.passenger_rating);
    return NextResponse.json({
      ok: true,
      alreadyRated: Boolean(existingStars),
      stars: existingStars,
      driver: await loadDriverSummary(access.supabase, access.trip.driver_id),
    });
  } catch (err) {
    return jsonError(
      { reason: 'server_error', message: err?.message || 'No se pudo leer la calificación.' },
      500
    );
  }
}

export async function POST(req) {
  try {
    const payload = await req.json().catch(() => null);
    const tripId = String(payload?.tripId || '').trim();
    const phone = String(payload?.phone || '').trim();
    const sessionToken = String(payload?.sessionToken || '').trim();

    if (!tripId) {
      return jsonError({ reason: 'missing_trip_id', message: 'Falta el identificador del viaje.' }, 400);
    }

    const access = await authorizePassengerTrip(tripId, phone, sessionToken);
    if (!access.ok) {
      return jsonError({ reason: access.reason, message: access.message }, access.status);
    }

    const existingStars = parseStars(access.trip.passenger_rating);
    if (existingStars) {
      return NextResponse.json({
        ok: true,
        alreadyRated: true,
        stars: existingStars,
        driver: await loadDriverSummary(access.supabase, access.trip.driver_id),
      });
    }

    const check = assertCanSubmitDriverRating({ trip: access.trip, stars: payload?.stars });
    if (!check.ok) {
      return jsonError({ reason: check.reason, message: check.message }, check.status);
    }

    const insert = buildDriverRatingInsert({
      trip: access.trip,
      phone: access.phone,
      stars: check.stars,
      comment: payload?.comment,
    });

    const { data: rating, error } = await access.supabase
      .from('driver_ratings')
      .insert(insert)
      .select('id, trip_id, driver_id, stars, created_at')
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        const { data: existing } = await access.supabase
          .from('driver_ratings')
          .select('stars')
          .eq('trip_id', tripId)
          .maybeSingle();
        return NextResponse.json({
          ok: true,
          alreadyRated: true,
          stars: parseStars(existing?.stars),
          driver: await loadDriverSummary(access.supabase, access.trip.driver_id),
        });
      }
      throw error;
    }

    return NextResponse.json({
      ok: true,
      alreadyRated: false,
      stars: rating.stars,
      rating,
      driver: await loadDriverSummary(access.supabase, access.trip.driver_id),
    });
  } catch (err) {
    return jsonError(
      { reason: 'server_error', message: err?.message || 'No se pudo guardar la calificación.' },
      500
    );
  }
}
