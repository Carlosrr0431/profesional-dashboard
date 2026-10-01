import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  PASSENGER_CANCELLABLE_STATUSES,
  PASSENGER_SESSION_REQUIRED_STATUSES,
  buildPassengerCancelledTripUpdate,
  isPassengerInitiatedCancellation,
} from '../../../../src/lib/passengerTripCancel';
import { validatePassengerSession } from '../../../../src/lib/passengerOtp';
import { phonesMatchTrip } from '../../../../src/lib/tripChat';

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

export async function POST(req) {
  try {
    const payload = await req.json().catch(() => null);
    const tripId = String(payload?.tripId || '').trim();
    const phone = String(payload?.phone || '').trim();
    const sessionToken = String(payload?.sessionToken || '').trim();

    if (!tripId) {
      return NextResponse.json(
        { ok: false, reason: 'missing_trip_id', message: 'Falta el identificador del viaje.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: existingRow, error: fetchError } = await supabase
      .from('trips')
      .select('id, status, cancel_reason, driver_id, passenger_phone')
      .eq('id', tripId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (!existingRow) {
      return NextResponse.json(
        { ok: false, reason: 'trip_not_found', message: 'No encontramos el viaje.' },
        { status: 404 }
      );
    }

    // El teléfono solo se usa para verificar al dueño: nunca se devuelve en la respuesta.
    const { passenger_phone: tripPassengerPhone, ...existing } = existingRow;
    const status = String(existing.status || '').toLowerCase();

    if (status === 'cancelled') {
      return NextResponse.json({ ok: true, trip: existing, alreadyCancelled: true });
    }

    // Con el viaje en curso hace falta la sesión del pasajero dueño del viaje (ver
    // PASSENGER_SESSION_REQUIRED_STATUSES). Sin ella, esos estados quedan fuera de lo cancelable,
    // también en el UPDATE, así que un cambio de estado en medio no la saltea.
    let ownsTrip = false;
    if (PASSENGER_SESSION_REQUIRED_STATUSES.includes(status) && phone && sessionToken) {
      const auth = await validatePassengerSession(phone, sessionToken);
      ownsTrip = Boolean(auth?.ok) && phonesMatchTrip(tripPassengerPhone, auth.phone);
    }
    const cancellableStatuses = ownsTrip
      ? PASSENGER_CANCELLABLE_STATUSES
      : PASSENGER_CANCELLABLE_STATUSES.filter(
        (item) => !PASSENGER_SESSION_REQUIRED_STATUSES.includes(item)
      );

    if (PASSENGER_SESSION_REQUIRED_STATUSES.includes(status) && !ownsTrip) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'forbidden',
          message: 'Para cancelar un viaje en curso tenés que iniciar sesión con tu número.',
        },
        { status: 403 }
      );
    }

    if (!cancellableStatuses.includes(status)) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'not_cancellable',
          message: 'Este viaje ya no se puede cancelar desde la app.',
        },
        { status: 409 }
      );
    }

    if (isPassengerInitiatedCancellation(existing)) {
      return NextResponse.json({ ok: true, trip: existing, alreadyCancelled: true });
    }

    const { data: trip, error: updateError } = await supabase
      .from('trips')
      .update(buildPassengerCancelledTripUpdate(existing))
      .eq('id', tripId)
      .in('status', cancellableStatuses)
      .select()
      .single();

    if (updateError) throw updateError;

    if (!trip) {
      const { data: refreshed } = await supabase
        .from('trips')
        .select('*')
        .eq('id', tripId)
        .maybeSingle();

      if (refreshed?.status === 'cancelled') {
        return NextResponse.json({ ok: true, trip: refreshed, alreadyCancelled: true });
      }

      return NextResponse.json(
        {
          ok: false,
          reason: 'not_cancellable',
          message: 'El viaje cambió de estado y ya no se puede cancelar.',
        },
        { status: 409 }
      );
    }

    await supabase.from('dispatch_queue').delete().eq('trip_id', tripId);

    return NextResponse.json({ ok: true, trip });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        reason: 'server_error',
        message: err?.message || 'No se pudo cancelar el viaje.',
      },
      { status: 500 }
    );
  }
}
