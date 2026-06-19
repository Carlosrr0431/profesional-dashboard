/**
 * Utilidades de coordenadas para react-native-maps.
 */

export function normalizeCoordinate(point) {
  if (!point) return null;
  const lat = Number(point.lat ?? point.latitude);
  const lng = Number(point.lng ?? point.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { latitude: lat, longitude: lng };
}

/** @deprecated Usar normalizeCoordinate */
export function toLngLat(point) {
  const coord = normalizeCoordinate(point);
  if (!coord) return null;
  return [coord.longitude, coord.latitude];
}

export function normalizeCoords(coords = []) {
  return coords.map(normalizeCoordinate).filter(Boolean);
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

/** Distancia aproximada en metros entre dos puntos {latitude, longitude}. */
export function distanceMeters(a, b) {
  if (!a || !b) return 0;
  const lat1 = Number(a.latitude);
  const lng1 = Number(a.longitude);
  const lat2 = Number(b.latitude);
  const lng2 = Number(b.longitude);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return 0;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Inserta puntos intermedios para que la polilínea se vea más suave en el mapa.
 */
export function densifyRouteCoords(coords = [], maxSegmentMeters = 20) {
  const normalized = normalizeCoords(coords);
  if (normalized.length < 2) return normalized;

  const maxSeg = Math.max(8, Number(maxSegmentMeters) || 20);
  const result = [normalized[0]];

  for (let i = 1; i < normalized.length; i += 1) {
    const prev = result[result.length - 1];
    const curr = normalized[i];
    const span = distanceMeters(prev, curr);

    if (span <= maxSeg) {
      result.push(curr);
      continue;
    }

    const steps = Math.ceil(span / maxSeg);
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      result.push({
        latitude: prev.latitude + (curr.latitude - prev.latitude) * t,
        longitude: prev.longitude + (curr.longitude - prev.longitude) * t,
      });
    }
  }

  return result;
}

export function getRouteBounds(coords = []) {
  const normalized = normalizeCoords(coords);
  if (normalized.length === 0) return null;

  let minLat = normalized[0].latitude;
  let maxLat = normalized[0].latitude;
  let minLng = normalized[0].longitude;
  let maxLng = normalized[0].longitude;

  for (let i = 1; i < normalized.length; i += 1) {
    const point = normalized[i];
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  }

  return { minLat, maxLat, minLng, maxLng };
}

export function regionFromRouteBounds(bounds, {
  paddingFactor = 1.22,
  minLatitudeDelta = 0.0045,
  minLongitudeDelta = 0.0045,
  maxLatitudeDelta = 0.065,
  maxLongitudeDelta = 0.065,
} = {}) {
  if (!bounds) return null;

  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.001);
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.001);

  return {
    latitude: (bounds.minLat + bounds.maxLat) / 2,
    longitude: (bounds.minLng + bounds.maxLng) / 2,
    latitudeDelta: Math.min(
      Math.max(latSpan * paddingFactor, minLatitudeDelta),
      maxLatitudeDelta,
    ),
    longitudeDelta: Math.min(
      Math.max(lngSpan * paddingFactor, minLongitudeDelta),
      maxLongitudeDelta,
    ),
  };
}

/** Límites aproximados de Salta Capital para descartar puntos erróneos de rutas. */
export const SALTA_CAPITAL_BOUNDS = {
  minLat: -24.9,
  maxLat: -24.67,
  minLng: -65.58,
  maxLng: -65.27,
};

export function isCoordInSaltaCapital(coord) {
  if (!coord) return false;
  const lat = Number(coord.latitude);
  const lng = Number(coord.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= SALTA_CAPITAL_BOUNDS.minLat
    && lat <= SALTA_CAPITAL_BOUNDS.maxLat
    && lng >= SALTA_CAPITAL_BOUNDS.minLng
    && lng <= SALTA_CAPITAL_BOUNDS.maxLng;
}

export function filterCoordsInSaltaCapital(coords = []) {
  return normalizeCoords(coords).filter(isCoordInSaltaCapital);
}

export function regionToInitialViewState(region) {
  if (!region) return null;
  const lat = Number(region.latitude);
  const lng = Number(region.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const latDelta = Number(region.latitudeDelta) || 0.02;
  const zoom = Math.round(Math.log2(360 / latDelta));

  return {
    center: [lng, lat],
    zoom: Math.max(10, Math.min(18, zoom)),
    bearing: 0,
    pitch: 0,
  };
}
