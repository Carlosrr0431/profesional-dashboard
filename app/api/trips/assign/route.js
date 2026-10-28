import { after, NextResponse } from 'next/server';
import { requireAdminUser } from '../../../../src/lib/adminAuthServer';
import { getSupabaseAdmin } from '../../../../src/lib/supabaseAdmin';
import { buildDashboardAssignNotes } from '../../../../src/lib/tripRequeue';
import { isCoordLikeAddress } from '../../../../shared/trip-contract.js';
import { formatCoordAddress, resolveGpsStreetAddress } from '../../../../src/lib/resolveGpsStreetAddress';
import {
  ASSIGN_STREET_WAIT_MS,
  saveOriginStreetLater,
  waitForStreetAddress,
} from '../../../../src/lib/assignStreetWait';
import {
  isDriverEligibleForDispatch,
  resolveDispatchBlockReason,
} from '../../../../shared/driver-billing.js';
import { selectDriversCompat } from '../../../../src/lib/driversBillingSelect';
import {
  DRIVER_BUSY_TRIP_STATUSES,
  classifyManualAssignBusyState,
  hasValidDriverGps,
  resolveAssignDriverGps,
} from '../../../../src/lib/assignExistingTrip';
import { applyLiveGpsToDriver } from '../../../../src/lib/driverMapGps';
import {
  buildNextTripOfferAssignUpdate,
  isNextTripUniqueViolation,
} from '../../../../shared/next-trip.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sanitizeText(value, maxLen = 500) {
  return String(value || '').trim().slice(0, maxLen);
}

