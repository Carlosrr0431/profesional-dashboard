import { OSRM_BASE_URL } from '../utils/mapConfig';
import { decodePolyline } from './googleMaps';
import { pickPassengerFareRoute } from '../../../shared/salta-route';

const ROUTE_TIMEOUT_MS = 20000;

function toLatLng(point) {
  const lat = Number(point?.lat ?? point?.latitude);
  const lng = Number(point?.lng ?? point?.longitude);
  return { lat, lng };
}

function formatMeters(meters) {
  const value = Math.round(Number(meters) || 0);
  if (value < 1000) return `${value} m`;
  const km = value / 1000;
  return `${km >= 10 ? Math.round(km) : km.toFixed(1)} km`;
}

function formatSeconds(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total < 60) return `${total} s`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours} h ${mins} min` : `${hours} h`;
}

function sumOsrmLegMetrics(legs = []) {
  let distanceValue = 0;
  let durationValue = 0;
  for (const leg of legs) {
    distanceValue += Math.round(Number(leg?.distance) || 0);
    durationValue += Math.round(Number(leg?.duration) || 0);
  }
  return { distanceValue, durationValue };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = ROUTE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Obtiene ruta de manejo vía OSRM (perfil driving).
 * Soporta paradas intermedias y selección de ruta para tarifa (salta-route).
 */
export async function getDirections(origin, destination, waypoints = []) {
  try {
    const from = toLatLng(origin);
    const to = toLatLng(destination);

    if (![from.lat, from.lng, to.lat, to.lng].every(Number.isFinite)) {
      return null;
    }

    const waypointCoords = (waypoints || [])
      .map((point) => toLatLng(point))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));

    const pathPoints = [from, ...waypointCoords, to];
    const coordinates = pathPoints.map((point) => `${point.lng},${point.lat}`).join(';');

    const params = new URLSearchParams({
      steps: 'false',
      overview: 'full',
      geometries: 'polyline',
      alternatives: 'true',
      annotations: 'false',
    });

    const response = await fetchWithTimeout(
      `${OSRM_BASE_URL}/route/v1/driving/${coordinates}?${params.toString()}`,
    );
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.code !== 'Ok' || !data?.routes?.length) {
      return null;
    }

    const route = pickPassengerFareRoute(data.routes) || data.routes[0];
    const legs = Array.isArray(route.legs) ? route.legs : [];
    const { distanceValue, durationValue } = legs.length > 0
      ? sumOsrmLegMetrics(legs)
      : {
        distanceValue: Math.round(Number(route.distance) || 0),
        durationValue: Math.round(Number(route.duration) || 0),
      };

    if (!distanceValue) return null;

    return {
      distance: formatMeters(distanceValue),
      duration: formatSeconds(durationValue),
      distanceValue,
      durationValue,
      polylineCoords: route.geometry ? decodePolyline(route.geometry) : [],
      legCount: legs.length || 1,
    };
  } catch {
    return null;
  }
}
