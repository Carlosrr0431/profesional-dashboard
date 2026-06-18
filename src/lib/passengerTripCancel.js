export const PASSENGER_CANCEL_REASON = '[PASSENGER_APP] Cancelado por el pasajero';

const PASSENGER_CANCEL_MARKERS = [
  'passenger_app',
  'pasajero cancelo',
  'pasajero canceló',
  'cancelado por el pasajero',
  'cancelado por pasajero',
];

export function isPassengerInitiatedCancellation(tripOrReason) {
  const reason = String(
    typeof tripOrReason === 'string' ? tripOrReason : tripOrReason?.cancel_reason || ''
  )
    .trim()
    .toLowerCase();

  if (!reason) return false;
  return PASSENGER_CANCEL_MARKERS.some((marker) => reason.includes(marker));
}

/** Estados en los que el pasajero puede cancelar desde la app. */
export const PASSENGER_CANCELLABLE_STATUSES = ['queued', 'pending'];

export function buildPassengerCancelledTripUpdate(extra = {}) {
  return {
    status: 'cancelled',
    dispatch_status: 'cancelled',
    cancel_reason: PASSENGER_CANCEL_REASON,
    driver_id: null,
    assigned_at: null,
    accepted_at: null,
    next_dispatch_at: null,
    status_updated_at: new Date().toISOString(),
    ...extra,
  };
}
