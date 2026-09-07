import { mergeSnapshotKeepingFresherGps } from './driverMapGps';

/** Estados que pintan el pin rojo / pestaña Viaje de la flota. */
export const FLEET_ACTIVE_TRIP_STATUSES = ['accepted', 'going_to_pickup', 'in_progress'];

/** Estados del botón "N viajes" y el panel de viajes en curso. */
export const LIVE_ACTIVE_STATUSES = new Set([
  'pending',
  'accepted',
  'going_to_pickup',
  'in_progress',
]);

const REALTIME_TRIP_GUARD_MS = 2500;

function realtimeEvent(payload) {
  return String(payload?.eventType || payload?.event || '').toUpperCase();
}

function payloadRow(value) {
  return value && typeof value === 'object' ? value : null;
}

function statusOf(row) {
  return String(row?.status || '').toLowerCase();
}

function toLocalDateInputValue(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSameLocalDay(dateStr, dayStr) {
  if (!dateStr || !dayStr) return false;
  return toLocalDateInputValue(new Date(dateStr)) === dayStr;
}

function isInRange(isoDate, startIso, endIso) {
  const ms = new Date(isoDate).getTime();
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  return Number.isFinite(ms) && ms >= startMs && ms < endMs;
}

export function isFleetActiveTrip(row) {
  return Boolean(row?.driver_id) && FLEET_ACTIVE_TRIP_STATUSES.includes(statusOf(row));
}

export function isLiveActiveTrip(row) {
  return LIVE_ACTIVE_STATUSES.has(statusOf(row));
}

export function isQueuedTrip(row) {
  return statusOf(row) === 'queued' && String(row?.dispatch_status || '') !== 'hold';
}

export function toFleetActiveTrip(row) {
  if (!isFleetActiveTrip(row)) return null;
  return {
    id: row.id,
    driver_id: row.driver_id,
    status: row.status,
    passenger_name: row.passenger_name,
    destination_address: row.destination_address,
  };
}

function driverHoldsTrip(driver, tripId, relatedDriverIds) {
  if (!driver?.activeTrip) return false;
  if (tripId && driver.activeTrip.id === tripId) return true;
  if (driver.activeTrip.id) return false;
  return relatedDriverIds.has(driver.id);
}

export function applyTripRealtimeToDrivers(drivers, payload, now = Date.now()) {
  const list = Array.isArray(drivers) ? drivers : [];
  const event = realtimeEvent(payload);
  const row = payloadRow(payload?.new);
  const previous = payloadRow(payload?.old);
  const tripId = row?.id || previous?.id;
  if (!tripId) return list;

  const active = event === 'DELETE' ? null : toFleetActiveTrip(row);
  const assignedDriverId = active?.driver_id || null;
  const relatedDriverIds = new Set(
    [assignedDriverId, previous?.driver_id, row?.driver_id].filter(Boolean),
  );

  let changed = false;
  const next = list.map((driver) => {
    if (assignedDriverId && driver.id === assignedDriverId) {
      if (
        driver.activeTrip?.id === active.id
        && driver.activeTrip?.status === active.status
      ) {
        return driver;
      }
      changed = true;
      return { ...driver, activeTrip: active, activeTripAppliedAt: now };
    }

    if (driverHoldsTrip(driver, tripId, relatedDriverIds)) {
      changed = true;
      return { ...driver, activeTrip: null, activeTripAppliedAt: now };
    }

    return driver;
  });

  return changed ? next : list;
}

export function preferRealtimeActiveTrip(local, incoming, now = Date.now()) {
  if (!incoming) return incoming;
  if (!local?.activeTripAppliedAt) return incoming;
  if (now - local.activeTripAppliedAt > REALTIME_TRIP_GUARD_MS) return incoming;

  const sameTrip = (local.activeTrip?.id || null) === (incoming.activeTrip?.id || null)
    && (local.activeTrip?.status || null) === (incoming.activeTrip?.status || null);
  if (sameTrip) return incoming;

  return {
    ...incoming,
    activeTrip: local.activeTrip || null,
    activeTripAppliedAt: local.activeTripAppliedAt,
  };
}

export function mergeDriversSnapshotWithTripRealtime(prev, next, now = Date.now()) {
  const gpsMerged = mergeSnapshotKeepingFresherGps(prev, next);
  if (!prev?.length) return gpsMerged;
  const prevById = new Map(prev.map((driver) => [driver.id, driver]));
  return gpsMerged.map((incoming) => preferRealtimeActiveTrip(prevById.get(incoming.id), incoming, now));
}

export function mapLiveTripFromRow(trip, range) {
  const inSelectedRange = trip.in_selected_range === true
    || trip.in_selected_day === true
    || (range?.start && range?.end && isInRange(trip.created_at, range.start, range.end));

  return {
    id: trip.id,
    passengerName: trip.passenger_name || 'Pasajero',
    passengerPhone: trip.passenger_phone || '',
    pickupAddress: trip.destination_address || trip.origin_address || '—',
    driverOrigin: trip.origin_address || null,
    destination: trip.destination_address || null,
    status: trip.status,
    cancelReason: trip.cancel_reason || null,
    createdAt: trip.created_at,
    acceptedAt: trip.accepted_at,
    startedAt: trip.started_at,
    completedAt: trip.completed_at,
    price: trip.price != null ? Number(trip.price) : null,
    distanceKm: trip.distance_km != null ? Number(trip.distance_km) : null,
    durationMinutes: trip.duration_minutes != null ? Number(trip.duration_minutes) : null,
    commissionAmount: trip.commission_amount != null ? Number(trip.commission_amount) : null,
    notes: trip.notes || null,
    driver: trip.driver || null,
    isSelectedDay: inSelectedRange,
    isToday: isSameLocalDay(trip.created_at, toLocalDateInputValue()),
    isActive: isLiveActiveTrip(trip),
    isQueued: isQueuedTrip(trip),
  };
}

export function applyTripRealtimeToLiveList(trips, payload, range) {
  const list = Array.isArray(trips) ? trips : [];
  const event = realtimeEvent(payload);
  const row = payloadRow(payload?.new);
  const previous = payloadRow(payload?.old);

  if (event === 'DELETE') {
    const id = previous?.id || row?.id;
    if (!id) return list;
    return list.filter((item) => item.id !== id);
  }

  if (!row?.id) return list;

  const mapped = mapLiveTripFromRow(row, range);
  const idx = list.findIndex((item) => item.id === row.id);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = {
      ...list[idx],
      ...mapped,
      driver: mapped.driver || list[idx].driver,
    };
    return next;
  }

  if (mapped.isActive || mapped.isQueued || mapped.isSelectedDay) {
    return [mapped, ...list];
  }
  return list;
}

