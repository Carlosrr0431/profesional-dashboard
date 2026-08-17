/**
 * Atrás nativo durante un viaje activo: no se sale hasta completar o cancelar.
 * En búsqueda de destino, el atrás vuelve al selector de modo.
 */

export const ACTIVE_TRIP_BACK = {
  LEAVE: 'leave',
  STAY: 'stay',
  CHOOSE_DEST_MODE: 'choose_dest_mode',
};

const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);

export function resolveActiveTripBackAction({
  hasActiveTrip,
  tripStatus,
  flowStep,
  destinationSet,
  allowLeave = false,
  showingSummary = false,
} = {}) {
  if (allowLeave || showingSummary) return ACTIVE_TRIP_BACK.LEAVE;
  if (!hasActiveTrip) return ACTIVE_TRIP_BACK.LEAVE;
  if (TERMINAL_STATUSES.has(String(tripStatus || ''))) return ACTIVE_TRIP_BACK.LEAVE;
  if (flowStep === 'set_destination' && !destinationSet) {
    return ACTIVE_TRIP_BACK.CHOOSE_DEST_MODE;
  }
  return ACTIVE_TRIP_BACK.STAY;
}
