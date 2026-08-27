/** Utilidades geográficas para el seguimiento público del viaje. */

export function decodePolyline(encoded = '') {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

export function haversineMeters(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const lat1 = Number(a.lat ?? a.latitude);
  const lng1 = Number(a.lng ?? a.longitude);
  const lat2 = Number(b.lat ?? b.latitude);
  const lng2 = Number(b.lng ?? b.longitude);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;

  const R = 6378137;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function getBearing(from, to) {
  if (!from || !to) return 0;
  const lat1 = ((from.lat ?? from.latitude) * Math.PI) / 180;
  const lat2 = ((to.lat ?? to.latitude) * Math.PI) / 180;
  const dLng = (((to.lng ?? to.longitude) - (from.lng ?? from.longitude)) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function toFinitePoint(lat, lng, address = null) {
  if (lat == null || lng == null || lat === '' || lng === '') return null;
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return null;
  return { lat: parsedLat, lng: parsedLng, address: address || null };
}

/**
 * Resuelve el punto de retiro para el mapa público.
 * Preferencia: payload enriquecido → origin_* → destination_* (legacy WhatsApp).
 */
export function resolveTrackingPickup(trip, pickupFromApi = null) {
  const fromApi = toFinitePoint(pickupFromApi?.lat, pickupFromApi?.lng, pickupFromApi?.address);
  if (fromApi) return fromApi;

  const fromOrigin = toFinitePoint(trip?.origin_lat, trip?.origin_lng, trip?.origin_address);
  if (fromOrigin) return fromOrigin;

  return toFinitePoint(trip?.destination_lat, trip?.destination_lng, trip?.destination_address);
}

/** Destino final del pasajero (si existe). */
export function resolveTrackingDropoff(trip, dropoffFromApi = null) {
  const fromApi = toFinitePoint(dropoffFromApi?.lat, dropoffFromApi?.lng, dropoffFromApi?.address);
  if (fromApi) return fromApi;

  const pickup = resolveTrackingPickup(trip, null);
  const dest = toFinitePoint(trip?.destination_lat, trip?.destination_lng, trip?.destination_address);
  if (!dest) return null;
  if (
    pickup
    && Math.abs(pickup.lat - dest.lat) < 0.00005
    && Math.abs(pickup.lng - dest.lng) < 0.00005
  ) {
    return null;
  }
  return dest;
}

/** Objetivo actual de la ruta según etapa del viaje. */
export function resolveTrackingRouteTarget(trip, pickup, dropoff) {
  const goingToDestination = trip?.status === 'in_progress' || trip?.status === 'completed';
  if (goingToDestination) return dropoff || null;
  return pickup || null;
}

function snapToSegment(point, a, b) {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { point: a, t: 0, dist: haversineMeters(point, a) };

  let t = ((point.lng - a.lng) * dx + (point.lat - a.lat) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const snapped = { lat: a.lat + t * dy, lng: a.lng + t * dx };
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

export function getPointAheadOnRoute(origin, route = [], metersAhead = 70) {
  if (!origin || route.length < 2) return null;

  const { remaining } = splitRouteAtPoint(origin, route);
  const path = remaining.length >= 2 ? remaining : route;
  let left = metersAhead;
  let ahead = path[1];
  for (let i = 0; i < path.length - 1; i += 1) {
    const segLen = haversineMeters(path[i], path[i + 1]);
    if (segLen < 0.8) continue;
    if (left <= segLen) {
      const frac = left / segLen;
      return {
        lat: path[i].lat + frac * (path[i + 1].lat - path[i].lat),
        lng: path[i].lng + frac * (path[i + 1].lng - path[i].lng),
      };
    }
    left -= segLen;
    ahead = path[i + 1];
  }
  return ahead || path[path.length - 1];
}

/** Rumbo en grados (0 = norte) a lo largo de la polilínea, no del GPS. */
export function getHeadingAlongRoute(point, route = [], metersAhead = 28) {
  if (!point || route.length < 2) return null;
  const { remaining } = splitRouteAtPoint(point, route);
  if (!remaining || remaining.length < 2) {
    return getBearing(route[route.length - 2], route[route.length - 1]);
  }
  const origin = remaining[0];
  const ahead = getPointAheadOnRoute(origin, remaining, metersAhead)
    || remaining[remaining.length - 1];
  if (haversineMeters(origin, ahead) < 1.2) {
    return getBearing(remaining[0], remaining[remaining.length - 1]);
  }
  return getBearing(origin, ahead);
}

export function smoothAngle(current, target, factor = 0.25) {
  const diff = ((target - current + 540) % 360) - 180;
  return (current + diff * factor + 360) % 360;
}

export function formatEtaMinutes(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '< 1 min';
  if (minutes === 1) return '1 min';
  return `${minutes} min`;
}

export function formatDistanceKm(meters) {
  if (!Number.isFinite(meters)) return null;
  if (meters < 1000) return `${Math.max(50, Math.round(meters / 50) * 50)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function getProximityMessage(distanceMeters, status) {
  if (status === 'accepted') return 'Tu chofer se está preparando';
  if (status === 'completed') return 'Llegaste a tu destino';
  if (status === 'cancelled') return 'Este viaje fue cancelado';
  if (!Number.isFinite(distanceMeters)) return 'El chofer va en camino';

  if (distanceMeters <= 50) return 'Tu chofer llegó — salí a encontrarlo';
  if (distanceMeters <= 180) return 'A la vuelta de la esquina';
  if (distanceMeters <= 900) return 'Tu chofer se acerca';
  return 'El chofer va en camino a buscarte';
}

export function lerpPos(from, to, t) {
  return {
    lat: from.lat + (to.lat - from.lat) * t,
    lng: from.lng + (to.lng - from.lng) * t,
  };
}
