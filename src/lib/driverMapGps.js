import { hasValidDriverCoords, resolveDriverIsOnline } from './driverPresence';

function toTs(value) {
  const ts = Date.parse(value || '');
  return Number.isFinite(ts) ? ts : 0;
}

function toCoordNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toSpeedMps(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export const MAX_GPS_EXTRAPOLATE_MS = 3500;
export const MIN_MOVE_SPEED_MPS = 0.6;
const EARTH_M = 6371000;

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const aLat = Number(lat1);
  const aLng = Number(lng1);
  const bLat = Number(lat2);
  const bLng = Number(lng2);
  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return 0;
  const R = 6371000;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Avanza el pin a la velocidad y rumbo del celular (norte = 0°). */
export function extrapolateGps(lat, lng, speedMps, headingDeg, elapsedMs) {
  const startLat = Number(lat);
  const startLng = Number(lng);
  if (!hasValidDriverCoords(startLat, startLng)) return { lat: startLat, lng: startLng };
  const speed = toSpeedMps(speedMps, 0);
  const heading = Number(headingDeg);
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  if (speed < MIN_MOVE_SPEED_MPS || !Number.isFinite(heading) || elapsed <= 0) {
    return { lat: startLat, lng: startLng };
  }
  const dist = speed * (Math.min(elapsed, MAX_GPS_EXTRAPOLATE_MS) / 1000);
  const rad = heading * Math.PI / 180;
  const dNorth = dist * Math.cos(rad);
  const dEast = dist * Math.sin(rad);
  const latRad = startLat * Math.PI / 180;
  const denom = EARTH_M * Math.cos(latRad);
  return {
    lat: startLat + (dNorth / EARTH_M) * (180 / Math.PI),
    lng: startLng + (denom === 0 ? 0 : (dEast / denom) * (180 / Math.PI)),
  };
}

/** Duración del deslizamiento del pin: distancia / velocidad (m/s), acotada. */
export function pinMoveDurationMs(distanceM, speedMps) {
  const dist = Number(distanceM);
  if (!Number.isFinite(dist) || dist <= 0) return 0;
  const speed = Number(speedMps);
  const travelMs = Number.isFinite(speed) && speed > 0.8
    ? (dist / speed) * 1000
    : 650;
  return Math.round(Math.min(1600, Math.max(140, travelMs)));
}

/**
 * Coords más frescas entre current_* y driver_locations.
 * speed/heading siempre salen del heartbeat si existe.
 */
export function pickDriverGps(loc, driver) {
  const locLat = loc?.lat;
  const locLng = loc?.lng;
  const curLat = driver?.current_lat;
  const curLng = driver?.current_lng;
  const locValid = hasValidDriverCoords(locLat, locLng);
  const curValid = hasValidDriverCoords(curLat, curLng);
  const speed = toSpeedMps(loc?.speed ?? loc?.speed_kmh, 0);
  const heading = toCoordNumber(loc?.heading, 0);
  const locUpdatedAt = loc?.updated_at || loc?.recorded_at || null;
  const curUpdatedAt = driver?.updated_at || null;

  if (curValid && locValid) {
    const useLoc = toTs(locUpdatedAt) > toTs(curUpdatedAt);
    return {
      lat: toCoordNumber(useLoc ? locLat : curLat, 0),
      lng: toCoordNumber(useLoc ? locLng : curLng, 0),
      updatedAt: useLoc ? locUpdatedAt : (curUpdatedAt || locUpdatedAt),
      speed,
      heading,
    };
  }
  if (curValid) {
    return {
      lat: toCoordNumber(curLat, 0),
      lng: toCoordNumber(curLng, 0),
      updatedAt: curUpdatedAt || locUpdatedAt,
      speed,
      heading,
    };
  }
  if (locValid) {
    return {
      lat: toCoordNumber(locLat, 0),
      lng: toCoordNumber(locLng, 0),
      updatedAt: locUpdatedAt || curUpdatedAt,
      speed,
      heading,
    };
  }
  return {
    lat: 0,
    lng: 0,
    updatedAt: locUpdatedAt || curUpdatedAt,
    speed,
    heading,
  };
}

export function applyDriverLocationRealtime(drivers, loc) {
  if (!loc?.driver_id || !Array.isArray(drivers)) return drivers;
  const idx = drivers.findIndex((driver) => driver.id === loc.driver_id);
  if (idx === -1) return drivers;

  const prev = drivers[idx];
  const locValid = hasValidDriverCoords(loc.lat, loc.lng);
  const locTs = toTs(loc.updated_at || loc.recorded_at);
  const prevTs = toTs(prev.updatedAt);
  const locIsFresher = !prevTs || !locTs || locTs >= prevTs;

  const nextLat = locValid && locIsFresher ? toCoordNumber(loc.lat, prev.lat) : prev.lat;
  const nextLng = locValid && locIsFresher ? toCoordNumber(loc.lng, prev.lng) : prev.lng;
  const nextSpeed = toSpeedMps(loc.speed ?? loc.speed_kmh, prev.speed || 0);
  const nextHeading = toCoordNumber(loc.heading, prev.heading || 0);
  const coordsChanged = nextLat !== prev.lat || nextLng !== prev.lng;
  if (
    !coordsChanged
    && nextSpeed === prev.speed
    && nextHeading === prev.heading
  ) {
    return drivers;
  }

  const nextUpdatedAt = coordsChanged
    ? gpsTimestampForCoordChange(prev.updatedAt, loc.updated_at || loc.recorded_at)
    : (prev.updatedAt || loc.updated_at || loc.recorded_at);
  const gps = {
    lat: nextLat,
    lng: nextLng,
    speed: nextSpeed,
    heading: nextHeading,
    updatedAt: nextUpdatedAt,
  };
  const next = drivers.slice();
  next[idx] = {
    ...prev,
    ...gps,
    isOnline: resolveDriverIsOnline({ ...prev, ...gps }),
  };
  return next;
}

/**
 * Tras la carga inicial, el GPS lo mueve solo el subscribe.
 * El snapshot/poll no puede pisar lat/lng/speed/heading.
 */
export function mergeSnapshotKeepingFresherGps(prev, next) {
  if (!Array.isArray(next)) return prev || [];
  if (!prev?.length) return next;

  const prevById = new Map(prev.map((driver) => [driver.id, driver]));
  return next.map((incoming) => {
    const local = prevById.get(incoming.id);
    if (!local) return incoming;
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

export function bearingDegrees(lat1, lng1, lat2, lng2) {
  const φ1 = Number(lat1) * Math.PI / 180;
  const φ2 = Number(lat2) * Math.PI / 180;
  const Δλ = (Number(lng2) - Number(lng1)) * Math.PI / 180;
  if (![φ1, φ2, Δλ].every(Number.isFinite)) return 0;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** Velocidad/rumbo para seguir andando entre eventos de subscribe. */
export function inferPinMotion({
  fromLat,
  fromLng,
  toLat,
  toLng,
  reportedSpeed,
  reportedHeading,
  intervalMs,
}) {
  const dist = haversineMeters(fromLat, fromLng, toLat, toLng);
  const reported = toSpeedMps(reportedSpeed, 0);
  const derivedSpeed = intervalMs > 80 ? dist / (intervalMs / 1000) : 0;
  const speed = reported >= MIN_MOVE_SPEED_MPS ? reported : derivedSpeed;
  const heading = dist >= 1
    ? bearingDegrees(fromLat, fromLng, toLat, toLng)
    : toCoordNumber(reportedHeading, 0);
  return { speed, heading };
}

/**
 * current_lat por subscribe es un evento live del celular.
 * No usar drivers.updated_at para descartarlo: un billing UPDATE
 * posterior deja ese timestamp más nuevo, y un GPS frecuente puede
 * no tocar updated_at.
 */
export function nextGpsFromDriverRow(prev, row) {
  const hasCoords = hasValidDriverCoords(row?.current_lat, row?.current_lng);
  if (!hasCoords) {
    return { lat: prev.lat, lng: prev.lng, updatedAt: prev.updatedAt };
  }
  const nextLat = toCoordNumber(row.current_lat, prev.lat);
  const nextLng = toCoordNumber(row.current_lng, prev.lng);
  if (nextLat === prev.lat && nextLng === prev.lng) {
    return { lat: prev.lat, lng: prev.lng, updatedAt: prev.updatedAt };
  }
  return {
    lat: nextLat,
    lng: nextLng,
    updatedAt: gpsTimestampForCoordChange(prev.updatedAt, row.updated_at),
  };
}

export function gpsTimestampForCoordChange(prevUpdatedAt, rowUpdatedAt, nowIso = new Date().toISOString()) {
  const rowTs = toTs(rowUpdatedAt);
  const prevTs = toTs(prevUpdatedAt);
  if (rowTs > prevTs && rowUpdatedAt) return rowUpdatedAt;
  return nowIso;
}
