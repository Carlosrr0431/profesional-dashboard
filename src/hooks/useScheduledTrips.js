import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS,
  resolveScheduledDisplayFromTrip,
  resolveScheduledForFromTrip,
} from '../lib/promoteDueScheduledTrips';
import {
  isScheduledDispatchingStatus,
  parseScheduledSource,
  scheduledDestinationAddress,
  scheduledPickupAddress,
  scheduledSourceLabel,
} from '../lib/scheduledTripSource';
import {
  applyScheduledRealtimePayload,
  upsertScheduledTripRow,
} from '../lib/scheduledTripsSnapshot';
import { cancelTripAsOperator } from '../lib/cancelTripAsOperatorClient';

const AR_UTC_OFFSET_H = -3;

function parsePassengerPhone(notes) {
  if (!notes) return null;
  const m = notes.match(/\[PASSENGER_PHONE\] ([^\n]+)/);
  return m ? m[1].trim() : null;
}

function msUntil(date) {
  return date ? date.getTime() - Date.now() : null;
}

function formatCountdown(ms) {
  if (ms === null || ms < 0) return 'Pasado';
  const totalMin = Math.ceil(ms / 60000);
  if (totalMin < 1) return 'Ahora';
  if (totalMin < 60) return `en ${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `en ${h}h ${m}m` : `en ${h}h`;
}

function formatArDate(utcDate) {
  if (!utcDate) return '—';
  const ar = new Date(utcDate.getTime() + AR_UTC_OFFSET_H * 3_600_000);
  const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const wday = WEEKDAYS[ar.getUTCDay()];
  const day = ar.getUTCDate();
  const month = MONTHS[ar.getUTCMonth()];
  const hh = String(ar.getUTCHours()).padStart(2, '0');
  const mm = String(ar.getUTCMinutes()).padStart(2, '0');
  return { wday, day, month, time: `${hh}:${mm}`, iso: utcDate.toISOString() };
}

function urgency(ms) {
  if (ms === null) return 'past';
  if (ms < 0) return 'past';
  if (ms < 30 * 60 * 1000) return 'imminent';
  if (ms < 2 * 60 * 60 * 1000) return 'soon';
  return 'normal';
}

function formatFetchError(err) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Error desconocido';
  }
}

async function fetchScheduledSnapshot() {
  const url = `/api/scheduled-trips?ts=${Date.now()}`;
  let response = await fetch(url, { cache: 'no-store' });
  let contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    response = await fetch(`/api/scheduled-trips?ts=${Date.now()}`, { cache: 'no-store' });
    contentType = response.headers.get('content-type') || '';
  }

  if (!contentType.includes('application/json')) {
    return { skipped: true };
  }

  const payload = await response.json();
  if (!response.ok || payload?.ok === false) {
    return {
      error: payload?.error?.message || `HTTP ${response.status}`,
      status: response.status,
    };
  }

  return { trips: payload?.data?.trips || [] };
}

export function useScheduledTrips() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [tick, setTick] = useState(() => Date.now());
  const channelRef = useRef(null);
  const fetchGenRef = useRef(0);
  const lastUpsertAtRef = useRef(0);

  const fetchTrips = useCallback(async () => {
    const gen = ++fetchGenRef.current;
    try {
      const result = await fetchScheduledSnapshot();
      if (gen !== fetchGenRef.current) return;
      if (result.skipped) return;
      if (result.error) {
        console.error('[useScheduledTrips] Error:', result.error);
        return;
      }

      const next = result.trips || [];
      if (next.length === 0 && Date.now() - lastUpsertAtRef.current < 2000) {
        setLastUpdated(new Date());
        return;
      }

      setTrips(next);
      setLastUpdated(new Date());
    } catch (err) {
      if (gen !== fetchGenRef.current) return;
      console.error('[useScheduledTrips] Error fetching:', formatFetchError(err));
    } finally {
      if (gen === fetchGenRef.current) setLoading(false);
    }
  }, []);

  const upsertTrip = useCallback((trip) => {
    lastUpsertAtRef.current = Date.now();
    setTrips((prev) => upsertScheduledTripRow(prev, trip));
    setLoading(false);
    setLastUpdated(new Date());
    void fetchTrips();
    setTimeout(() => {
      void fetchTrips();
    }, 800);
  }, [fetchTrips]);

  useEffect(() => {
    fetchTrips();

    let debounceTimer = null;
    const scheduleFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchTrips();
      }, 150);
    };

    const applyPayload = (payload) => {
      setTrips((prev) => applyScheduledRealtimePayload(prev, payload));
      setLastUpdated(new Date());
      scheduleFetch();
    };

    const channel = supabase
      .channel(`scheduled-trips-monitor-v4-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, applyPayload)
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          fetchTrips();
          return;
        }
        if (status !== 'CHANNEL_ERROR') return;
        const message = String(err?.message || status);
        if (/1006|socket closed/i.test(message)) {
          fetchTrips();
          return;
        }
        console.error('[useScheduledTrips] Realtime channel error:', message);
      });

    channelRef.current = channel;
    const fallbackPoll = setInterval(fetchTrips, 10_000);

    return () => {
      clearInterval(fallbackPoll);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchTrips]);

  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const enriched = useMemo(() => {
    return trips
      .map((t) => {
        const scheduledFor = resolveScheduledForFromTrip(t);
        const displayText = resolveScheduledDisplayFromTrip(t, scheduledFor)
          || (scheduledFor ? formatArDate(scheduledFor).time : '—');
        const phone = parsePassengerPhone(t.notes) || t.passenger_phone || null;
        const ms = msUntil(scheduledFor);
        const arFormatted = scheduledFor ? formatArDate(scheduledFor) : null;
        const scheduledSource = parseScheduledSource(t);
        return {
          ...t,
          scheduledFor,
          displayText,
          phone,
          msUntil: ms,
          countdown: formatCountdown(ms),
          urgency: urgency(ms),
          arFormatted,
          scheduledSource,
          sourceLabel: scheduledSourceLabel(scheduledSource),
          isDispatching: isScheduledDispatchingStatus(t.status),
          pickupAddress: scheduledPickupAddress(t),
          dropoffAddress: scheduledDestinationAddress(t),
          _tick: tick,
        };
      })
      .sort((a, b) => {
        if (!a.scheduledFor) return 1;
        if (!b.scheduledFor) return -1;
        return a.scheduledFor - b.scheduledFor;
      });
  }, [trips, tick]);

  const stats = useMemo(() => ({
    total: enriched.length,
    imminent: enriched.filter((t) => t.urgency === 'imminent').length,
    dispatchSoon: enriched.filter((t) => (
      t.msUntil != null && t.msUntil <= DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS
    )).length,
    soon: enriched.filter((t) => t.urgency === 'soon').length,
    today: enriched.filter((t) => {
      if (!t.scheduledFor) return false;
      const arNow = new Date(Date.now() + AR_UTC_OFFSET_H * 3_600_000);
      const arTrip = new Date(t.scheduledFor.getTime() + AR_UTC_OFFSET_H * 3_600_000);
      return arNow.getUTCDate() === arTrip.getUTCDate()
        && arNow.getUTCMonth() === arTrip.getUTCMonth()
        && arNow.getUTCFullYear() === arTrip.getUTCFullYear();
    }).length,
  }), [enriched]);

  const dispatchSoonTrips = useMemo(
    () => enriched.filter((t) => (
      t.msUntil != null && t.msUntil <= DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS
    )),
    [enriched],
  );

  async function cancelScheduledTrip(tripId) {
    await cancelTripAsOperator(tripId);
    setTrips((prev) => prev.filter((item) => item.id !== tripId));
    await fetchTrips();
  }

  return {
    trips: enriched,
    dispatchSoonTrips,
    stats,
    loading,
    lastUpdated,
    refetch: fetchTrips,
    upsertTrip,
    cancelScheduledTrip,
  };
}
