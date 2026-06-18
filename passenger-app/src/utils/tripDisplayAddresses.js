/**
 * Direcciones para mostrar en UI del pasajero.
 * Viajes [PASSENGER_APP]: recogida = origin_* / PICKUP_JSON, destino = destination_* / FINAL_DEST_JSON.
 * Viajes WhatsApp [APPROACH_ONLY]: recogida = destination_*, destino en notes.
 */

function parseJsonMarker(notes, prefix) {
  const src = String(notes || '');
  const start = src.indexOf(prefix);
  if (start === -1) return null;
  const jsonStart = start + prefix.length;
  const jsonEnd = src.indexOf(']', jsonStart);
  if (jsonEnd === -1) return null;
  try {
    return JSON.parse(src.slice(jsonStart, jsonEnd));
  } catch {
    return null;
  }
}

export function isPassengerAppTripNotes(notes) {
  return String(notes || '').includes('[PASSENGER_APP]');
}

/** Texto de recogida para la UI — nunca usa destination_* en viajes de la app. */
export function getTripPickupDisplayAddress(trip) {
  if (!trip) return null;

  const notes = String(trip.notes || '');

  if (isPassengerAppTripNotes(notes)) {
    const pickupJson = parseJsonMarker(notes, '[PICKUP_JSON:');
    const fromJson = String(pickupJson?.address || '').trim();
    if (fromJson) return fromJson;

    const origin = String(trip.origin_address || '').trim();
    if (origin && !/^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(origin)) {
      return origin;
    }
    return origin || null;
  }

  if (notes.toLowerCase().includes('[approach_only]')) {
    const dest = String(trip.destination_address || '').trim();
    if (dest) return dest;
  }

  const origin = String(trip.origin_address || '').trim();
  return origin || String(trip.destination_address || '').trim() || null;
}

/** Texto de destino final para la UI. */
export function getTripDestinationDisplayAddress(trip) {
  if (!trip) return null;

  const notes = String(trip.notes || '');

  if (isPassengerAppTripNotes(notes)) {
    const dest = String(trip.destination_address || '').trim();
    if (dest) return dest;

    const finalJson = parseJsonMarker(notes, '[FINAL_DEST_JSON:');
    const fromJson = String(finalJson?.address || '').trim();
    if (fromJson) return fromJson;
    return null;
  }

  const finalJson = parseJsonMarker(notes, '[FINAL_DEST_JSON:');
  const fromJson = String(finalJson?.address || '').trim();
  if (fromJson) return fromJson;

  const hint = notes.match(/Destino final sugerido:\s*(.+?)(?:\n|$)/i);
  if (hint?.[1]) return hint[1].trim();

  return String(trip.destination_address || '').trim() || null;
}
