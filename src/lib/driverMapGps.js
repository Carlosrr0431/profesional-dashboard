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
/** Heartbeat de flota (~800 ms). Si es más reciente que esto, es la posición real del auto. */
export const LIVE_DRIVER_GPS_MS = 20_000;
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

export function isLiveDriverGpsTimestamp(updatedAt, now = Date.now(), maxAgeMs = LIVE_DRIVER_GPS_MS) {
  const ts = toTs(updatedAt);
  if (!ts) return false;
  const age = Number(now) - ts;
  return age <= maxAgeMs && age >= -2_000;
}

export function indexDriverLocationsById(rows) {
  const map = Object.create(null);
  for (const row of rows || []) {
    const id = row?.driver_id;
    if (id) map[id] = row;
  }
  return map;
}

/**
 * Coords más frescas entre current_* y driver_locations.
 * speed/heading siempre salen del heartbeat si existe.
 *
 * No usar drivers.updated_at como hora GPS: cualquier PATCH (comisión, disponibilidad)
 * lo pisa y haría ganar un current_lat viejo frente al heartbeat real.
 */
export function pickDriverGps(loc, driver, now = Date.now()) {
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
    const locTs = toTs(locUpdatedAt);
    const curTs = toTs(curUpdatedAt);
    const useLoc = isLiveDriverGpsTimestamp(locUpdatedAt, now) || locTs > curTs;
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

export function applyLiveGpsToDriver(driver, loc, now = Date.now()) {
  if (!driver) return driver;
  const gps = pickDriverGps(loc, driver, now);
  if (!hasValidDriverCoords(gps.lat, gps.lng)) return driver;
  return {
    ...driver,
    current_lat: gps.lat,
    current_lng: gps.lng,
    lat: gps.lat,
    lng: gps.lng,
  };
}

export function applyLiveGpsToDrivers(drivers, locByDriver, now = Date.now()) {
  if (!Array.isArray(drivers) || drivers.length === 0) return drivers || [];
  return drivers.map((driver) => applyLiveGpsToDriver(driver, locByDriver?.[driver?.id] || null, now));
}

export function applyDriverLocationRealtime(drivers, loc) {
  if (!loc?.driver_id || !Array.isArray(drivers)) return drivers;
  const idx = drivers.findIndex((driver) => driver.id === loc.driver_id);
  if (idx === -1) return drivers;

  const prev = drivers[idx];
  const locValid = hasValidDriverCoords(loc.lat, loc.lng);
  if (!locValid) return drivers;

  const locTs = toTs(loc.updated_at || loc.recorded_at);
  const prevTs = toTs(prev.updatedAt);
  const locIsFresher = !prevTs || !locTs || locTs >= prevTs;

  const rawLat = locValid && locIsFresher ? toCoordNumber(loc.lat, prev.lat) : prev.lat;
  const rawLng = locValid && locIsFresher ? toCoordNumber(loc.lng, prev.lng) : prev.lng;
  const simulating = Boolean(prev.gpsSimulationActive);
  const acceptForward = simulating || shouldAcceptForwardGpsStep({
    fromLat: prev.lat,
    fromLng: prev.lng,
    toLat: rawLat,
    toLng: rawLng,
    headingDeg: prev.heading,
    speedMps: prev.speed,
  });
  const nextLat = acceptForward ? rawLat : prev.lat;
  const nextLng = acceptForward ? rawLng : prev.lng;
  const nextSpeed = toSpeedMps(loc.speed ?? loc.speed_kmh, prev.speed || 0);
  const nextHeading = toCoordNumber(loc.heading, prev.heading || 0);

  // Filtrar micro-ruido de GPS estacionario (< 0.8m)
  const distM = haversineMeters(prev.lat, prev.lng, nextLat, nextLng);
  const isStationaryJitter = distM < 0.8 && nextSpeed < 0.6 && hasValidDriverCoords(prev.lat, prev.lng);

  const effectiveLat = isStationaryJitter ? prev.lat : nextLat;
  const effectiveLng = isStationaryJitter ? prev.lng : nextLng;
  const coordsChanged = effectiveLat !== prev.lat || effectiveLng !== prev.lng;

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
    lat: effectiveLat,
    lng: effectiveLng,
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

export function headingDeltaDegrees(fromDeg, toDeg) {
  const delta = Math.abs(Number(fromDeg) - Number(toDeg)) % 360;
  return delta > 180 ? 360 - delta : delta;
}

/**
 * El emulador manda un rastro continuo. El GPS real a veces manda un punto
 * viejo o jitter hacia atrás: eso traba o revierte el pin. Se ignora.
 *
 * reverseMax crece con la velocidad: el pin visual se adelanta hasta
 * MAX_GPS_EXTRAPOLATE_MS y un heartbeat viejo no debe animarlo para atrás.
 */
export const GPS_REVERSE_MAX_M = 28;
export const GPS_TELEPORT_M = 80;
export const GPS_REVERSE_HEADING_DEG = 110;

export function reverseWindowMeters(speedMps = 0) {
  const speed = toSpeedMps(speedMps, 0);
  return Math.max(
    GPS_REVERSE_MAX_M,
    speed * (MAX_GPS_EXTRAPOLATE_MS / 1000) + 15,
  );
}

export function shouldAcceptForwardGpsStep({
  fromLat,
  fromLng,
  toLat,
  toLng,
  headingDeg = 0,
  speedMps = 0,
  reverseMaxM,
  teleportM = GPS_TELEPORT_M,
} = {}) {
  if (!hasValidDriverCoords(fromLat, fromLng) || !hasValidDriverCoords(toLat, toLng)) {
    return true;
  }
  const dist = haversineMeters(fromLat, fromLng, toLat, toLng);
  if (dist < 1) return true;
  if (dist >= teleportM) return true;
  const heading = Number(headingDeg);
  if (!Number.isFinite(heading)) return true;
  const speed = toSpeedMps(speedMps, 0);
  const reverseMax = Number.isFinite(Number(reverseMaxM))
    ? Number(reverseMaxM)
    : reverseWindowMeters(speed);
  const moveHeading = bearingDegrees(fromLat, fromLng, toLat, toLng);
  if (headingDeltaDegrees(heading, moveHeading) > GPS_REVERSE_HEADING_DEG && dist < reverseMax) {
    return false;
  }
  return true;
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
 * current_lat por subscribe desde la tabla drivers.
 * Solo se toma si:
 * 1) prev no tiene coordenadas válidas todavía (bootstrap inicial), O
 * 2) coordsChangedInRow es true (el UPDATE de drivers realmente movió lat/lng en la BD).
 *
 * Si el UPDATE fue solo de billing, comisión o disponibilidad (coordsChangedInRow = false),
 * o si no trae coordenadas válidas, se preservan las coordenadas vivas de telemetry
 * para evitar que el pin retroceda a un punto viejo.
 */
export function nextGpsFromDriverRow(prev, row, coordsChangedInRow = true) {
  const hasRowCoords = hasValidDriverCoords(row?.current_lat, row?.current_lng);
  const hasPrevCoords = hasValidDriverCoords(prev?.lat, prev?.lng);

  if (!hasPrevCoords) {
    if (!hasRowCoords) {
      return { lat: prev?.lat || 0, lng: prev?.lng || 0, updatedAt: prev?.updatedAt };
    }
    return {
      lat: toCoordNumber(row.current_lat, 0),
      lng: toCoordNumber(row.current_lng, 0),
      updatedAt: row.updated_at || new Date().toISOString(),
    };
  }

  // Si las coordenadas no cambiaron en este UPDATE de drivers, preservar telemetry
  if (!coordsChangedInRow || !hasRowCoords) {
    return { lat: prev.lat, lng: prev.lng, updatedAt: prev.updatedAt };
  }

  const nextLat = toCoordNumber(row.current_lat, prev.lat);
  const nextLng = toCoordNumber(row.current_lng, prev.lng);
  if (nextLat === prev.lat && nextLng === prev.lng) {
    return { lat: prev.lat, lng: prev.lng, updatedAt: prev.updatedAt };
  }

  const simulating = Boolean(row?.gps_simulation_active || prev?.gpsSimulationActive);
  if (!simulating && !shouldAcceptForwardGpsStep({
    fromLat: prev.lat,
    fromLng: prev.lng,
    toLat: nextLat,
    toLng: nextLng,
    headingDeg: prev.heading,
    speedMps: prev.speed,
  })) {
    return { lat: prev.lat, lng: prev.lng, updatedAt: prev.updatedAt };
  }

  const intervalMs = Math.max(80, (Date.now() - toTs(prev.updatedAt)) || 800);
  const motion = inferPinMotion({
    fromLat: prev.lat,
    fromLng: prev.lng,
    toLat: nextLat,
    toLng: nextLng,
    reportedSpeed: prev.speed,
    reportedHeading: prev.heading,
    intervalMs,
  });

  return {
    lat: nextLat,
    lng: nextLng,
    updatedAt: gpsTimestampForCoordChange(prev.updatedAt, row.updated_at),
    speed: motion.speed,
    heading: motion.heading,
  };
}

export function gpsTimestampForCoordChange(prevUpdatedAt, rowUpdatedAt, nowIso = new Date().toISOString()) {
  const rowTs = toTs(rowUpdatedAt);
  const prevTs = toTs(prevUpdatedAt);
  if (rowTs > prevTs && rowUpdatedAt) return rowUpdatedAt;
  return nowIso;
}
