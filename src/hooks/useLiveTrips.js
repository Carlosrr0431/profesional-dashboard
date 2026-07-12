import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const ACTIVE_STATUSES = new Set(['pending', 'accepted', 'going_to_pickup', 'in_progress']);

function formatFetchError(err) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Error desconocido';
  }
}

/** Fecha local YYYY-MM-DD (navegador). */
export function toLocalDateInputValue(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSameLocalDay(dateStr, dayStr) {
  if (!dateStr || !dayStr) return false;
  return toLocalDateInputValue(new Date(dateStr)) === dayStr;
}

function mapTrip(trip, selectedDate) {
  const inSelectedDay = trip.in_selected_day === true
    || isSameLocalDay(trip.created_at, selectedDate);

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
    isSelectedDay: inSelectedDay,
    isToday: isSameLocalDay(trip.created_at, toLocalDateInputValue()),
    isActive: ACTIVE_STATUSES.has(trip.status),
    isQueued: trip.status === 'queued' && trip.dispatch_status !== 'hold',
  };
}

async function fetchTripsDay(date) {
  let response = await fetch(`/api/trips-day?date=${encodeURIComponent(date)}`, {
    cache: 'no-store',
  });
  let contentType = response.headers.get('content-type') || '';

  // Durante HMR, Next puede devolver HTML mientras compila la ruta.
  if (!contentType.includes('application/json')) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    response = await fetch(`/api/trips-day?date=${encodeURIComponent(date)}`, {
      cache: 'no-store',
    });
    contentType = response.headers.get('content-type') || '';
  }

  if (!contentType.includes('application/json')) {
    return { skipped: true };
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    return {
      error: payload?.error?.message || `HTTP ${response.status}`,
      status: response.status,
    };
  }

  return {
    trips: Array.isArray(payload?.data?.trips) ? payload.data.trips : [],
    date: payload?.data?.date || date,
  };
}

export function useLiveTrips(selectedDate = toLocalDateInputValue()) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);
  const channelRef = useRef(null);
  const refetchTimerRef = useRef(null);
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;

  const fetchAll = useCallback(async () => {
    const date = selectedDateRef.current;
    try {
      const result = await fetchTripsDay(date);
      if (result.skipped) return;

      if (result.error) {
        console.error('[useLiveTrips] Error:', result.error);
        setError(result.error);
        return;
      }

      setError(null);
      setTrips((result.trips || []).map((t) => mapTrip(t, date)));
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[useLiveTrips] Error:', formatFetchError(err));
      setError(formatFetchError(err));
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
    error,
    refetch: fetchAll,
    selectedDate,
  };
}
