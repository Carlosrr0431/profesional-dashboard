import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  resolveTripsViewRange,
  toAnchorString,
} from '../lib/commissionPaymentPeriods';
import {
  applyTripRealtimeToLiveList,
  mapLiveTripFromRow,
} from '../lib/tripRealtime';

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

function mapTrip(trip, range) {
  return mapLiveTripFromRow(trip, range);
}

async function fetchTripsRange(mode, date) {
  const params = new URLSearchParams({
    mode: mode || 'day',
    date: date || toLocalDateInputValue(),
  });
  let response = await fetch(`/api/trips-day?${params}`, { cache: 'no-store' });
  let contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    response = await fetch(`/api/trips-day?${params}`, { cache: 'no-store' });
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
    mode: payload?.data?.mode || mode,
    label: payload?.data?.label || '',
    start: payload?.data?.start,
    end: payload?.data?.end,
  };
}

export function useLiveTrips(
  selectedDate = toLocalDateInputValue(),
  selectedMode = 'day',
) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);
  const [rangeMeta, setRangeMeta] = useState(() => resolveTripsViewRange(selectedMode, selectedDate));
  const channelRef = useRef(null);
  const refetchTimerRef = useRef(null);
  const selectedDateRef = useRef(selectedDate);
  const selectedModeRef = useRef(selectedMode);
  const rangeMetaRef = useRef(rangeMeta);
  const lastTripPayloadRef = useRef(null);
  selectedDateRef.current = selectedDate;
  selectedModeRef.current = selectedMode;
  rangeMetaRef.current = rangeMeta;

  const fetchAll = useCallback(async () => {
    const date = selectedDateRef.current;
    const mode = selectedModeRef.current || 'day';
    try {
      const result = await fetchTripsRange(mode, date);
      if (result.skipped) return;

      if (result.error) {
        console.error('[useLiveTrips] Error:', result.error);
        setError(result.error);
        return;
      }

      const range = {
        start: result.start,
        end: result.end,
        mode: result.mode,
        date: result.date,
        label: result.label,
      };
      setError(null);
      setRangeMeta(range);
      setTrips(() => {
        let next = (result.trips || []).map((t) => mapTrip(t, range));
        const last = lastTripPayloadRef.current;
        if (last && Date.now() - last.at < 2500) {
          next = applyTripRealtimeToLiveList(next, last.payload, range);
        }
        return next;
      });
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
    setRangeMeta(resolveTripsViewRange(selectedMode, selectedDate));
    fetchAll();
  }, [fetchAll, selectedDate, selectedMode]);

  useEffect(() => {
    const applyPayload = (payload) => {
      lastTripPayloadRef.current = { payload, at: Date.now() };
      setTrips((prev) => applyTripRealtimeToLiveList(prev, payload, rangeMetaRef.current));
      setLastUpdated(new Date());
      scheduleRefetch();
    };

    const channel = supabase
      .channel(`live-trips-monitor-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, applyPayload)
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
    const ofRange = trips.filter((t) => t.isSelectedDay);
    return {
      total: ofRange.length,
      active: trips.filter((t) => t.isActive).length,
      queued: trips.filter((t) => t.isQueued).length,
      completedDay: ofRange.filter((t) => t.status === 'completed').length,
      cancelledDay: ofRange.filter((t) => t.status === 'cancelled').length,
      dispatchedDay: ofRange.filter((t) => t.status !== 'queued').length,
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
    selectedMode,
    rangeLabel: rangeMeta?.label || '',
    rangeMeta,
  };
}

export { toAnchorString, resolveTripsViewRange };
