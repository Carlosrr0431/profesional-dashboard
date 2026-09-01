export const PASSENGER_CANCEL_REASON = '[PASSENGER_APP] Cancelado por el pasajero';
export const WHATSAPP_CANCEL_REASON = 'Pasajero canceló por WhatsApp';
export const OPERATOR_CANCEL_REASON = '[MANUAL_CANCEL] Cancelado por operador';

const PASSENGER_CANCEL_MARKERS = [
  'passenger_app',
  'pasajero cancelo',
  'pasajero canceló',
  'cancelado por el pasajero',
  'cancelado por pasajero',
  'por whatsapp',
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

const OPERATOR_CANCEL_MARKERS = [
  'manual_cancel',
  'cancelado por operador',
];

export function isOperatorInitiatedCancellation(tripOrReason) {
  const reason = String(
    typeof tripOrReason === 'string' ? tripOrReason : tripOrReason?.cancel_reason || ''
  )
    .trim()
    .toLowerCase();

  if (!reason) return false;
  return OPERATOR_CANCEL_MARKERS.some((marker) => reason.includes(marker));
}

/** Estados en los que el pasajero puede cancelar desde la app. */
export const PASSENGER_CANCELLABLE_STATUSES = [
  'queued',
  'pending',
  'going_to_pickup',
];

/** Estados en los que el operador puede cancelar desde el dashboard. */
export const OPERATOR_CANCELLABLE_STATUSES = [
  'scheduled',
  'queued',
  'pending',
];

/**
 * Payload de cancelación.
 * Conserva driver_id cuando el viaje ya estaba asignado, para que Realtime
 * llegue al chofer (ownsNow) y se refleje al instante en driver-app.
 */
export function buildPassengerCancelledTripUpdate(existing = {}, extra = {}) {
  const status = String(existing?.status || '').toLowerCase();
  const hadAssignedDriver = Boolean(existing?.driver_id)
    && ['accepted', 'going_to_pickup', 'in_progress', 'pending'].includes(status);

  return {
    status: 'cancelled',
    dispatch_status: 'cancelled',
    cancel_reason: PASSENGER_CANCEL_REASON,
    // Solo liberamos driver_id en cola temprana sin asignación real útil.
    ...(hadAssignedDriver
      ? {}
      : { driver_id: null, assigned_at: null, accepted_at: null }),
    next_dispatch_at: null,
    status_updated_at: new Date().toISOString(),
    ...extra,
  };
}

export function buildWhatsAppCancelledTripUpdate(existing = {}, extra = {}) {
  return buildPassengerCancelledTripUpdate(existing, {
    cancel_reason: WHATSAPP_CANCEL_REASON,
    wa_context: null,
    ...extra,
  });
}

export function buildOperatorCancelledTripUpdate(existing = {}, extra = {}) {
  return buildPassengerCancelledTripUpdate(existing, {
    cancel_reason: OPERATOR_CANCEL_REASON,
    ...extra,
  });
}

export function canOperatorCancelTrip(trip) {
  return OPERATOR_CANCELLABLE_STATUSES.includes(String(trip?.status || '').toLowerCase());
}
