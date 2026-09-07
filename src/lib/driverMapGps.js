import { hasValidDriverCoords, resolveDriverIsOnline } from './driverPresence';

export const STALE_DRIVER_LOCATION_MS = 8000;

function toTs(value) {
  const ts = Date.parse(value || '');
  return Number.isFinite(ts) ? ts : 0;
}

function toCoordNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Elige coords para el mapa: driver_locations si está fresco,
 * si no current_lat/lng (se escriben más seguido desde la app).
 */
export function pickDriverGps(loc, driver, nowMs = Date.now()) {
  const locLat = loc?.lat;
  const locLng = loc?.lng;
  const curLat = driver?.current_lat;
  const curLng = driver?.current_lng;
  const locValid = hasValidDriverCoords(locLat, locLng);
  const curValid = hasValidDriverCoords(curLat, curLng);
  const locTs = toTs(loc?.updated_at || loc?.recorded_at);
  const speed = toCoordNumber(loc?.speed ?? loc?.speed_kmh, 0);
  const heading = toCoordNumber(loc?.heading, 0);

  const fromLoc = () => ({
    lat: toCoordNumber(locLat, 0),
    lng: toCoordNumber(locLng, 0),
    updatedAt: loc?.updated_at || loc?.recorded_at || driver?.updated_at || null,
    speed,
    heading,
  });

  const fromCurrent = (updatedAt) => ({
    lat: toCoordNumber(curLat, 0),
    lng: toCoordNumber(curLng, 0),
    updatedAt: updatedAt || driver?.updated_at || loc?.updated_at || loc?.recorded_at || null,
    speed,
    heading,
  });

  if (locValid && curValid) {
    const locAge = locTs ? nowMs - locTs : Number.POSITIVE_INFINITY;
    const differs = toCoordNumber(locLat) !== toCoordNumber(curLat)
      || toCoordNumber(locLng) !== toCoordNumber(curLng);
    if (differs && locAge > STALE_DRIVER_LOCATION_MS) {
      return fromCurrent(new Date(nowMs).toISOString());
    }
    return fromLoc();
  }
  if (locValid) return fromLoc();
  if (curValid) return fromCurrent(driver?.updated_at || null);
  return {
    lat: 0,
    lng: 0,
    updatedAt: loc?.updated_at || loc?.recorded_at || driver?.updated_at || null,
    speed,
    heading,
  };
}

/** El poll no debe pisar un GPS de realtime más nuevo. */
export function mergeSnapshotKeepingFresherGps(prev, next) {
  if (!Array.isArray(next)) return prev || [];
  if (!prev?.length) return next;

  const prevById = new Map(prev.map((driver) => [driver.id, driver]));
  return next.map((incoming) => {
    const local = prevById.get(incoming.id);
    if (!local) return incoming;
    const localTs = toTs(local.updatedAt);
    const incomingTs = toTs(incoming.updatedAt);
    if (localTs <= incomingTs) return incoming;
    if (!hasValidDriverCoords(local.lat, local.lng)) return incoming;
    const gps = {
      lat: local.lat,
      lng: local.lng,
      speed: local.speed,
      heading: local.heading,
      updatedAt: local.updatedAt,
    };
    return {
      ...incoming,
      ...gps,
      isOnline: resolveDriverIsOnline({ ...incoming, ...gps }),
    };
  });
}

export function gpsTimestampForCoordChange(prevUpdatedAt, rowUpdatedAt, nowIso = new Date().toISOString()) {
  const rowTs = toTs(rowUpdatedAt);
  const prevTs = toTs(prevUpdatedAt);
  if (rowTs > prevTs && rowUpdatedAt) return rowUpdatedAt;
  return nowIso;
}
