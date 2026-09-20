const CITY_SPEED_KMH = 24;
const MAX_REMAINING_MINUTES = 90;

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function pointOf(source, latKeys, lngKeys) {
  const lat = latKeys.map((key) => toFiniteNumber(source?.[key])).find((value) => value != null);
  const lng = lngKeys.map((key) => toFiniteNumber(source?.[key])).find((value) => value != null);
  if (lat == null || lng == null) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function driveMinutesBetween(from, to) {
  if (!from || !to) return null;
  const km = haversineKm(from.lat, from.lng, to.lat, to.lng);
  if (!Number.isFinite(km)) return null;
  return Math.max(1, Math.round((km / CITY_SPEED_KMH) * 60));
}

function remainingFromDuration(trip, nowMs) {
  const duration = toFiniteNumber(trip?.duration_minutes ?? trip?.durationMinutes);
  if (duration == null || duration <= 0) return null;
  const startRaw = trip?.started_at || trip?.startedAt || trip?.accepted_at || trip?.acceptedAt;
  if (!startRaw) return Math.round(duration);
  const startMs = new Date(startRaw).getTime();
  if (!Number.isFinite(startMs)) return Math.round(duration);
  const elapsed = Math.max(0, (nowMs - startMs) / 60000);
  return Math.max(1, Math.round(duration - elapsed));
}

function clampMinutes(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(MAX_REMAINING_MINUTES, Math.max(1, Math.round(value)));
}

export function estimateActiveTripRemainingMinutes(driver, nowMs = Date.now()) {
  const trip = driver?.activeTrip;
  if (!trip) return null;

  const status = String(trip.status || '').toLowerCase();
  const gps = pointOf(driver, ['lat', 'current_lat'], ['lng', 'current_lng']);
  const pickup = pointOf(trip, ['origin_lat', 'originLat', 'pickup_lat'], ['origin_lng', 'originLng', 'pickup_lng']);
  const dropoff = pointOf(trip, ['destination_lat', 'destinationLat'], ['destination_lng', 'destinationLng']);
  const durationLeft = remainingFromDuration(trip, nowMs);

  if (status === 'in_progress') {
    return clampMinutes(driveMinutesBetween(gps, dropoff) ?? durationLeft);
  }

  if (status === 'going_to_pickup' || status === 'accepted') {
    const toPickup = driveMinutesBetween(gps, pickup);
    const pickupToDropoff = driveMinutesBetween(pickup, dropoff);
    if (toPickup != null && pickupToDropoff != null) return clampMinutes(toPickup + pickupToDropoff);
    return clampMinutes(driveMinutesBetween(gps, dropoff) ?? durationLeft);
  }

  return clampMinutes(durationLeft);
}

export function formatActiveTripRemainingLabel(minutes) {
  const value = clampMinutes(minutes);
  if (value == null) return null;
  if (value <= 1) return 'Termina en menos de 1 min';
  if (value < 60) return `Termina en ~${value} min`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (!rest) return `Termina en ~${hours} h`;
  return `Termina en ~${hours} h ${rest} min`;
}
