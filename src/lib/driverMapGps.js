import { hasValidDriverCoords, resolveDriverIsOnline } from './driverPresence';

function toTs(value) {
  const ts = Date.parse(value || '');
  return Number.isFinite(ts) ? ts : 0;
}

function toCoordNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Posición del mapa: siempre current_lat/lng de drivers.
 * driver_locations solo aporta speed/heading o coords si no hay current_*.
 */
export function pickDriverGps(loc, driver) {
  const locLat = loc?.lat;
  const locLng = loc?.lng;
  const curLat = driver?.current_lat;
  const curLng = driver?.current_lng;
  const locValid = hasValidDriverCoords(locLat, locLng);
  const curValid = hasValidDriverCoords(curLat, curLng);
  const speed = toCoordNumber(loc?.speed ?? loc?.speed_kmh, 0);
  const heading = toCoordNumber(loc?.heading, 0);

  if (curValid) {
    return {
      lat: toCoordNumber(curLat, 0),
      lng: toCoordNumber(curLng, 0),
      updatedAt: driver?.updated_at || loc?.updated_at || loc?.recorded_at || null,
      speed,
      heading,
    };
  }
  if (locValid) {
    return {
      lat: toCoordNumber(locLat, 0),
      lng: toCoordNumber(locLng, 0),
      updatedAt: loc?.updated_at || loc?.recorded_at || driver?.updated_at || null,
      speed,
      heading,
    };
  }
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
