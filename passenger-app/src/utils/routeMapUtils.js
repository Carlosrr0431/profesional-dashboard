/** Utilidades de ruta para el mapa del pasajero (snap, split, bearing). */

export function haversineMeters(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const lat1 = Number(a.latitude ?? a.lat);
  const lng1 = Number(a.longitude ?? a.lng);
  const lat2 = Number(b.latitude ?? b.lat);
  const lng2 = Number(b.longitude ?? b.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;

  const R = 6378137;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function snapToSegment(point, a, b) {
  const dx = b.longitude - a.longitude;
  const dy = b.latitude - a.latitude;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return { point: a, t: 0, dist: haversineMeters(point, a) };
  }

  let t = ((point.longitude - a.longitude) * dx + (point.latitude - a.latitude) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const snapped = {
    latitude: a.latitude + t * dy,
    longitude: a.longitude + t * dx,
  };
  return { point: snapped, t, dist: haversineMeters(point, snapped) };
}

export function snapToRoute(point, route = []) {
  if (!point || route.length < 2) return point;

  let best = null;
  for (let i = 0; i < route.length - 1; i += 1) {
    const candidate = snapToSegment(point, route[i], route[i + 1]);
    if (!best || candidate.dist < best.dist) {
      best = { ...candidate, index: i };
    }
  }

  if (!best || best.dist > 45) return point;
  return best.point;
}

export function splitRouteAtPoint(point, route = []) {
  if (!route.length) return { traveled: [], remaining: [] };
  if (route.length === 1) return { traveled: [], remaining: route };

  let best = null;
  for (let i = 0; i < route.length - 1; i += 1) {
    const candidate = snapToSegment(point, route[i], route[i + 1]);
    if (!best || candidate.dist < best.dist) {
      best = { ...candidate, index: i };
    }
  }

  if (!best) return { traveled: [], remaining: route };

  const traveled = route.slice(0, best.index + 1);
  if (best.t > 0.02) traveled.push(best.point);

  const remaining = [best.point, ...route.slice(best.index + 1)];
  if (remaining.length === 1 && haversineMeters(point, remaining[0]) < 8) {
    return { traveled: route, remaining: [] };
  }

  return { traveled, remaining };
}

export function getBearing(from, to) {
  if (!from || !to) return 0;
  const lat1 = ((from.latitude ?? from.lat) * Math.PI) / 180;
  const lat2 = ((to.latitude ?? to.lat) * Math.PI) / 180;
  const dLng = (((to.longitude ?? to.lng) - (from.longitude ?? from.lng)) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function interpolateAlongRoute(route, distanceAlongMeters) {
  if (!route?.length) return null;
  if (distanceAlongMeters <= 0) return route[0];

  let accumulated = 0;
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = route[i];
    const b = route[i + 1];
    const segLen = haversineMeters(a, b);
    if (accumulated + segLen >= distanceAlongMeters) {
      const frac = segLen > 0 ? (distanceAlongMeters - accumulated) / segLen : 0;
      return {
        latitude: a.latitude + frac * (b.latitude - a.latitude),
        longitude: a.longitude + frac * (b.longitude - a.longitude),
      };
    }
    accumulated += segLen;
  }
  return route[route.length - 1];
}

/** Punto `metersAhead` metros adelante sobre la polilínea (proyección al segmento). */
export function getPointAheadOnRoute(origin, route = [], metersAhead = 28) {
  if (!origin || route.length < 2) return null;

  let best = null;
  let distanceAlong = 0;
  for (let i = 0; i < route.length - 1; i += 1) {
    const candidate = snapToSegment(origin, route[i], route[i + 1]);
    const segLen = haversineMeters(route[i], route[i + 1]);
    if (!best || candidate.dist < best.dist) {
      best = {
        dist: candidate.dist,
        distanceAlong: distanceAlong + (segLen > 0 ? segLen * candidate.t : 0),
      };
    }
    distanceAlong += segLen;
  }

  const aheadAlong = (best?.distanceAlong ?? 0) + Math.max(6, metersAhead);
  return interpolateAlongRoute(route, aheadAlong);
}

export function smoothAngle(current, target, factor = 0.22) {
  const diff = ((target - current + 540) % 360) - 180;
  return (current + diff * factor + 360) % 360;
}

export function lerpCoordinate(from, to, t) {
  if (!from || !to) return to ?? from;
  const eased = Math.max(0, Math.min(1, t));
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * eased,
    longitude: from.longitude + (to.longitude - from.longitude) * eased,
  };
}

export function polylineLengthMeters(coords = []) {
  if (!coords || coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i += 1) {
    total += haversineMeters(coords[i], coords[i + 1]);
  }
  return total;
}

/**
 * Polilínea restante para el pasajero: recorta lo recorrido y oculta el tramo
 * cuando el conductor ya está muy cerca (evita el “palito” negro al final).
 */
export function buildPassengerRemainingPath(driverCoord, routeCoords, targetCoord) {
  const HIDE_LINE_M = 42;
  const MIN_VISIBLE_PATH_M = 50;
  const NEAR_TARGET_M = 160;

  if (!driverCoord || !targetCoord) return [];
  const distToTarget = haversineMeters(driverCoord, targetCoord);
  if (distToTarget <= HIDE_LINE_M) return [];

  let remaining = [];
  if (Array.isArray(routeCoords) && routeCoords.length >= 2) {
    const split = splitRouteAtPoint(driverCoord, routeCoords);
    remaining = dedupeRouteCoords(split.remaining ?? [], 3);
  }

  if (remaining.length === 0) {
    return [];
  } else {
    const last = remaining[remaining.length - 1];
    if (!last || haversineMeters(last, targetCoord) > 12) {
      remaining.push(targetCoord);
    }
    remaining[0] = driverCoord;
  }

  if (remaining.length < 2) return [];

  const pathLen = polylineLengthMeters(remaining);
  if (pathLen < MIN_VISIBLE_PATH_M && distToTarget < NEAR_TARGET_M) return [];

  return remaining;
}

/** Elimina vértices muy cercanos para una línea más suave en el mapa. */
export function dedupeRouteCoords(coords = [], minMeters = 4) {
  if (coords.length < 2) return coords;
  const out = [coords[0]];
  for (let i = 1; i < coords.length; i += 1) {
    if (haversineMeters(out[out.length - 1], coords[i]) >= minMeters) {
      out.push(coords[i]);
    }
  }
  const last = coords[coords.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}