export function mapQueueItemFromRow(trip, position = 1) {
  return {
    id: trip.id,
    position,
    phone: trip.passenger_phone,
    passengerName: trip.passenger_name || 'Pasajero',
    originAddress: trip.origin_address || null,
    destinationAddress: trip.destination_address || null,
    pickupAddress: trip.origin_address || trip.destination_address || '—',
    queuedAt: trip.created_at,
    waitMinutes: 0,
    price: trip.price != null ? Number(trip.price) : null,
    distanceKm: trip.distance_km != null ? Number(trip.distance_km) : null,
    durationMinutes: trip.duration_minutes != null ? Number(trip.duration_minutes) : null,
    dispatchAttempts: trip.dispatch_attempts ?? 0,
    notes: trip.notes || null,
  };
}

function reindexQueue(queue) {
  return queue.map((item, index) => ({ ...item, position: index + 1 }));
}

export function applyTripRealtimeToQueue(queue, payload) {
  const list = Array.isArray(queue) ? queue : [];
  const event = realtimeEvent(payload);
  const row = payloadRow(payload?.new);
  const previous = payloadRow(payload?.old);
  const id = row?.id || previous?.id;
  if (!id) return list;

  if (event === 'DELETE' || !isQueuedTrip(row)) {
    if (!list.some((item) => item.id === id)) return list;
    return reindexQueue(list.filter((item) => item.id !== id));
  }

  const mapped = mapQueueItemFromRow(row);
  const idx = list.findIndex((item) => item.id === id);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = { ...list[idx], ...mapped, position: list[idx].position };
    return next;
  }
  return reindexQueue([...list, mapped]);
}
