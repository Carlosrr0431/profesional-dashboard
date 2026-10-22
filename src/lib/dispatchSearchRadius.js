export const MAX_DRIVER_SEARCH_KM = 2;

export function isWithinDriverSearchRadius(distanceKm, maxKm = MAX_DRIVER_SEARCH_KM) {
  const distance = Number(distanceKm);
  const limit = Number(maxKm);
  return Number.isFinite(distance) && distance >= 0 && Number.isFinite(limit) && distance <= limit;
}

export function queuedTripIdsNearFreeDrivers({
  trips = [],
  freeDrivers = [],
  maxKm = MAX_DRIVER_SEARCH_KM,
  pickupOf,
  excludedIdsOf,
  samePhone,
  distanceKm,
} = {}) {
  const ids = [];
  for (const trip of trips) {
    if (!trip?.id) continue;
    const pickup = pickupOf(trip);
    const pickupLat = Number(pickup?.lat);
    const pickupLng = Number(pickup?.lng);
    if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) continue;
    const excluded = excludedIdsOf(trip);
    const near = freeDrivers.some((driver) => {
      if (!driver?.id || excluded.has(driver.id)) return false;
      if (samePhone(trip, driver)) return false;
      const km = distanceKm(driver, pickupLat, pickupLng);
      return isWithinDriverSearchRadius(km, maxKm);
    });
    if (near) ids.push(trip.id);
  }
  return ids;
}
