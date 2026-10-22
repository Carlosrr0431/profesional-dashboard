import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

function toLocalDateInputValue(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toLocalMonthInputValue(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function buildQuery({ period, date, month, fresh = false }) {
  const params = new URLSearchParams();
  params.set('period', period || '30d');
  if (period === 'day' && date) params.set('date', date);
  if (period === 'month' && month) params.set('month', month);
  if (fresh) params.set('fresh', '1');
  return params.toString();
}

const STORED_STATS_PREFIX = 'pv-trip-stats:';

function readStoredStats(query) {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORED_STATS_PREFIX + query);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data?.summary ? data : null;
  } catch {
    return null;
  }
}

function writeStoredStats(query, data) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORED_STATS_PREFIX + query, JSON.stringify(data));
  } catch {
    // El navegador puede rechazar el guardado si la cuota está llena.
  }
}

export function useTripStatistics(initialPeriod = '30d') {
  const [period, setPeriod] = useState(initialPeriod);
  const [date, setDate] = useState(() => toLocalDateInputValue());
  const [month, setMonth] = useState(() => toLocalMonthInputValue());
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const channelRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const inFlightRef = useRef(null);
  const statsRef = useRef(null);
  const rangeRef = useRef({ period: initialPeriod, date: toLocalDateInputValue(), month: toLocalMonthInputValue() });

  useLayoutEffect(() => {
    const stored = readStoredStats(buildQuery(rangeRef.current));
    if (!stored) return;
    statsRef.current = stored;
    setStats(stored);
    setLoading(false);
  }, []);

  const fetchStats = useCallback(async (range = rangeRef.current, { background = false, fresh = false } = {}) => {
    rangeRef.current = range;
    const storedKey = buildQuery(range);
    const query = buildQuery({ ...range, fresh });
    const stored = readStoredStats(storedKey);

    if (stored) {
      statsRef.current = stored;
      setStats(stored);
      setLoading(false);
    } else if (!background) {
      setLoading(true);
    }

    if (!fresh && inFlightRef.current?.query === query) return inFlightRef.current.promise;

    setError(null);

    const promise = (async () => {
      try {
        let response = await fetch(`/api/trip-statistics?${query}`, { cache: 'no-store' });
        let contentType = response.headers.get('content-type') || '';

        if (!contentType.includes('application/json')) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          response = await fetch(`/api/trip-statistics?${query}`, { cache: 'no-store' });
          contentType = response.headers.get('content-type') || '';
        }

        if (!contentType.includes('application/json')) return;

        const payload = await response.json();
        if (buildQuery(rangeRef.current) !== storedKey) return;

        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error?.message || 'No se pudieron cargar las estadísticas');
        }

        statsRef.current = payload.data;
        setStats(payload.data);
        writeStoredStats(storedKey, payload.data);
        setLastUpdated(new Date());
        setError(null);
      } catch (err) {
        if (buildQuery(rangeRef.current) !== storedKey) return;
        if (!statsRef.current) setError(err?.message || 'Error al cargar estadísticas');
      } finally {
        if (inFlightRef.current?.query === query) inFlightRef.current = null;
        if (buildQuery(rangeRef.current) === storedKey) setLoading(false);
      }
    })();

    inFlightRef.current = { query, promise };
    return promise;
  }, []);

  useEffect(() => {
    const range = { period, date, month };
    fetchStats(range);
  }, [period, date, month, fetchStats]);

  useEffect(() => {
    channelRef.current = supabase
      .channel('trip_statistics_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => {
          fetchStats(rangeRef.current, { background: true });
        }, 12000);
      })
      .subscribe();

    return () => {
      clearTimeout(refreshTimerRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchStats]);

  const changePeriod = useCallback((nextPeriod) => {
    setPeriod(nextPeriod);
  }, []);

  const changeDate = useCallback((nextDate) => {
    setDate(nextDate || toLocalDateInputValue());
    setPeriod('day');
  }, []);

  const changeMonth = useCallback((nextMonth) => {
    setMonth(nextMonth || toLocalMonthInputValue());
    setPeriod('month');
  }, []);

  return {
    stats,
    loading,
    error,
    period,
    date,
    month,
    changePeriod,
    changeDate,
    changeMonth,
    lastUpdated,
    refetch: () => fetchStats(rangeRef.current, { fresh: true }),
  };
}
