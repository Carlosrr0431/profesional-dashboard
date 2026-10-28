/** Viaje derivado solo con una nota: sin origen ni destino geocodificados. */

export const NOTE_ONLY_MARKER = '[NOTE_ONLY]';
export const NOTE_ONLY_DISPATCH_RADIUS_KM = 25;

/** Ancla de despacho en Salta Capital. No es un retiro: el chofer no navega hasta acá. */
export const SALTA_NOTE_ANCHOR = { lat: -24.7891, lng: -65.4106 };

export function isNoteOnlyTrip(trip) {
  if (!trip) return false;
  if (String(trip.notes || '').includes(NOTE_ONLY_MARKER)) return true;
  const context = trip.wa_context;
  if (context && typeof context === 'object' && context.note_only === true) return true;
  return false;
}

export function buildNoteOnlyQueuedTrip({ notes } = {}) {
  const text = String(notes || '').trim().slice(0, 800);
  if (!text) {
    const error = new Error('Escribí la nota del viaje.');
    error.reason = 'missing_note';
    throw error;
  }

  return {
    status: 'queued',
    dispatch_status: 'queued',
    origin_address: text,
    origin_lat: SALTA_NOTE_ANCHOR.lat,
    origin_lng: SALTA_NOTE_ANCHOR.lng,
    destination_address: null,
    destination_lat: null,
    destination_lng: null,
    passenger_name: null,
    passenger_phone: null,
    notes: [NOTE_ONLY_MARKER, '[DASHBOARD]', '[FREE_RIDE]', text].join('\n'),
    price: null,
    distance_km: null,
    duration_minutes: null,
    wa_context: { source: 'dashboard', note_only: true },
    next_dispatch_at: new Date().toISOString(),
  };
}
