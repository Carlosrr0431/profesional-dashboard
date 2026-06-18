const DASHBOARD_URL =
  process.env.EXPO_PUBLIC_DASHBOARD_URL || 'https://profesional-dashboard.vercel.app';

/**
 * Crea un viaje llamando al endpoint del dashboard.
 * Usa el mismo flujo que el panel de operaciones (create-queued).
 */
export const createTripViaApi = async ({
  pickupAddress,
  pickupLat,
  pickupLng,
  pickupPlaceId,
  destinationAddress,
  destinationLat,
  destinationLng,
  destinationPlaceId,
  destinationHint,
  waypoints,
  estimatedPrice,
  distanceKm,
  durationMinutes,
  passengerName,
  passengerPhone,
  notes,
}) => {
  const resolvedDestination =
    destinationAddress || destinationHint || null;

  const body = {
    source: 'passenger_app',
    pickupAddress,
    pickupLat,
    pickupLng,
    placeId: pickupPlaceId || null,
    destinationAddress: resolvedDestination,
    destinationLat: destinationLat ?? null,
    destinationLng: destinationLng ?? null,
    destinationPlaceId: destinationPlaceId || null,
    passengerName: passengerName || 'Pasajero',
    passengerPhone: passengerPhone || null,
    destinationHint: resolvedDestination,
    waypoints: Array.isArray(waypoints) && waypoints.length > 0
      ? waypoints.map((wp) => ({
          address: wp.address,
          lat: wp.lat,
          lng: wp.lng,
          placeId: wp.placeId || null,
        }))
      : undefined,
    estimatedPrice: estimatedPrice ?? null,
    distanceKm: distanceKm ?? null,
    durationMinutes: durationMinutes ?? null,
    notes: notes || null,
  };

  const response = await fetch(`${DASHBOARD_URL}/api/trips/create-queued`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(
      data.message || `Error del servidor (${response.status})`
    );
  }

  return data.trip;
};

/** Estado del viaje vía API pública (service role). Fallback si Realtime/RLS fallan. */
export const fetchTripViaTracking = async (tokenOrTripId) => {
  const key = String(tokenOrTripId || '').trim();
  if (!key) return null;

  try {
    const response = await fetch(
      `${DASHBOARD_URL}/api/public-tracking/${encodeURIComponent(key)}`,
      { cache: 'no-store' }
    );
    const data = await response.json();
    if (!response.ok || !data?.ok || !data?.data?.trip) return null;
    return data.data.trip;
  } catch (error) {
    console.warn('fetchTripViaTracking:', error?.message || error);
    return null;
  }
};

/** Cancela un viaje vía dashboard (service role): saca de cola y evita re-dispatch. */
export const cancelTripViaApi = async (tripId) => {
  const response = await fetch(`${DASHBOARD_URL}/api/trips/cancel-passenger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tripId }),
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(
      data.message || `Error del servidor (${response.status})`
    );
  }

  return data.trip;
};
