import { cancelTripAsOperator } from './cancelTripAsOperator';
import { resolveScheduledForFromTrip } from './promoteDueScheduledTrips';

export const SCHEDULED_TRIP_SELECT =
  'id, passenger_name, passenger_phone, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng, notes, scheduled_for, created_at, status, dispatch_status';

export const SCHEDULED_DISPATCHING_STATUSES = ['queued', 'pending'];
export const CANCELLABLE_SCHEDULED_STATUSES = ['scheduled', 'queued', 'pending'];

export function isVisibleScheduledBooking(trip) {
  const status = String(trip?.status || '').toLowerCase();
  if (status === 'scheduled') return true;
  if (!SCHEDULED_DISPATCHING_STATUSES.includes(status)) return false;
  return Boolean(resolveScheduledForFromTrip(trip));
}

export function mergeScheduledBookingRows(...groups) {
  const byId = new Map();
  for (const group of groups) {
    for (const row of group || []) {
      if (!row?.id || !isVisibleScheduledBooking(row)) continue;
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

export function upsertScheduledTripRow(trips, trip) {
  const list = Array.isArray(trips) ? trips : [];
  if (!trip?.id) return list;
  if (!isVisibleScheduledBooking(trip)) {
    return list.filter((item) => item.id !== trip.id);
  }
  return mergeScheduledBookingRows(list, [trip]);
}

export function applyScheduledRealtimePayload(trips, payload) {
  const list = Array.isArray(trips) ? trips : [];
  const event = String(payload?.eventType || payload?.event || '').toUpperCase();
  const row = payload?.new && typeof payload.new === 'object' ? payload.new : null;
  const previous = payload?.old && typeof payload.old === 'object' ? payload.old : null;

  if (event === 'DELETE') {
    const id = previous?.id || row?.id;
    if (!id) return list;
    return list.filter((item) => item.id !== id);
  }

  if (!row?.id) return list;

  if (isVisibleScheduledBooking(row)) {
    return mergeScheduledBookingRows(list, [row]);
  }

  return list.filter((item) => item.id !== row.id);
}

function unwrap(result, fallbackMessage) {
  if (result?.error) {
    const err = new Error(result.error.message || fallbackMessage);
    err.cause = result.error;
    throw err;
  }
  return result?.data || [];
}

export async function fetchScheduledTripsSnapshot(supabase) {
  const [scheduledRes, dispatchingRes] = await Promise.all([
    supabase
      .from('trips')
      .select(SCHEDULED_TRIP_SELECT)
      .eq('status', 'scheduled')
      .order('scheduled_for', { ascending: true })
      .limit(300),
    supabase
      .from('trips')
      .select(SCHEDULED_TRIP_SELECT)
      .in('status', SCHEDULED_DISPATCHING_STATUSES)
      .not('scheduled_for', 'is', null)
      .order('scheduled_for', { ascending: true })
      .limit(200),
  ]);

  const scheduledRows = unwrap(scheduledRes, 'Error leyendo viajes programados');
  const dispatchingRows = unwrap(dispatchingRes, 'Error leyendo programados en cola');

  const notesOnlyRes = await supabase
    .from('trips')
    .select(SCHEDULED_TRIP_SELECT)
    .in('status', SCHEDULED_DISPATCHING_STATUSES)
    .is('scheduled_for', null)
    .ilike('notes', '%SCHEDULED_FOR%')
    .limit(100);

  const notesOnlyRows = notesOnlyRes?.error ? [] : (notesOnlyRes?.data || []);

  return mergeScheduledBookingRows(scheduledRows, dispatchingRows, notesOnlyRows);
}

export async function cancelScheduledBooking(supabase, tripId) {
  const result = await cancelTripAsOperator(supabase, tripId);
  return { id: result.trip.id };
}
