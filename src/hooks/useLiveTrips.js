import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const ACTIVE_STATUSES = new Set(['pending', 'accepted', 'going_to_pickup', 'in_progress']);
const LIVE_STATUSES = ['queued', 'pending', 'accepted', 'going_to_pickup', 'in_progress'];

const TRIP_SELECT =
  'id, passenger_name, passenger_phone, origin_address, destination_address, ' +
  'status, created_at, accepted_at, started_at, completed_at, notes, driver_id, ' +
  'cancel_reason, price, distance_km, duration_minutes, commission_amount, dispatch_status';

function formatFetchError(err) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Error desconocido';
  }
}

/** Fecha local YYYY-MM-DD */
export function toLocalDateInputValue(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayBoundsIso(dateStr) {
  const [y, m, d] = String(dateStr || '').split('-').map(Number);
  if (!y || !m || !d) {
    const fallback = toLocalDateInputValue();
    return dayBoundsIso(fallback);
  }
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString(), startMs: start.getTime(), endMs: end.getTime() };
}

function isSameLocalDay(dateStr, dayStr) {
  if (!dateStr || !dayStr) return false;
  return toLocalDateInputValue(new Date(dateStr)) === dayStr;
}

function mapTrip(trip, driversMap, selectedDate) {
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
    driver: trip.driver_id ? driversMap[trip.driver_id] || null : null,
    isSelectedDay: isSameLocalDay(trip.created_at, selectedDate),
    isToday: isSameLocalDay(trip.created_at, toLocalDateInputValue()),
    isActive: ACTIVE_STATUSES.has(trip.status),
    isQueued: trip.status === 'queued' && trip.dispatch_status !== 'hold',
  };
}

async function loadDriversMap(driverIds) {
  if (!driverIds.length) return {};
  const { data, error } = await supabase
    .from('drivers')
    .select('id, full_name, vehicle_plate, vehicle_brand, vehicle_model, vehicle_color')
    .in('id', driverIds);
  if (error) throw error;
  const map = {};
  (data || []).forEach((d) => {
    map[d.id] = d;
  });
  return map;
}

export function useLiveTrips(selectedDate = toLocalDateInputValue()) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const channelRef = useRef(null);
  const refetchTimerRef = useRef(null);
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;

  const fetchAll = useCallback(async () => {
    const date = selectedDateRef.current;
    const { start, end } = dayBoundsIso(date);

    try {
      const [dayResult, liveResult] = await Promise.all([
        supabase
          .from('trips')
          .select(TRIP_SELECT)
          .neq('status', 'scheduled')
          .gte('created_at', start)
          .lt('created_at', end)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('trips')
          .select(TRIP_SELECT)
          .in('status', LIVE_STATUSES)
          .order('created_at', { ascending: false })
          .limit(100),
      ]);

      if (dayResult.error) throw dayResult.error;
      if (liveResult.error) throw liveResult.error;

      const byId = new Map();
      [...(dayResult.data || []), ...(liveResult.data || [])].forEach((trip) => {
        if (trip.status === 'queued' && trip.dispatch_status === 'hold') return;
        byId.set(trip.id, trip);
      });

      const merged = [...byId.values()].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      const driverIds = [...new Set(merged.map((t) => t.driver_id).filter(Boolean))];
      const driversMap = await loadDriversMap(driverIds);

      setTrips(merged.map((t) => mapTrip(t, driversMap, date)));
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[useLiveTrips] Error:', formatFetchError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      fetchAll();
    }, 250);
  }, [fetchAll]);

  useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll, selectedDate]);

  useEffect(() => {
    const channel = supabase
      .channel(`live-trips-monitor-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, scheduleRefetch)
      .subscribe();

    channelRef.current = channel;
    const fallbackPoll = setInterval(fetchAll, 45000);

    return () => {
      clearInterval(fallbackPoll);
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchAll, scheduleRefetch]);

  const dayTrips = useMemo(
    () => trips.filter((t) => t.isSelectedDay || t.isActive || t.isQueued),
    [trips],
  );

  const stats = useMemo(() => {
    const ofDay = trips.filter((t) => t.isSelectedDay);
    return {
      total: ofDay.length,
      active: trips.filter((t) => t.isActive).length,
      queued: trips.filter((t) => t.isQueued).length,
      completedDay: ofDay.filter((t) => t.status === 'completed').length,
      cancelledDay: ofDay.filter((t) => t.status === 'cancelled').length,
      dispatchedDay: ofDay.filter((t) => t.status !== 'queued').length,
    };
  }, [trips]);

  return {
    trips: dayTrips,
    allTrips: trips,
    stats,
    loading,
    lastUpdated,
    refetch: fetchAll,
    selectedDate,
  };
}
