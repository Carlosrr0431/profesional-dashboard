/**
 * Payload canónico para viajes APPROACH_ONLY.
 * - WhatsApp / panel: origin_* = recogida; destination_* = destino final (si existe).
 * - passenger_app: mismo esquema explícito + marcadores en notes.
 */

import {
  buildFinalDestJsonMarker,
  buildPickupJsonMarker,
  buildWaypointsJsonMarker,
  notesContainFinalDestJson,
  notesContainPickupJson,
  notesContainWaypointsJson,
  normalizeWaypointList,
} from '../../shared/trip-contract.js';

function sanitizeExtraNotes(notes) {
  return String(notes || '')
    .replace(/\[PASSENGER_APP\]/gi, '')
    .replace(/\[APPROACH_ONLY\]/gi, '')
    .replace(/\[DASHBOARD\]/gi, '')
    .trim();
}

const SOURCE_DEFAULT_NOTES = {
  whatsapp: 'En cola de espera. Retiro confirmado.',
  passenger_app: 'Solicitado desde la app de pasajeros.',
  dashboard: 'Viaje ingresado desde el panel de operaciones.',
};

function normalizeLocation(location) {
  if (!location) return null;
  const lat = Number(location.lat ?? location.latitude);
  const lng = Number(location.lng ?? location.longitude);
  const formattedAddress = String(
    location.formattedAddress || location.address || ''
  ).trim();
  if (!formattedAddress || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { formattedAddress, lat, lng };
}

/**
 * Arma notes al estilo WhatsApp cuando hay recogida + destino final geocodificados.
 */
export function buildApproachOnlyTripNotes({
  source = 'dashboard',
  pickupLocation = null,
  finalDestinationLocation = null,
  finalDestJsonPrebuilt = null,
  destinationHint = null,
  extraNotes = null,
  additionalLines = [],
  waypoints = [],
}) {
  const markers = ['[APPROACH_ONLY]'];
  if (source === 'passenger_app') markers.push('[PASSENGER_APP]');
  if (source === 'dashboard') markers.push('[DASHBOARD]');

  const cleanedExtra = sanitizeExtraNotes(extraNotes);
  const bodyLine = cleanedExtra || SOURCE_DEFAULT_NOTES[source] || SOURCE_DEFAULT_NOTES.dashboard;

  const noteParts = [...markers, bodyLine, ...additionalLines.filter(Boolean)];

  const finalDestJson =
    finalDestJsonPrebuilt
    || (finalDestinationLocation
      ? buildFinalDestJsonMarker({
          address:
            finalDestinationLocation.formattedAddress
            || finalDestinationLocation.address,
          lat: finalDestinationLocation.lat,
          lng: finalDestinationLocation.lng,
        })
      : null);

  const pickupJson =
    pickupLocation
      ? buildPickupJsonMarker({
          address: pickupLocation.formattedAddress || pickupLocation.address,
          lat: pickupLocation.lat,
          lng: pickupLocation.lng,
        })
      : null;

  const notesText = noteParts.filter(Boolean).join('\n');

  if (pickupJson && !notesContainPickupJson(notesText)) {
    noteParts.push(pickupJson);
  }

  if (finalDestJson && !notesContainFinalDestJson(notesText)) {
    noteParts.push(finalDestJson);
  } else if (destinationHint && !notesContainFinalDestJson(notesText)) {
    noteParts.push(`Destino final sugerido: ${destinationHint}`);
  }

  const waypointsJson = buildWaypointsJsonMarker(waypoints);
  if (waypointsJson && !notesContainWaypointsJson(notesText)) {
    noteParts.push(waypointsJson);
  }

  return noteParts.filter(Boolean).join('\n');
}

/**
 * INSERT/UPDATE en trips para viaje en cola con recogida + destino (modelo WhatsApp).
 */
export function buildApproachOnlyTripInsertPayload({
  pickupLocation,
  finalDestinationLocation = null,
  passengerName,
  passengerPhone,
  fare = null,
  source = 'dashboard',
  destinationHint = null,
  extraNotes = null,
  finalDestJsonPrebuilt = null,
  additionalLines = [],
  waypoints = [],
}) {
  const pickup = normalizeLocation(pickupLocation);
  if (!pickup) {
    throw new Error('pickupLocation inválida para APPROACH_ONLY');
  }

  const finalDest = finalDestinationLocation
    ? normalizeLocation(finalDestinationLocation)
    : null;

  const isPassengerApp = source === 'passenger_app';
  if (isPassengerApp && !finalDest) {
    throw new Error('finalDestinationLocation requerida para passenger_app');
  }

  const locationFields = isPassengerApp
    ? {
        origin_address: pickup.formattedAddress,
        origin_lat: pickup.lat,
        origin_lng: pickup.lng,
        destination_address: finalDest.formattedAddress,
        destination_lat: finalDest.lat,
        destination_lng: finalDest.lng,
      }
    : {
        origin_address: pickup.formattedAddress,
        origin_lat: pickup.lat,
        origin_lng: pickup.lng,
        destination_address: finalDest?.formattedAddress ?? null,
        destination_lat: finalDest?.lat ?? null,
        destination_lng: finalDest?.lng ?? null,
      };

  return {
    driver_id: null,
    passenger_name: passengerName || 'Pasajero',
    passenger_phone: passengerPhone || null,
    ...locationFields,
    status: 'queued',
    dispatch_status: 'queued',
    assigned_at: null,
    accepted_at: null,
    price: fare?.price ?? null,
    commission_amount: fare?.commission_amount ?? null,
    distance_km: fare?.distance_km ?? null,
    duration_minutes: fare?.duration_minutes ?? null,
    notes: buildApproachOnlyTripNotes({
      source,
      pickupLocation: pickup,
      finalDestinationLocation: finalDest,
      finalDestJsonPrebuilt,
      destinationHint,
      extraNotes,
      additionalLines,
      waypoints: normalizeWaypointList(waypoints),
    }),
  };
}

/** Combina tarifa calculada en servidor con estimación enviada por la app. */
export function mergePassengerRouteFare(serverFare, clientFare) {
  if (!serverFare && !clientFare) return null;
  if (!clientFare) return serverFare;
  if (!serverFare) return clientFare;

  return {
    price: clientFare.price ?? serverFare.price,
    distance_km: clientFare.distance_km ?? serverFare.distance_km,
    duration_minutes: clientFare.duration_minutes ?? serverFare.duration_minutes,
    commission_amount: serverFare.commission_amount ?? clientFare.commission_amount ?? null,
  };
}
