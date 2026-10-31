const {
  cleanTripNotesForDriverDisplay,
  isApproachOnlyTrip,
  isPassengerAppTrip,
  resolveTripFinalDestCoords,
  resolveTripPickupCoords,
  resolveTripWaypoints,
} = require('../../../shared/trip-contract');

export const TRIP_ACCEPT_TIMEOUT = 25;

export const CANCEL_REASONS = [
  'Pasajero no encontrado',
  'Dirección incorrecta',
  'Problema con el vehículo',
  'Emergencia personal',
  'Pasajero canceló',
  'Otro motivo',
];

export function remainingAcceptSeconds(trip, nowMs = Date.now(), timeoutSeconds = TRIP_ACCEPT_TIMEOUT) {
  const assignedAtMs = trip?.assigned_at ? Date.parse(trip.assigned_at) : NaN;
  if (!Number.isFinite(assignedAtMs)) return timeoutSeconds;
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - assignedAtMs) / 1000));
  return Math.max(0, timeoutSeconds - elapsedSeconds);
}

export function formatOfferDistance(km) {
  if (km == null || !Number.isFinite(Number(km))) return '—';
  const value = Number(km);
  if (value < 1) return `${Math.round(value * 1000)} m`;
  return `${value.toFixed(1)} km`;
}

export function formatOfferDuration(minutes) {
  if (minutes == null || !Number.isFinite(Number(minutes))) return '—';
  const value = Number(minutes);
  if (value < 60) return `${Math.round(value)} min`;
  const hrs = Math.floor(value / 60);
  const mins = Math.round(value % 60);
  return `${hrs}h ${mins}min`;
}

export function scheduledOfferLead(trip, now = Date.now()) {
  const notes = String(trip?.notes || '');
  const fromColumn = trip?.scheduled_for ? Date.parse(trip.scheduled_for) : NaN;
  const match = notes.match(/\[SCHEDULED_FOR\]\s*(\S+)/i);
  const at = Number.isFinite(fromColumn) ? fromColumn : (match ? Date.parse(match[1]) : NaN);
  if (!Number.isFinite(at)) return null;
  const clock = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(at));
  const remainingMs = at - now;
  const totalMinutes = Math.max(0, Math.floor(remainingMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return {
    clock,
    big: hours > 0 ? `${hours} h ${String(minutes).padStart(2, '0')}` : String(totalMinutes),
    ready: remainingMs <= 0,
  };
}

export function getOfferDisplay(trip) {
  const approachOnly = isApproachOnlyTrip(trip);
  const passengerAppTrip = isPassengerAppTrip(trip);
  const pickupResolved = resolveTripPickupCoords(trip || {});
  const finalDestResolved = resolveTripFinalDestCoords(trip || {});
  const waypoints = resolveTripWaypoints(trip || {});
  const pickupAddress = pickupResolved?.address || trip?.origin_address || null;
  const destinationAddress = finalDestResolved?.address
    || (approachOnly ? 'A definir al subir al pasajero' : (trip?.destination_address || '—'));
  return {
    approachOnly,
    passengerAppTrip,
    whatsAppTrip: !passengerAppTrip,
    pickupAddress,
    destinationAddress,
    waypoints,
    notes: cleanTripNotesForDriverDisplay(trip?.notes),
    isAccumulated: waypoints.length > 0,
    stopCountLabel: waypoints.length === 1
      ? '1 parada intermedia'
      : `${waypoints.length} paradas intermedias`,
  };
}
