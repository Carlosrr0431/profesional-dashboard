import { isPassengerInitiatedCancellation } from './passengerTripCancel';
import {
  isPassengerAppTrip,
  isApproachOnlyTrip,
  extractPickupFromNotes,
  isCoordLikeAddress,
  resolveTripPickupCoords,
  resolveTripFinalDestCoords,
} from '../../shared/trip-contract.js';

/** Restaura recogida del pasajero desde PICKUP_JSON (p. ej. tras pisar origin con GPS del chofer). */
export function resolvePassengerAppPickupFields(trip = {}) {
  const fromNotes = extractPickupFromNotes(trip?.notes);
  const noteLat = Number(fromNotes?.lat);
  const noteLng = Number(fromNotes?.lng);
  if (fromNotes?.address && hasValidPickupCoords(noteLat, noteLng)) {
    return {
      origin_address: fromNotes.address,
      origin_lat: noteLat,
      origin_lng: noteLng,
    };
  }

  const originLat = Number(trip.origin_lat);
  const originLng = Number(trip.origin_lng);
  if (
    hasValidPickupCoords(originLat, originLng)
    && trip.origin_address
    && !isCoordLikeAddress(trip.origin_address)
  ) {
    return {
      origin_address: String(trip.origin_address).trim(),
      origin_lat: originLat,
      origin_lng: originLng,
    };
  }

  return null;
}

export function hasValidPickupCoords(lat, lng) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  return Number.isFinite(parsedLat) && Number.isFinite(parsedLng);
}

/** Coordenadas de recogida para asignar conductor (dispatch / distancia). */
export function resolveDispatchPickupCoords(trip = {}) {
  const pickup = resolveTripPickupCoords(trip);
  return {
    pickupLat: pickup.lat,
    pickupLng: pickup.lng,
    pickupAddress: pickup.address,
  };
}

/**
 * Al pasar pending → queued, el dispatch worker usa destination_lat/lng como retiro.
 * Viajes de la app de pasajeros guardan el retiro en origin_* y el destino en destination_*.
 * Viajes legacy del dashboard guardaban el retiro en origin_* sin destino en destination_*.
 */
export function resolvePickupCoordsForRequeue(trip = {}) {
  if (isPassengerAppTrip(trip)) {
    const originLat = Number(trip.origin_lat);
    const originLng = Number(trip.origin_lng);
    if (hasValidPickupCoords(originLat, originLng)) {
      return {
        destination_address: String(trip.origin_address || '').trim() || null,
        destination_lat: originLat,
        destination_lng: originLng,
      };
    }

    const fromNotes = extractPickupFromNotes(trip?.notes);
    const noteLat = Number(fromNotes?.lat);
    const noteLng = Number(fromNotes?.lng);
    if (hasValidPickupCoords(noteLat, noteLng)) {
      return {
        destination_address: String(fromNotes?.address || '').trim() || null,
        destination_lat: noteLat,
        destination_lng: noteLng,
      };
    }
  }

  const destLat = Number(trip.destination_lat);
  const destLng = Number(trip.destination_lng);

  if (hasValidPickupCoords(destLat, destLng)) {
    return {
      destination_address: String(trip.destination_address || '').trim() || null,
      destination_lat: destLat,
      destination_lng: destLng,
    };
  }

  const originLat = Number(trip.origin_lat);
  const originLng = Number(trip.origin_lng);
  if (hasValidPickupCoords(originLat, originLng)) {
    return {
      destination_address: String(trip.origin_address || trip.destination_address || '').trim() || null,
      destination_lat: originLat,
      destination_lng: originLng,
    };
  }

  return {
    destination_address: String(trip.destination_address || '').trim() || null,
    destination_lat: Number.isFinite(destLat) ? destLat : null,
    destination_lng: Number.isFinite(destLng) ? destLng : null,
  };
}

/** El worker no debe reencolar viajes cancelados por el pasajero. */
export function canRequeuePendingTrip(trip) {
  if (!trip) return false;
  if (String(trip.status || '').toLowerCase() !== 'pending') return false;
  if (isPassengerInitiatedCancellation(trip)) return false;
  return true;
}

export function buildPendingToQueuedUpdate(trip, extras = {}) {
  if (isPassengerAppTrip(trip)) {
    const restoredPickup = resolvePassengerAppPickupFields(trip);
    return {
      driver_id: null,
      assigned_at: null,
      accepted_at: null,
      status: 'queued',
      dispatch_status: 'queued',
      status_updated_at: new Date().toISOString(),
      ...(restoredPickup || {}),
      ...extras,
    };
  }

  if (isApproachOnlyTrip(trip)) {
    const pickup = resolveTripPickupCoords(trip);
    const finalDest = resolveTripFinalDestCoords(trip);
    return {
      driver_id: null,
      assigned_at: null,
      accepted_at: null,
      status: 'queued',
      dispatch_status: 'queued',
      status_updated_at: new Date().toISOString(),
      origin_address: pickup.address || null,
      origin_lat: Number.isFinite(pickup.lat) ? pickup.lat : null,
      origin_lng: Number.isFinite(pickup.lng) ? pickup.lng : null,
      destination_address: finalDest?.address || null,
      destination_lat: finalDest?.lat ?? null,
      destination_lng: finalDest?.lng ?? null,
      ...extras,
    };
  }

  const pickup = resolvePickupCoordsForRequeue(trip);

  return {
    driver_id: null,
    origin_address: null,
    origin_lat: null,
    origin_lng: null,
    destination_address: pickup.destination_address,
    destination_lat: pickup.destination_lat,
    destination_lng: pickup.destination_lng,
    status: 'queued',
    assigned_at: null,
    accepted_at: null,
    dispatch_status: 'queued',
    status_updated_at: new Date().toISOString(),
    ...extras,
  };
}

export function buildDashboardAssignNotes({
  userNotes = '',
  dropoffAddress = null,
  dropoffLat = null,
  dropoffLng = null,
} = {}) {
  const parts = [
    '[APPROACH_ONLY]',
    '[DASHBOARD_ASSIGN]',
    String(userNotes || '').trim() || 'Viaje asignado desde el panel de operaciones.',
  ];

  if (
    dropoffAddress
    && dropoffAddress !== 'A confirmar'
    && hasValidPickupCoords(dropoffLat, dropoffLng)
  ) {
    parts.push(
      `[FINAL_DEST_JSON:${JSON.stringify({
        address: dropoffAddress,
        lat: Number(dropoffLat),
        lng: Number(dropoffLng),
      })}]`
    );
  }

  return parts.join('\n');
}
