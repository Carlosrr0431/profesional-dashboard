import {
  isCoordLikeAddress,
  resolveTripFinalDestCoords,
  resolveTripPickupCoords,
} from '../../shared/trip-contract.js';
import { detectTripSource } from './detectTripSource';
import { isStreetHailOperatorTrip } from './passengerTripCancel';

export const TRIP_CREATED_FROM_LABELS = {
  street_hail: 'Viaje en calle',
  dashboard: 'Panel',
  passenger_app: 'App de pasajeros',
  passenger_web: 'App web',
  whatsapp: 'WhatsApp',
};

const GENERIC_PASSENGER_NAME = /^(pasajero(?: en calle)?)$/i;

function firstReadableAddress(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text && text !== '—' && !isCoordLikeAddress(text)) return text;
  }
  return '';
}

export function resolveTripCreatedFrom(trip) {
  if (!trip) return 'dashboard';
  if (isStreetHailOperatorTrip(trip)) return 'street_hail';

  const scheduled = String(trip.scheduledSource || '').toLowerCase();
  if (scheduled && TRIP_CREATED_FROM_LABELS[scheduled]) return scheduled;

  const tagged = String(trip.notes || '').match(/\[SCHEDULED_SOURCE\]\s*([a-z_]+)/i);
  if (tagged?.[1]) {
    const raw = tagged[1].toLowerCase();
    if (TRIP_CREATED_FROM_LABELS[raw]) return raw;
  }

  const detected = detectTripSource(trip.notes);
  if (detected !== 'otro') return detected;
  return 'dashboard';
}

export function tripCreatedFromLabel(trip) {
  return TRIP_CREATED_FROM_LABELS[resolveTripCreatedFrom(trip)] || TRIP_CREATED_FROM_LABELS.dashboard;
}

export function tripDisplayPassengerName(trip) {
  const name = String(trip?.passenger_name || trip?.passengerName || '').trim();
  if (!name || GENERIC_PASSENGER_NAME.test(name)) return null;
  return name;
}

export function tripRouteAddresses(trip) {
  const pickup = firstReadableAddress(
    resolveTripPickupCoords(trip)?.address,
    trip?.origin_address,
    trip?.driverOrigin,
    trip?.originAddress,
    trip?.destination_address,
    trip?.dropoffAddress,
    trip?.destinationAddress,
    trip?.destination,
    trip?.pickupAddress,
  ) || '—';

  const destRaw = firstReadableAddress(
    resolveTripFinalDestCoords(trip)?.address,
    trip?.destination_address,
    trip?.dropoffAddress,
    trip?.destinationAddress,
    trip?.destination,
  );
  const dest = destRaw && destRaw !== pickup ? destRaw : null;
  return { pickup, dest };
}

export function tripRouteLine(trip) {
  const { pickup, dest } = tripRouteAddresses(trip);
  return [pickup, dest].filter(Boolean).join(' → ');
}

export function resolveAssignedDriver(trip, drivers = []) {
  const embedded = trip?.driver && typeof trip.driver === 'object' ? trip.driver : null;
  const driverId = String(trip?.driver_id || trip?.driverId || embedded?.id || '').trim();
  const fromList = driverId && Array.isArray(drivers)
    ? drivers.find((driver) => String(driver?.id) === driverId)
    : null;
  const driver = fromList || embedded;

  if (!driver) {
    const fallbackName = typeof trip?.driver === 'string' ? trip.driver.trim() : '';
    if (!fallbackName) return null;
    return { number: null, name: fallbackName };
  }

  const rawNumber = driver.driverNumber ?? driver.driver_number;
  const number = rawNumber != null && String(rawNumber).trim() !== ''
    ? String(rawNumber).trim()
    : null;
  const name = String(driver.fullName || driver.full_name || '').trim() || null;
  if (!number && !name) return null;
  return { number, name };
}
