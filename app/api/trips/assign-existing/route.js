import { NextResponse } from 'next/server';
import {
  isDriverEligibleForDispatch,
  resolveDispatchBlockReason,
} from '../../../../shared/driver-billing.js';
import { isPassengerAppTrip } from '../../../../shared/trip-contract.js';
import { requireAdminUser } from '../../../../src/lib/adminAuthServer';
import {
  ASSIGNABLE_EXISTING_TRIP_STATUSES,
  DRIVER_BUSY_TRIP_STATUSES,
  buildAssignExistingTripUpdate,
  canManuallyAssignExistingTrip,
  hasValidDriverGps,
} from '../../../../src/lib/assignExistingTrip';
import { selectDriversCompat } from '../../../../src/lib/driversBillingSelect';
import {
  getFirebaseMessagingClient,
  isLegacyExpoPushToken,
  isLikelyFcmToken,
  buildAndroidNotificationTag,
  normalizeFcmDataPayload,
  normalizeFirebaseSendError,
} from '../../../../src/lib/firebaseAdmin';
import { trySendPassengerAppTripPush } from '../../../../src/lib/passengerPushNotifications';
import { getSupabaseAdmin } from '../../../../src/lib/supabaseAdmin';
import { resolveDispatchPickupCoords } from '../../../../src/lib/tripRequeue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TRIP_SELECT = [
  'id',
  'status',
  'driver_id',
  'passenger_name',
  'passenger_phone',
  'origin_address',
  'origin_lat',
  'origin_lng',
  'destination_address',
  'destination_lat',
  'destination_lng',
  'notes',
  'scheduled_for',
  'dispatch_status',
  'wa_context',
].join(', ');

const DRIVER_SELECT = [
  'id',
  'full_name',
  'phone',
  'push_token',
  'current_lat',
  'current_lng',
  'is_available',
  'pending_commission',
  'commission_debt_since_at',
  'billing_mode',
  'commission_blocked',
].join(', ');

function pickupLabel(trip) {
  const coords = resolveDispatchPickupCoords(trip);
  return coords.pickupAddress
    || trip?.origin_address
    || trip?.destination_address
    || 'Retiro';
}

async function notifyAssignedDriver(driver, trip) {
  const token = String(driver?.push_token || '').trim();
  if (!token) return { ok: false, reason: 'no_push_token' };
  if (!isLikelyFcmToken(token)) {
    return {
      ok: false,
      reason: isLegacyExpoPushToken(token)
        ? 'legacy_expo_token_format'
        : 'invalid_push_token_format',
    };
  }

  try {
    const data = {
      type: 'new_trip',
      tripId: trip.id,
    };
    const collapseTag = buildAndroidNotificationTag(data);
    await getFirebaseMessagingClient().send({
      token,
      notification: {
        title: 'Nuevo viaje asignado',
        body: `${trip.passenger_name || 'Pasajero'} → ${pickupLabel(trip)}`,
      },
      data: normalizeFcmDataPayload(data),
      android: {
        priority: 'high',
        notification: {
          channelId: 'trips',
          sound: 'default',
          ...(collapseTag ? { tag: collapseTag } : {}),
        },
      },
    });
    return { ok: true };
  } catch (error) {
    const normalized = normalizeFirebaseSendError(error);
    return { ok: false, reason: normalized.reason || 'push_error' };
  }
}

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

  const tripId = String(body?.trip_id || body?.tripId || '').trim();
  const driverId = String(body?.driver_id || body?.driverId || '').trim();

  if (!tripId || !driverId) {
    return NextResponse.json(
      { ok: false, message: 'Faltan el viaje o el chofer.' },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select(TRIP_SELECT)
      .eq('id', tripId)
      .maybeSingle();

    if (tripError) throw tripError;
    if (!trip) {
      return NextResponse.json({ ok: false, message: 'Viaje no encontrado.' }, { status: 404 });
    }
    if (!canManuallyAssignExistingTrip(trip)) {
      return NextResponse.json(
        { ok: false, message: 'Este viaje ya tiene chofer o no se puede asignar desde acá.' },
        { status: 409 },
      );
    }

    const { data: driverRow, error: driverError } = await selectDriversCompat(
      supabase,
      DRIVER_SELECT,
      (query) => query.eq('id', driverId).maybeSingle(),
    );

    if (driverError) throw driverError;
    if (!driverRow) {
      return NextResponse.json({ ok: false, message: 'Chofer no encontrado.' }, { status: 404 });
    }
    if (!driverRow.is_available) {
      return NextResponse.json(
        { ok: false, message: 'Ese chofer no está libre ahora.' },
        { status: 409 },
      );
    }
    if (!isDriverEligibleForDispatch(driverRow)) {
      const reason = resolveDispatchBlockReason(driverRow);
      const message = reason === 'manual'
        ? 'Este chofer tiene bloqueo manual y no puede recibir viajes.'
        : 'Este chofer tiene comisión vencida y no puede recibir viajes.';
      return NextResponse.json({ ok: false, message, code: 'DRIVER_DISPATCH_BLOCKED' }, { status: 409 });
    }

    const { data: locRows } = await supabase
      .from('driver_locations')
      .select('lat, lng')
      .eq('driver_id', driverId)
      .limit(1);
    const loc = Array.isArray(locRows) ? locRows[0] : locRows;

    const driver = {
      ...driverRow,
      current_lat: Number(loc?.lat ?? driverRow.current_lat),
      current_lng: Number(loc?.lng ?? driverRow.current_lng),
    };

    const { data: busyTrip, error: busyError } = await supabase
      .from('trips')
      .select('id')
      .eq('driver_id', driverId)
      .in('status', DRIVER_BUSY_TRIP_STATUSES)
      .neq('id', tripId)
      .limit(1)
      .maybeSingle();

    if (busyError) throw busyError;
    if (busyTrip) {
      return NextResponse.json(
        { ok: false, message: 'Ese chofer ya tiene un viaje activo.' },
        { status: 409 },
      );
    }

    const assignUpdate = buildAssignExistingTripUpdate({
      trip,
      driver,
      assignedAt: new Date().toISOString(),
    });

    if (assignUpdate.origin_lat != null && !hasValidDriverGps(driver)) {
      return NextResponse.json(
        { ok: false, message: 'Ese chofer no tiene GPS válido.' },
        { status: 409 },
      );
    }

    const { data: assignedTrip, error: assignError } = await supabase
      .from('trips')
      .update(assignUpdate)
      .eq('id', tripId)
      .in('status', ASSIGNABLE_EXISTING_TRIP_STATUSES)
      .select(TRIP_SELECT)
      .maybeSingle();

    if (assignError) throw assignError;
    if (!assignedTrip) {
      return NextResponse.json(
        { ok: false, message: 'El viaje ya no se puede asignar (fue aceptado o cancelado).' },
        { status: 409 },
      );
    }

    const mergedTrip = { ...trip, ...assignedTrip, status: 'pending' };
    const notifyResult = await notifyAssignedDriver(driver, mergedTrip);

    if (isPassengerAppTrip(mergedTrip)) {
      try {
        await trySendPassengerAppTripPush(supabase, mergedTrip, driver);
      } catch {
        // El viaje ya quedó asignado; el push al pasajero no bloquea.
      }
    }

    return NextResponse.json({
      ok: true,
      trip: assignedTrip,
      notified: Boolean(notifyResult?.ok),
      notifyReason: notifyResult?.reason || null,
    });
  } catch (err) {
    console.error('[trips/assign-existing]', err);
    return NextResponse.json(
      { ok: false, message: err.message || 'Error al asignar el viaje.' },
      { status: 500 },
    );
  }
}
