/** Dos retiros a esta distancia pueden compartir un chofer del radio de 2 km. */
export const OFFER_LINE_SEPARATION_KM = 4;

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function createdAtMs(trip) {
  const parsed = Date.parse(trip?.createdAt || trip?.created_at || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function turnOf(trip) {
  const turn = Math.round(Number(trip?.turn ?? trip?.wa_context?.dispatch_line_turn) || 0);
  return Number.isFinite(turn) && turn > 0 ? turn : 0;
}

function offeredAtMs(trip) {
  const parsed = Date.parse(trip?.offeredAt || trip?.wa_context?.dispatch_line_offered_at || '');
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Viajes que comparten choferes (retiros a ≤ separationKm) forman una fila.
 * Los que no tienen punto van en una fila aparte.
 */
export function clusterTripsForOfferLine(trips, separationKm = OFFER_LINE_SEPARATION_KM) {
  const located = [];
  const unlocated = [];
  for (const trip of trips || []) {
    if (!trip?.id) continue;
    const lat = Number(trip.lat ?? trip.pickupLat);
    const lng = Number(trip.lng ?? trip.pickupLng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) located.push({ ...trip, lat, lng });
    else unlocated.push(trip);
  }

  const parent = located.map((_, index) => index);
  const find = (index) => {
    let cursor = index;
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]];
      cursor = parent[cursor];
    }
    return cursor;
  };

  const limit = Number(separationKm);
  for (let i = 0; i < located.length; i += 1) {
    for (let j = i + 1; j < located.length; j += 1) {
      if (!Number.isFinite(limit) || haversineKm(located[i].lat, located[i].lng, located[j].lat, located[j].lng) > limit) {
        continue;
      }
      const a = find(i);
      const b = find(j);
      if (a !== b) parent[b] = a;
    }
  }

  const groups = new Map();
  located.forEach((trip, index) => {
    const root = find(index);
    const list = groups.get(root) || [];
    list.push(trip);
    groups.set(root, list);
  });
  const result = [...groups.values()];
  if (unlocated.length) result.push(unlocated);
  return result;
}

/**
 * El primero de la fila es el de menos vueltas y, a igual vuelta, el más viejo.
 * Un viaje nuevo que entra cuando los demás ya tuvieron turno se suma al final
 * de esa vuelta, no se cuela adelante.
 */
export function prepareOfferLine(trips) {
  const ranked = (trips || [])
    .filter((trip) => trip?.id)
    .map((trip) => ({
      ...trip,
      id: String(trip.id),
      createdAtMs: createdAtMs(trip),
      turn: turnOf(trip),
    }));
  if (!ranked.length) return { head: null, order: [], updates: [] };

  const shown = ranked.filter((trip) => trip.turn > 0);
  const minShownTurn = shown.reduce((min, trip) => Math.min(min, trip.turn), Infinity);
  const firstShownAt = shown.reduce((min, trip) => {
    const offered = offeredAtMs(trip);
    if (offered == null) return min;
    return min == null ? offered : Math.min(min, offered);
  }, null);
  const updates = [];
  const normalized = ranked.map((trip) => {
    const arrivedAfterRound = firstShownAt != null && trip.createdAtMs > firstShownAt;
    if (trip.turn === 0 && minShownTurn > 0 && arrivedAfterRound) {
      updates.push({ id: trip.id, turn: minShownTurn });
      return { ...trip, turn: minShownTurn };
    }
    return trip;
  });

  normalized.sort((a, b) => (
    a.turn - b.turn
    || a.createdAtMs - b.createdAtMs
    || a.id.localeCompare(b.id)
  ));

  return { head: normalized[0], order: normalized, updates };
}

export function stampDispatchOfferLine(waContext, now = new Date()) {
  const context = waContext && typeof waContext === 'object' && !Array.isArray(waContext)
    ? waContext
    : {};
  const turn = turnOf({ wa_context: context }) + 1;
  const instant = now instanceof Date ? now : new Date(now);
  return {
    ...context,
    dispatch_line_turn: turn,
    dispatch_line_offered_at: instant.toISOString(),
    dispatch_line_holding: false,
  };
}
