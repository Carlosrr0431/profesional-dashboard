import {
  buildPendingToQueuedUpdate,
  canDriverReleaseTripToQueue,
  canRecoverCancelledDriverReleaseToQueue,
  isAssignedDriverReleaseStatus,
  DRIVER_RELEASE_REASON,
} from './tripRequeue';
import {
  buildWaContextWithExcludedDriver,
  getTripDispatchExcludedDriverIds,
} from './dispatchExclusions';
import { clearPassengerAssignmentPushStatuses } from './passengerPushNotifications';

export function isDriverReleaseAlreadyApplied(tripRow, driverId) {
  const status = String(tripRow?.status || '').toLowerCase();
  if (status !== 'queued' || tripRow?.driver_id) return false;
  return getTripDispatchExcludedDriverIds(tripRow.wa_context).includes(String(driverId));
}

export function buildDriverReleaseQueuedExtras(trip, {
  driverId,
  reason,
  now = new Date(),
} = {}) {
  const previousStatus = String(trip?.status || '').toLowerCase();
  const isTimeout = String(reason || '') === 'Tiempo agotado';
  const wasAssigned = isAssignedDriverReleaseStatus(previousStatus)
    || previousStatus === 'cancelled';
  const cancelReason = isTimeout
    ? 'Tiempo agotado'
    : (String(reason || '').trim() || 'Rechazado por chofer');

  let wa_context = buildWaContextWithExcludedDriver(
    trip?.wa_context,
    driverId,
    isTimeout ? 'driver_timeout' : 'driver_rejected',
  );

  if (wasAssigned) {
    wa_context = clearPassengerAssignmentPushStatuses(wa_context);
  }

  const extras = {
    next_dispatch_at: now.toISOString(),
    wa_context,
    cancel_reason: cancelReason,
  };

  if (wasAssigned) {
    extras.started_at = null;
    extras.pickup_at = null;
    extras.wa_notified_at = null;
  }

  return { extras, wasAssigned, previousStatus };
}

/**
 * Devuelve el mismo viaje a queued, excluye al chofer y deja el id intacto.
 * No clona filas. El caller dispara el dispatch worker.
 */
export async function releaseTripToQueue(supabase, {
  tripRow,
  driverId,
  reason,
} = {}) {
  if (!supabase || !tripRow?.id || !driverId) {
    return { data: null, wasAssigned: false, error: new Error('invalid_params') };
  }

  if (!canDriverReleaseTripToQueue(tripRow)) {
    return { data: null, wasAssigned: false, unavailable: true };
  }

  const { extras, wasAssigned, previousStatus } = buildDriverReleaseQueuedExtras(tripRow, {
    driverId,
    reason,
  });

  const { data, error } = await supabase
    .from('trips')
    .update(buildPendingToQueuedUpdate(tripRow, extras))
    .eq('id', tripRow.id)
    .eq('driver_id', driverId)
    .eq('status', previousStatus)
    .select('id, notes, passenger_phone, wa_context, cancel_reason, status')
    .maybeSingle();

  if (error) {
    return { data: null, wasAssigned, error };
  }

  if (data?.id && wasAssigned) {
    try {
      await supabase.from('drivers').update({ is_available: true }).eq('id', driverId);
    } catch {
      // El viaje ya está en cola; el chofer puede marcarse disponible en la app.
    }
  }

  return {
    data,
    wasAssigned,
    releasedTrip: data
      ? {
        ...tripRow,
        ...data,
        driver_id: null,
        status: 'queued',
        wa_context: data.wa_context || extras.wa_context,
        cancel_reason: data.cancel_reason || extras.cancel_reason,
      }
      : null,
  };
}

const DRIVER_CANCEL_RECOVER_FIELDS =
  'id, status, driver_id, wa_context, notes, passenger_phone, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng, cancel_reason, started_at, pickup_at, wa_notified_at';

export const DRIVER_CANCEL_REQUEUE_LOOKBACK_MS = 15 * 60 * 1000;

/**
 * Recupera cancelaciones de pickup escritas directo a cancelled (APK vieja).
 * Devuelve el mismo viaje a queued y excluye al chofer.
 */
export async function recoverCancelledDriverReleases(supabase, {
  now = new Date(),
  lookbackMs = DRIVER_CANCEL_REQUEUE_LOOKBACK_MS,
} = {}) {
  if (!supabase) {
    return { recovered: 0, released: [] };
  }

  const sinceIso = new Date(now.getTime() - lookbackMs).toISOString();
  const { data: rows, error } = await supabase
    .from('trips')
    .select(DRIVER_CANCEL_RECOVER_FIELDS)
    .eq('status', 'cancelled')
    .eq('cancel_reason', DRIVER_RELEASE_REASON)
    .is('started_at', null)
    .not('driver_id', 'is', null)
    .gte('status_updated_at', sinceIso)
    .order('status_updated_at', { ascending: true })
    .limit(25);

  if (error) {
    return { recovered: 0, released: [], error };
  }

  const released = [];
  for (const tripRow of rows || []) {
    if (!canRecoverCancelledDriverReleaseToQueue(tripRow)) continue;
    const driverId = tripRow.driver_id;
    const result = await releaseTripToQueue(supabase, {
      tripRow,
      driverId,
      reason: DRIVER_RELEASE_REASON,
    });
    if (result?.data?.id) {
      released.push({
        tripId: result.data.id,
        driverId,
        releasedTrip: result.releasedTrip,
      });
    }
  }

  return { recovered: released.length, released };
}
