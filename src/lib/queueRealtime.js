const EXCLUDED_DISPATCH = new Set(['hold', 'cancelled']);
const MAP_PENDING_STATUSES = new Set(['queued', 'pending']);

export function tripBelongsInWaitQueue(trip) {
  if (!trip) return false;
  const status = String(trip.status || '').toLowerCase();
  const dispatch = String(trip.dispatch_status || '').toLowerCase();
  if (EXCLUDED_DISPATCH.has(dispatch)) return false;
  if (status === 'queued') return true;
  const nextId = trip.next_after_trip_id ?? trip.nextAfterTripId;
  return status === 'pending' && nextId != null && String(nextId).trim() !== '';
}

export function tripBelongsOnPendingMap(trip) {
  if (!trip) return false;
  const status = String(trip.status || '').toLowerCase();
  if (!MAP_PENDING_STATUSES.has(status)) return false;
  const dispatch = String(trip.dispatch_status || '').toLowerCase();
  return !EXCLUDED_DISPATCH.has(dispatch);
}

export function realtimeTripId(payload) {
  return payload?.new?.id || payload?.old?.id || null;
}

export function tripLeftWaitQueue(payload) {
  const eventType = payload?.eventType || payload?.event;
  if (eventType === 'DELETE') return true;
  const next = payload?.new;
  if (!next || typeof next !== 'object') return false;
  if (next.status != null) return !tripBelongsInWaitQueue(next);
  if (next.dispatch_status != null) {
    return EXCLUDED_DISPATCH.has(String(next.dispatch_status).toLowerCase());
  }
  return false;
}

export function reindexQueuePositions(list) {
  return list.map((item, index) => ({ ...item, position: index + 1 }));
}

export function mapTripToQueueItem(trip) {
  return {
    id: trip.id,
    phone: trip.passenger_phone,
    passengerName: trip.passenger_name || 'Pasajero',
    pickupAddress: trip.destination_address || trip.origin_address || '—',
    queuedAt: trip.created_at,
    notes: trip.notes || null,
    status: trip.status || 'queued',
    dispatchStatus: trip.dispatch_status || null,
    nextAfterTripId: trip.next_after_trip_id || trip.nextAfterTripId || null,
  };
}

export function applyQueueRealtimeChange(currentList, payload) {
  const list = Array.isArray(currentList) ? currentList : [];
  const id = realtimeTripId(payload);
  if (!id) return list;

  const incoming = payload?.new && typeof payload.new === 'object' ? payload.new : null;
  const previous = payload?.old && typeof payload.old === 'object' ? payload.old : null;
  const row = incoming && previous ? { ...previous, ...incoming } : incoming;
  const existing = list.find((item) => item.id === id) || null;

  if (existing && incoming && incoming.status == null && incoming.dispatch_status == null) {
    return list.map((item) => (
      item.id === id
        ? { ...item, notes: Object.prototype.hasOwnProperty.call(incoming, 'notes') ? (incoming.notes || null) : item.notes }
        : item
    ));
  }

  if (tripLeftWaitQueue({ ...payload, new: row || incoming })) {
    const next = list.filter((item) => item.id !== id);
    return next.length === list.length ? list : reindexQueuePositions(next);
  }

  if (!row?.id || !tripBelongsInWaitQueue(row)) return list;

  const mapped = mapTripToQueueItem(row);
  const exists = list.some((item) => item.id === id);
  const merged = exists
    ? list.map((item) => (item.id === id ? { ...item, ...mapped, id: item.id } : item))
    : [...list, mapped];
  const sorted = merged
    .slice()
    .sort((a, b) => new Date(a.queuedAt || 0).getTime() - new Date(b.queuedAt || 0).getTime());
  return reindexQueuePositions(sorted);
}

export function applyPendingRealtimeChange(currentList, payload, mapRow) {
  const list = Array.isArray(currentList) ? currentList : [];
  const id = realtimeTripId(payload);
  if (!id) return list;

  const eventType = payload?.eventType || payload?.event;
  const row = payload?.new;
  const left = eventType === 'DELETE'
    || (row && row.status != null && !tripBelongsOnPendingMap(row))
    || (row && row.status == null && EXCLUDED_DISPATCH.has(String(row.dispatch_status || '').toLowerCase()));

  if (left) {
    const next = list.filter((item) => item.id !== id);
    return next.length === list.length ? list : next;
  }

  if (!row?.id || (row.status != null && !tripBelongsOnPendingMap(row))) return list;
  if (typeof mapRow !== 'function') return list;

  const mapped = mapRow(row);
  if (!mapped) return list;

  const exists = list.some((item) => item.id === id);
  return exists
    ? list.map((item) => (item.id === id ? mapped : item))
    : [...list, mapped];
}

export function patchLiveTripFromRealtime(trip, payload) {
  const row = payload?.new;
  if (!trip || !row || trip.id !== row.id) return trip;

  const status = row.status != null ? row.status : trip.status;
  const dispatchStatus = row.dispatch_status != null
    ? row.dispatch_status
    : trip.dispatchStatus;
  const activeStatuses = new Set(['pending', 'accepted', 'going_to_pickup', 'in_progress']);

  return {
    ...trip,
    status,
    dispatchStatus: dispatchStatus ?? trip.dispatchStatus ?? null,
    cancelReason: row.cancel_reason != null ? row.cancel_reason : trip.cancelReason,
    isQueued: tripBelongsInWaitQueue({ status, dispatch_status: dispatchStatus }),
    isActive: activeStatuses.has(status),
  };
}

export function applyLiveTripsRealtimeChange(currentList, payload) {
  const list = Array.isArray(currentList) ? currentList : [];
  const eventType = payload?.eventType || payload?.event;
  const id = realtimeTripId(payload);
  if (!id) return list;

  if (eventType === 'DELETE') {
    const next = list.filter((item) => item.id !== id);
    return next.length === list.length ? list : next;
  }

  const row = payload?.new;
  if (!row) return list;

  let found = false;
  const next = list.map((trip) => {
    if (trip.id !== id) return trip;
    found = true;
    return patchLiveTripFromRealtime(trip, payload);
  });
  return found ? next : list;
}
