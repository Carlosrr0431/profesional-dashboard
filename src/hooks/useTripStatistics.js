import { useState, useEffect, useCallback, useRef } from 'react';
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

function buildQuery({ period, date, month }) {
  const params = new URLSearchParams();
  params.set('period', period || '30d');
  if (period === 'day' && date) params.set('date', date);
  if (period === 'month' && month) params.set('month', month);
  return params.toString();
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
  const rangeRef = useRef({ period: initialPeriod, date: toLocalDateInputValue(), month: toLocalMonthInputValue() });

  const fetchStats = useCallback(async (range = rangeRef.current) => {
    setLoading(true);
    setError(null);
    rangeRef.current = range;

    try {
      const qs = buildQuery(range);
      let response = await fetch(`/api/trip-statistics?${qs}`, { cache: 'no-store' });
      let contentType = response.headers.get('content-type') || '';

      if (!contentType.includes('application/json')) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        response = await fetch(`/api/trip-statistics?${qs}`, { cache: 'no-store' });
        contentType = response.headers.get('content-type') || '';
      }

      if (!contentType.includes('application/json')) {
        setLoading(false);
        return;
      }

      const payload = await response.json();

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message || 'No se pudieron cargar las estadísticas');
      }

      setStats(payload.data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err?.message || 'Error al cargar estadísticas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const range = { period, date, month };
    fetchStats(range);
  }, [period, date, month, fetchStats]);

  useEffect(() => {
    channelRef.current = supabase
      .channel('trip_statistics_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
        fetchStats(rangeRef.current);
      })
      .subscribe();

    return () => {
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
    refetch: () => fetchStats(rangeRef.current),
  };
}
