import {
  SALTA_CAPITAL_GEOCODE_BOUNDS,
  isWithinSaltaCapital,
} from './constants';
import {
  buildFinalDestJsonMarker,
  notesContainFinalDestJson,
} from '../../shared/trip-contract.js';
import {
  buildApproachOnlyTripInsertPayload,
  mergePassengerRouteFare,
} from './approachOnlyTripPayload.js';
import {
  pickPassengerFareRoute,
  sumOsrmRouteMetrics,
} from '../../shared/salta-route.js';
import {
  geocodeAddress,
  geocodeAddressMultiple,
  getPlaceDetails,
  getRouteMetrics as getOsrmRouteMetrics,
  getRouteAlternatives,
} from './geo/index.js';

function sanitizeText(value, maxLen = 500) {
  return String(value || '').trim().slice(0, maxLen);
}

export function buildFinalDestJsonTag(location) {
  if (!location) return null;
  return buildFinalDestJsonMarker({
    address: location.formattedAddress || location.address,
    lat: location.lat,
    lng: location.lng,
  });
}

/** Destino final enviado por la app (coordenadas) sin llamar a geocodificación. */
export function resolveFinalDestinationFromClient(payload) {
  const address = sanitizeText(payload?.destinationAddress || payload?.destinationHint);
  const lat = Number(payload?.destinationLat);
  const lng = Number(payload?.destinationLng);
  if (!address || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  if (!isWithinSaltaCapital(lat, lng)) {
    return null;
  }
  return {
    formattedAddress: address,
    lat,
    lng,
  };
}

export async function resolveTripLocation({ address, lat, lng, placeId }) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  const cleanAddress = sanitizeText(address);

  if (
    Number.isFinite(parsedLat)
    && Number.isFinite(parsedLng)
    && cleanAddress
    && isWithinSaltaCapital(parsedLat, parsedLng)
  ) {
    return {
      formattedAddress: cleanAddress,
      lat: parsedLat,
      lng: parsedLng,
    };
  }

  try {
    if (sanitizeText(placeId)) {
      const details = await getPlaceDetails(sanitizeText(placeId, 200));
      if (isWithinSaltaCapital(details.lat, details.lng)) {
        return {
          formattedAddress: details.formattedAddress || cleanAddress,
          lat: details.lat,
          lng: details.lng,
        };
      }
    }

    if (cleanAddress) {
      const resolved = await geocodeAddress(
        /salta/i.test(cleanAddress) ? cleanAddress : `${cleanAddress}, Salta, Argentina`,
      );
      if (isWithinSaltaCapital(resolved.lat, resolved.lng)) {
        return {
          formattedAddress: resolved.formattedAddress || cleanAddress,
          lat: resolved.lat,
          lng: resolved.lng,
        };
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function getRouteMetrics(origin, destination, waypoints = []) {
  const waypointCoords = (waypoints || [])
    .map((point) => {
      const lat = Number(point?.lat);
      const lng = Number(point?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    })
    .filter(Boolean);

  if (waypointCoords.length > 0) {
    return getOsrmRouteMetrics(origin, destination, waypointCoords);
  }

  try {
    const routes = await getRouteAlternatives(origin, destination);
    if (!routes.length) return null;

    const route = pickPassengerFareRoute(routes) || routes[0];
    const { distanceValue, durationValue } = sumOsrmRouteMetrics(route);

    return {
      distanceKm: Math.round((distanceValue / 1000) * 10) / 10,
      durationMinutes: Math.round(durationValue / 60),
    };
  } catch {
    return null;
  }
}

function calculateTripPricing(settings, route) {
  const tariffPerKm = Number(settings?.passenger_app_tariff_per_km || 0);
  const tariffBase = Number(settings?.passenger_app_tariff_base || 0);
  const commissionPercent = Number(settings?.passenger_app_commission_percent || 10);

  if (route?.distanceKm == null) return null;

  const price = Math.round(tariffBase + tariffPerKm * route.distanceKm);
  const commission_amount = Math.round((price * commissionPercent) / 100);

  return {
    price,
    commission_amount,
    distance_km: route.distanceKm,
    duration_minutes: route.durationMinutes,
  };
}

export async function resolvePassengerRouteFare(
  supabase,
  pickupLocation,
  finalDestinationLocation,
  waypoints = []
) {
  if (!pickupLocation || !finalDestinationLocation) return null;

  const route = await getRouteMetrics(
    { lat: pickupLocation.lat, lng: pickupLocation.lng },
    { lat: finalDestinationLocation.lat, lng: finalDestinationLocation.lng },
    waypoints
  );
  if (!route) return null;

  const { data: settingsRows, error } = await supabase.from('settings').select('key, value');
  if (error) throw error;

  const settings = Object.fromEntries((settingsRows || []).map((r) => [r.key, r.value]));
  return calculateTripPricing(settings, route);
}

/** Intenta obtener destino final por geocode o por ruta OSRM entre direcciones. */
export async function resolveFinalDestination(pickupLocation, payload) {
  const fromClient = resolveFinalDestinationFromClient(payload);
  if (fromClient) return fromClient;

  const address = sanitizeText(payload?.destinationAddress || payload?.destinationHint);
  if (!address) return null;

  const fromCoords = await resolveTripLocation({
    address,
    lat: payload?.destinationLat,
    lng: payload?.destinationLng,
    placeId: payload?.destinationPlaceId,
  });
  if (fromCoords) return fromCoords;

  if (!pickupLocation) return null;

  try {
    const candidates = await geocodeAddressMultiple(
      /salta/i.test(address) ? address : `${address}, Salta, Argentina`,
      3,
    );
    const match = candidates.find((c) => isWithinSaltaCapital(c.lat, c.lng));
    if (match) {
      return {
        formattedAddress: match.formattedAddress || address,
        lat: match.lat,
        lng: match.lng,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export async function resolveWaypointsFromClient(payload) {
  const raw = Array.isArray(payload?.waypoints) ? payload.waypoints : [];
  if (raw.length === 0) return [];

  const resolved = [];
  for (const waypoint of raw.slice(0, 8)) {
    const fromClient = await resolveTripLocation({
      address: waypoint?.address,
      lat: waypoint?.lat,
      lng: waypoint?.lng,
      placeId: waypoint?.placeId,
    });
    if (!fromClient) return null;
    resolved.push({
      address: fromClient.formattedAddress,
      lat: fromClient.lat,
      lng: fromClient.lng,
    });
  }

  return resolved;
}

function resolveTripSource(payload) {
  if (payload?.source === 'passenger_app') return 'passenger_app';
  if (payload?.source === 'whatsapp') return 'whatsapp';
  const notes = String(payload?.notes || '');
  if (notes.includes('[PASSENGER_APP]')) return 'passenger_app';
  return 'dashboard';
}

/**
 * Viaje en cola con recogida + destino (misma lógica que WhatsApp persistQueuedApproachTrip).
 */
export function buildPassengerQueuedTripPayload({
  pickupLocation,
  finalDestinationLocation,
  passengerName,
  passengerPhone,
  notes,
  destinationHint,
  fare,
  source,
  payload,
  waypoints = [],
}) {
  return buildApproachOnlyTripInsertPayload({
    pickupLocation,
    finalDestinationLocation,
    passengerName,
    passengerPhone,
    fare,
    source: 'passenger_app',
    destinationHint,
    extraNotes: sanitizeText(notes) || null,
    waypoints,
  });
}

export function fareFromClientPayload(payload) {
  const price = Number(payload?.estimatedPrice);
  const distanceKm = Number(payload?.distanceKm);
  const durationMinutes = Number(payload?.durationMinutes);
  if (!Number.isFinite(price) || price <= 0) return null;

  return {
    price: Math.round(price),
    commission_amount: null,
    distance_km: Number.isFinite(distanceKm) ? distanceKm : null,
    duration_minutes: Number.isFinite(durationMinutes) ? Math.round(durationMinutes) : null,
  };
}

export { mergePassengerRouteFare, notesContainFinalDestJson };
