/**
 * Sesión de WhatsApp de remis (equivalente a order-session de Multicarnes).
 * El tiempo no entra: el contexto se limpia solo con un pedido de viaje nuevo.
 */

export const CLOSED_TRIP_STATUSES = ['completed', 'cancelled'];
export const SESSION_OPEN_TRIP_STATUSES = [
  'scheduled',
  'queued',
  'pending',
  'accepted',
  'going_to_pickup',
  'in_progress',
];

const FOLLOWUP_INTENTS = new Set([
  'status_query',
  'cancel_trip',
  'price_inquiry',
  'ask_human',
  'other',
]);

export function isExactTrue(value) {
  return value === true || value === 'true';
}

export function isClosedTripStatus(status) {
  return CLOSED_TRIP_STATUSES.includes(String(status || '').toLowerCase());
}

export function isSessionOpenTripStatus(status) {
  return SESSION_OPEN_TRIP_STATUSES.includes(String(status || '').toLowerCase());
}

export function startFreshTripContext(prev = {}) {
  const src = prev && typeof prev === 'object' ? prev : {};
  return {
    already_greeted: Boolean(src.already_greeted),
    passenger_name: src.passenger_name || null,
    previous_trip_id: src.last_trip_id || src.previous_trip_id || null,
    last_activity_at: new Date().toISOString(),
  };
}

/**
 * Limpia contexto solo si hay un viaje nuevo. Preguntas, acuses y cotización
 * sobre el pedido actual no resetean.
 */
export function shouldStartNewTrip(classified = {}, lastTripStatus = null, context = {}, opts = {}) {
  const intent = String(classified?.intent || '');
  if (FOLLOWUP_INTENTS.has(intent)) return false;
  if (isExactTrue(classified.new_trip)) return true;
  if (opts.hasOpenTrip) return false;
  if (context.awaiting_pickup_number || context.awaiting_gps) return false;
  if (intent === 'trip_request' || intent === 'schedule_trip') return true;
  return false;
}

export function pickTripForStatus({ openTrip = null, lastTrip = null, lastClosedTrip = null } = {}) {
  if (openTrip && isSessionOpenTripStatus(openTrip.status)) return openTrip;
  if (lastTrip) return lastTrip;
  return lastClosedTrip || null;
}

export function messagesToIntentHistory(rows = [], { pendingContents = [], limit = 12 } = {}) {
  const pendingSet = new Set((pendingContents || []).map((text) => String(text || '').trim()).filter(Boolean));
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => {
      const text = String(row?.transcription || row?.content || '').trim();
      if (!text) return false;
      if (row.direction === 'incoming' && pendingSet.has(text)) return false;
      return true;
    })
    .slice(-limit)
    .map((row) => ({
      direction: row.direction,
      content: row.content,
      transcription: row.transcription,
    }));
}

export function statusQueryReplyForTrip(trip, extractedReply = null) {
  if (extractedReply) return extractedReply;
  if (!trip) {
    return 'No tenés un viaje activo. Si querés un móvil, mandame calle y altura o tu ubicación GPS.';
  }
  const status = String(trip.status || '').toLowerCase();
  if (status === 'completed') {
    return 'Tu último viaje ya está completado. Si querés otro móvil, mandame desde dónde te busco.';
  }
  if (status === 'cancelled') {
    return 'Ese viaje quedó cancelado. Si querés otro móvil, mandame calle y altura o tu ubicación GPS.';
  }
  if (status === 'scheduled') {
    return 'Tu reserva sigue programada. Te aviso cuando salga el móvil.';
  }
  if (status === 'queued') {
    return 'Estamos buscando móvil. Te aviso apenas se asigne un chofer.';
  }
  if (status === 'pending') {
    return 'Tu pedido está tomado, esperando que el chofer lo confirme. Te aviso apenas quede asignado.';
  }
  if (status === 'accepted' || status === 'going_to_pickup') {
    return 'El chofer ya aceptó y está yendo a buscarte.';
  }
  if (status === 'in_progress') {
    return 'Tu viaje está en curso.';
  }
  return 'Tu viaje está activo.';
}
