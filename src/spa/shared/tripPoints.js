const {
  resolveTripPickupCoords,
  resolveTripFinalDestCoords,
} = require('../../../shared/trip-contract');

function asPoint(raw) {
  if (!raw) return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, address: raw.address || null };
}

export function tripPickupPoint(trip) {
  return asPoint(resolveTripPickupCoords(trip || {}));
}

export function tripDropoffPoint(trip) {
  return asPoint(resolveTripFinalDestCoords(trip || {}));
}

export function tripNavTarget(trip) {
  const status = String(trip?.status || '').toLowerCase();
  if (status === 'in_progress') {
    return tripDropoffPoint(trip) || tripPickupPoint(trip);
  }
  return tripPickupPoint(trip);
}
