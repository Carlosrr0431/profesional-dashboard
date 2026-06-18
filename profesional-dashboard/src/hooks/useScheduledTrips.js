import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const AR_UTC_OFFSET_H = -3;

function parseScheduledFor(trip) {
  const fromColumn = trip?.scheduled_for ? new Date(trip.scheduled_for) : null;
  if (fromColumn && !isNaN(fromColumn.getTime())) return fromColumn;

  const notes = trip?.notes;
  if (!notes) return null;
  const m = notes.match(/\[SCHEDULED_FOR\] (\S+)/);
  if (!m) return null;
  const d = new Date(m[1]);
  return isNaN(d.getTime()) ? null : d;
}

function parseScheduledDisplay(notes) {
  if (!notes) return null;
  const m = notes.match(/\[SCHEDULED_DISPLAY\] ([^\n]+)/);
  return m ? m[1].trim() : null;
}

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
  if (ms < 30 * 60 * 1000) return 'imminent';   // < 30 min
  if (ms < 2 * 60 * 60 * 1000) return 'soon';   // < 2h
  return 'normal';
}

export function useScheduledTrips() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [tick, setTick] = useState(() => Date.now());
  const channelRef = useRef(null);

  const fetchTrips = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('trips')
        .select(
          'id, passenger_name, passenger_phone, destination_address, destination_lat, destination_lng, notes, scheduled_for, created_at, status'
        )
        .eq('status', 'scheduled')
        .order('created_at', { ascending: true });

      if (error) throw error;

      setTrips(data || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[useScheduledTrips] Error fetching:', err?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrips();

    // Realtime: cualquier cambio en trips (al pasar scheduled→queued, old.status suele no venir)
    const channel = supabase
      .channel('scheduled-trips-monitor-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
        fetchTrips();
      })
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('[useScheduledTrips] Realtime channel error:', err?.message || status);
        }
      });

    channelRef.current = channel;

    // Polling de respaldo (misma estrategia que useQueuedPassengers)
    const fallbackPoll = setInterval(fetchTrips, 30_000);

    return () => {
      clearInterval(fallbackPoll);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchTrips]);

  // Tick cada 15s para cuenta regresiva / urgencia sin esperar al poll
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const enriched = useMemo(() => {
    return trips
      .map((t) => {
        const scheduledFor = parseScheduledFor(t);
        const displayText = parseScheduledDisplay(t.notes) || (scheduledFor ? formatArDate(scheduledFor).time : '—');
        const phone = parsePassengerPhone(t.notes) || t.passenger_phone || null;
        const ms = msUntil(scheduledFor);
        const arFormatted = scheduledFor ? formatArDate(scheduledFor) : null;
        return {
          ...t,
          scheduledFor,
          displayText,
          phone,
          msUntil: ms,
          countdown: formatCountdown(ms),
          urgency: urgency(ms),
          arFormatted,
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

  async function cancelScheduledTrip(tripId) {
    const { error } = await supabase
      .from('trips')
      .update({ status: 'cancelled' })
      .eq('id', tripId)
      .eq('status', 'scheduled');
    if (error) throw error;
    await fetchTrips();
  }

  return {
    trips: enriched,
    stats,
    loading,
    lastUpdated,
    refetch: fetchTrips,
    cancelScheduledTrip,
  };
}
