import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { triggerDispatchWorker } from '../../../../src/lib/triggerDispatchWorker';
import { DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS } from '../../../../src/lib/promoteDueScheduledTrips';
import { isPassengerChannelSource } from '../../../../src/lib/detectTripSource';
import {
  resolveTripLocation,
  resolveFinalDestination,
  resolvePassengerRouteFare,
  resolveWaypointsFromClient,
  buildPassengerQueuedTripPayload,
  fareFromClientPayload,
  mergePassengerRouteFare,
  resolveQueuedTripSource,
  hasFiniteLatLng,
} from '../../../../src/lib/passengerTripQueued';
import { mergePreferredDriverWaContext } from '../../../../src/lib/assignExistingTrip';

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
    const source = resolveQueuedTripSource(payload?.source);
    const destLat = payload?.destinationLat ?? payload?.destLat;
    const destLng = payload?.destinationLng ?? payload?.destLng;
    const normalizedPayload = payload
      ? { ...payload, source, destinationLat: destLat, destinationLng: destLng }
      : payload;
    const wantsDestination = Boolean(
      destinationAddress || hasFiniteLatLng(destLat, destLng)
    );

    const pickupLocation = await resolveTripLocation({
      address: pickupAddress,
      lat: payload?.pickupLat,
      lng: payload?.pickupLng,
      placeId: payload?.placeId,
    });

    if (!pickupAddress) {
      return NextResponse.json(
        { ok: false, reason: 'missing_pickup_address', message: 'Ingresá la dirección de origen.' },
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

    if (isPassengerChannelSource(source) && !wantsDestination) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'missing_destination',
          message: 'Elegí el destino del viaje desde las sugerencias.',
        },
        { status: 400 }
      );
    }

    const finalDestinationLocation = wantsDestination
      ? await resolveFinalDestination(pickupLocation, normalizedPayload)
      : null;

    if (wantsDestination && !finalDestinationLocation) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'destination_geocode_failed',
          message: 'No se pudo ubicar el destino. Elegí una dirección del listado.',
        },
        { status: 422 }
      );
    }

    const resolvedWaypoints = await resolveWaypointsFromClient(normalizedPayload);
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
    // Solo aplica a viajes inmediatos de la passenger-app (no a reservas programadas).
    const passengerPhone = normalizePhone(payload?.passengerPhone);
    const scheduledForRaw = payload?.scheduledFor || payload?.scheduled_for || null;
    const scheduledForDate = scheduledForRaw ? new Date(scheduledForRaw) : null;
    const isScheduled = scheduledForDate instanceof Date
      && Number.isFinite(scheduledForDate.getTime())
      && scheduledForDate.getTime() > Date.now() + 60_000;
    const scheduledDisplay = sanitizeText(payload?.scheduledDisplay || payload?.scheduled_display, 120) || null;

    if (passengerPhone && isPassengerChannelSource(source) && !isScheduled) {
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
      resolvedWaypoints || [],
      {
        source,
        at: isScheduled ? scheduledForDate : new Date(),
      },
    );
    const fare = mergePassengerRouteFare(serverFare, fareFromClientPayload(normalizedPayload));

    const tripPayload = buildPassengerQueuedTripPayload({
      pickupLocation,
      finalDestinationLocation,
      passengerName: sanitizeText(payload?.passengerName, 120) || null,
      passengerPhone: normalizePhone(payload?.passengerPhone),
      notes: sanitizeText(payload?.notes, 500) || null,
      destinationHint: destinationAddress || null,
      fare,
      source,
      payload: normalizedPayload,
      waypoints: resolvedWaypoints || [],
      scheduledFor: isScheduled ? scheduledForDate : null,
      scheduledDisplay: isScheduled ? scheduledDisplay : null,
    });

    const preferredDriverId = source === 'dashboard'
      ? sanitizeText(payload?.preferredDriverId || payload?.driverId, 80)
      : '';
    if (preferredDriverId) {
      tripPayload.wa_context = mergePreferredDriverWaContext(
        tripPayload.wa_context,
        preferredDriverId,
      );
    }

    if (
      String(tripPayload.notes || '').includes('[PASSENGER_APP]')
      && !Number.isFinite(Number(tripPayload.origin_lat))
      && !String(tripPayload.notes || '').includes('[PICKUP_JSON:')
    ) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'missing_pickup_coords',
          message: 'No se pudo guardar la dirección de origen. Intentá de nuevo.',
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

    // Inmediatos: despacho ya. Programados dentro de la ventana de 20 min: el worker
    // los promueve a cola en este mismo ciclo. El resto espera al cron.
    // Si el operador eligió un móvil, no disparamos nearest: el cliente lo asigna
    // con assign-existing. En programados el worker prefiere ese chofer al vencer.
    const dueForDispatch = isScheduled
      && scheduledForDate.getTime() <= Date.now() + DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS;
    const skipNearestDispatch = Boolean(preferredDriverId) && !isScheduled;
    if ((!isScheduled || dueForDispatch) && !skipNearestDispatch) {
      triggerDispatchWorker({
        reason: isScheduled ? 'scheduled_trip_due' : 'dashboard_trip_created',
        tripId: trip.id,
      });
    }

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
