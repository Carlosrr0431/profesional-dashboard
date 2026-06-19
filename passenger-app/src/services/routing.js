import { readDashboardUrl } from '../../../shared/geo/dashboardGeoApi';
import { decodePolyline } from './googleMaps';
import { pickPassengerFareRoute } from '../../../shared/salta-route';

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

/**
 * Obtiene ruta de manejo vía OSRM (dashboard /api/geo/directions).
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

    const qs = new URLSearchParams({
      originLat: String(from.lat),
      originLng: String(from.lng),
      destLat: String(to.lat),
      destLng: String(to.lng),
      alternatives: 'true',
    });

    if (waypointCoords.length > 0) {
      qs.set(
        'waypoints',
        waypointCoords.map((point) => `${point.lat},${point.lng}`).join('|'),
      );
    }

    const response = await fetch(
      `${readDashboardUrl()}/api/geo/directions?${qs.toString()}`,
      { headers: { Accept: 'application/json' } },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false || !payload?.data) {
      return null;
    }

    const data = payload.data;
    const distanceValue = Math.round(Number(data.distanceValue) || 0);
    const durationValue = Math.round(Number(data.durationValue) || 0);
    if (!distanceValue) return null;

    return {
      distance: formatMeters(distanceValue),
      duration: formatSeconds(durationValue),
      distanceValue,
      durationValue,
      polylineCoords: Array.isArray(data.polylineCoords) ? data.polylineCoords : [],
      legCount: Number(data.legCount) || 1,
    };
  } catch {
    return null;
  }
}
