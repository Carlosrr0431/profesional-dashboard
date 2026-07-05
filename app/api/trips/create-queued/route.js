import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { triggerDispatchWorker } from '../../../../src/lib/triggerDispatchWorker';
import {
  resolveTripLocation,
  resolveFinalDestination,
  resolvePassengerRouteFare,
  resolveWaypointsFromClient,
  buildPassengerQueuedTripPayload,
  fareFromClientPayload,
  mergePassengerRouteFare,
} from '../../../../src/lib/passengerTripQueued';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** `after()` en triggerDispatchWorker puede esperar hasta el timeout del wake (~65s). */
export const maxDuration = 60;

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

function sanitizeText(value, maxLen = 280) {
  return String(value || '').trim().slice(0, maxLen);
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('54')) return digits;
  if (digits.startsWith('0')) return `54${digits.slice(1)}`;
  if (digits.length === 10) return `54${digits}`;
  return digits;
}

export async function POST(req) {
  try {
    const payload = await req.json().catch(() => null);
    const pickupAddress = sanitizeText(payload?.pickupAddress, 500);
    const destinationAddress = sanitizeText(
      payload?.destinationAddress || payload?.destinationHint,
      500
    );

    const pickupLocation = await resolveTripLocation({
      address: pickupAddress,
      lat: payload?.pickupLat,
      lng: payload?.pickupLng,
      placeId: payload?.placeId,
    });

    if (!pickupAddress) {
      return NextResponse.json(
        { ok: false, reason: 'missing_pickup_address', message: 'Ingresá la dirección de recogida.' },
        { status: 400 }
      );
    }

    if (!pickupLocation) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'pickup_geocode_failed',
          message: 'No se pudo ubicar la dirección en Salta Capital. Elegí una sugerencia del listado.',
        },
        { status: 422 }
      );
    }

    if (!destinationAddress) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'missing_destination',
          message: 'Elegí el destino del viaje desde las sugerencias.',
        },
        { status: 400 }
      );
    }

    const finalDestinationLocation = await resolveFinalDestination(pickupLocation, payload);

    if (!finalDestinationLocation) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'destination_geocode_failed',
          message: 'No se pudo ubicar el destino. Elegí una dirección del listado.',
        },
        { status: 422 }
      );
    }

    const resolvedWaypoints = await resolveWaypointsFromClient(payload);
    if (Array.isArray(payload?.waypoints) && payload.waypoints.length > 0 && !resolvedWaypoints) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'waypoint_geocode_failed',
          message: 'No se pudieron ubicar todas las paradas. Elegí direcciones del listado.',
        },
        { status: 422 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Cancela viajes previos (queued/pending) del mismo pasajero para evitar duplicados.
    // Solo aplica cuando viene de la passenger-app (source = passenger_app).
    const passengerPhone = normalizePhone(payload?.passengerPhone);
    if (passengerPhone && payload?.source === 'passenger_app') {
      const localDigits = passengerPhone.startsWith('549')
        ? passengerPhone.slice(3)
        : passengerPhone.startsWith('54')
          ? passengerPhone.slice(2)
          : passengerPhone;
      const phoneVariants = [...new Set([
        passengerPhone,
        passengerPhone.startsWith('549') ? `54${passengerPhone.slice(3)}` : `549${passengerPhone.slice(2)}`,
        localDigits,
      ].filter(Boolean))];

      await supabase
        .from('trips')
        .update({
          status: 'cancelled',
          cancel_reason: 'Nuevo viaje solicitado por el pasajero',
        })
        .in('passenger_phone', phoneVariants)
        .in('status', ['queued', 'pending']);
    }

    const serverFare = await resolvePassengerRouteFare(
      supabase,
      pickupLocation,
      finalDestinationLocation,
      resolvedWaypoints || []
    );
    const fare = mergePassengerRouteFare(serverFare, fareFromClientPayload(payload));

    const tripPayload = buildPassengerQueuedTripPayload({
      pickupLocation,
      finalDestinationLocation,
      passengerName: sanitizeText(payload?.passengerName, 120) || null,
      passengerPhone: normalizePhone(payload?.passengerPhone),
      notes: sanitizeText(payload?.notes, 500) || null,
      destinationHint: destinationAddress,
      fare,
      source: payload?.source,
      payload,
      waypoints: resolvedWaypoints || [],
    });

    if (
      String(tripPayload.notes || '').includes('[PASSENGER_APP]')
      && !Number.isFinite(Number(tripPayload.origin_lat))
      && !String(tripPayload.notes || '').includes('[PICKUP_JSON:')
    ) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'missing_pickup_coords',
          message: 'No se pudo guardar la dirección de recogida. Intentá de nuevo.',
        },
        { status: 500 }
      );
    }

    const { data: trip, error } = await supabase
      .from('trips')
      .insert(tripPayload)
      .select()
      .single();

    if (error) throw error;

    triggerDispatchWorker({ reason: 'dashboard_trip_created', tripId: trip.id });

    return NextResponse.json({ ok: true, trip });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        reason: 'server_error',
        message: err?.message || 'No se pudo crear el viaje.',
      },
      { status: 500 }
    );
  }
}