/**
 * Asigna un viaje desde el dashboard (bypass RLS con service role).
 * El browser client autenticado no puede INSERT en trips: la RLS solo
 * permite INSERT a rol anon, no a authenticated.
 */
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

  const driverId = String(body?.driver_id || body?.driverId || '').trim();
  const destinationAddress = sanitizeText(body?.destination_address || body?.pickupAddress);
  const destinationLat = toNumberOrNull(body?.destination_lat ?? body?.pickupLat);
  const destinationLng = toNumberOrNull(body?.destination_lng ?? body?.pickupLng);

  if (!driverId) {
    return NextResponse.json({ ok: false, message: 'Falta el chofer.' }, { status: 400 });
  }
  if (!destinationAddress || destinationLat == null || destinationLng == null) {
    return NextResponse.json(
      { ok: false, message: 'Ingresá la dirección de recogida del pasajero.' },
      { status: 400 },
    );
  }

  const dropoffAddress = sanitizeText(body?.dropoff_address || body?.dropoffAddress || 'A confirmar');
  const dropoffLat = toNumberOrNull(body?.dropoff_lat ?? body?.dropoffLat);
  const dropoffLng = toNumberOrNull(body?.dropoff_lng ?? body?.dropoffLng);
  const userNotes = sanitizeText(body?.notes || body?.userNotes, 1000);

  const clientLat = toNumberOrNull(body?.origin_lat ?? body?.driverLat);
  const clientLng = toNumberOrNull(body?.origin_lng ?? body?.driverLng);
  const clientGps = clientLat != null && clientLng != null && !(clientLat === 0 && clientLng === 0)
    ? { lat: clientLat, lng: clientLng }
    : null;

  const tripNotes = buildDashboardAssignNotes({
    userNotes,
    pickupAddress: destinationAddress,
    pickupLat: destinationLat,
    pickupLng: destinationLng,
    dropoffAddress,
    dropoffLat,
    dropoffLng,
  });

  const requestedOrigin = sanitizeText(body?.origin_address);
  const knownStreet = requestedOrigin && !isCoordLikeAddress(requestedOrigin) ? requestedOrigin : '';

  const tripData = {
    driver_id: driverId,
    passenger_name: sanitizeText(body?.passenger_name || body?.passengerName || 'Pasajero', 120) || 'Pasajero',
    passenger_phone: sanitizeText(body?.passenger_phone || body?.passengerPhone, 40) || null,
    destination_address: destinationAddress,
    destination_lat: destinationLat,
    destination_lng: destinationLng,
    origin_address: knownStreet || null,
    origin_lat: null,
    origin_lng: null,
    status: 'pending',
    dispatch_status: 'waiting_acceptance',
    assigned_at: new Date().toISOString(),
    price: toNumberOrNull(body?.price),
    commission_amount: toNumberOrNull(body?.commission_amount ?? body?.commissionAmount),
    distance_km: toNumberOrNull(body?.distance_km ?? body?.distanceKm),
    duration_minutes: toNumberOrNull(body?.duration_minutes ?? body?.durationMinutes),
    notes: tripNotes,
    wa_context: { dispatch_excluded_driver_ids: [], source: 'dashboard_assign', manual_assign: true },
  };

  try {
    const supabase = getSupabaseAdmin();

    const [driverResult, locResult, busyResult] = await Promise.all([
      selectDriversCompat(
        supabase,
        'id, current_lat, current_lng, updated_at, billing_mode, commission_blocked, pending_commission, commission_debt_since_at',
        (query) => query.eq('id', driverId).maybeSingle(),
      ),
      supabase
        .from('driver_locations')
        .select('lat, lng, updated_at, recorded_at')
        .eq('driver_id', driverId)
        .limit(1),
      supabase
        .from('trips')
        .select('id, driver_id, status, next_after_trip_id, notes, wa_context')
        .eq('driver_id', driverId)
        .in('status', DRIVER_BUSY_TRIP_STATUSES),
    ]);

    const { data: driverRow, error: driverError } = driverResult;
    if (driverError) throw driverError;
    if (!driverRow) {
      return NextResponse.json({ ok: false, message: 'Chofer no encontrado.' }, { status: 404 });
    }

    if (!isDriverEligibleForDispatch(driverRow)) {
      const reason = resolveDispatchBlockReason(driverRow);
      const message = reason === 'manual'
        ? 'Este chofer tiene bloqueo manual y no puede recibir viajes.'
        : 'Este chofer tiene comisión vencida y no puede recibir viajes.';
      return NextResponse.json({ ok: false, message, code: 'DRIVER_DISPATCH_BLOCKED' }, { status: 409 });
    }

    const { data: busyTrips, error: busyError } = busyResult;
    if (busyError) throw busyError;

    const busyState = classifyManualAssignBusyState(busyTrips || []);
    if (busyState.reservedNext || busyState.hasPendingOffer) {
      return NextResponse.json(
        {
          ok: false,
          message: busyState.reservedNext
            ? 'Ese chofer ya tiene un siguiente viaje reservado.'
            : 'Ese chofer todavía está confirmando otro viaje.',
        },
        { status: 409 },
      );
    }

    if (busyState.liveTrip && !busyState.canAssignAsNext) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Ese chofer todavía va a buscar al pasajero. El siguiente viaje se ofrece cuando el pasajero ya subió.',
        },
        { status: 409 },
      );
    }

    const nextAfterTripId = busyState.canAssignAsNext ? busyState.liveTrip.id : null;
    const nextOffer = nextAfterTripId
      ? buildNextTripOfferAssignUpdate({
        driverId,
        currentTripId: nextAfterTripId,
        assignedAt: tripData.assigned_at,
      })
      : null;

    let streetPromise = null;
    let street = null;
    if (!nextOffer) {
      // El panel manda el pin de cuando se abrió el formulario; el chofer pudo moverse desde entonces.
      const loc = Array.isArray(locResult?.data) ? locResult.data[0] : null;
      const liveDriver = applyLiveGpsToDriver(driverRow, loc || null);
      const serverGps = hasValidDriverGps(liveDriver) ? resolveAssignDriverGps(liveDriver) : null;
      const driverGps = serverGps || clientGps;
      if (driverGps) {
        tripData.origin_address = (!serverGps && knownStreet) || formatCoordAddress(driverGps.lat, driverGps.lng);
        tripData.origin_lat = driverGps.lat;
        tripData.origin_lng = driverGps.lng;
        if (isCoordLikeAddress(tripData.origin_address)) {
          streetPromise = resolveGpsStreetAddress(driverGps.lat, driverGps.lng);
          street = await waitForStreetAddress(streetPromise, ASSIGN_STREET_WAIT_MS);
          if (street && !isCoordLikeAddress(street)) tripData.origin_address = street;
        }
      }
    }

    if (nextOffer) {
      tripData.origin_address = null;
      tripData.origin_lat = null;
      tripData.origin_lng = null;
      tripData.status = nextOffer.status;
      tripData.dispatch_status = nextOffer.dispatch_status;
      tripData.next_after_trip_id = nextOffer.next_after_trip_id;
      tripData.next_trip_offered_at = nextOffer.next_trip_offered_at;
      tripData.wa_context = {
        ...tripData.wa_context,
        offer_kind: 'next_trip',
      };
    }

    const { data, error } = await supabase.from('trips').insert(tripData).select().single();
    if (error) {
      if (isNextTripUniqueViolation(error)) {
        return NextResponse.json(
          { ok: false, message: 'Ese chofer ya tiene un siguiente viaje reservado.' },
          { status: 409 },
        );
      }
      console.error('[trips/assign]', error);
      return NextResponse.json(
        { ok: false, message: error.message || 'No se pudo crear el viaje.' },
        { status: 500 },
      );
    }

    if (!nextOffer && streetPromise && street == null && isCoordLikeAddress(tripData.origin_address)) {
      after(() => saveOriginStreetLater(supabase, data.id, streetPromise, tripData.origin_address)
        .catch((err) => console.error('[trips/assign] street', err)));
    }

    return NextResponse.json({ ok: true, trip: data, nextTrip: Boolean(nextAfterTripId) });
  } catch (err) {
    console.error('[trips/assign]', err);
    return NextResponse.json(
      { ok: false, message: err.message || 'Error al crear el viaje.' },
      { status: 500 },
    );
  }
}
