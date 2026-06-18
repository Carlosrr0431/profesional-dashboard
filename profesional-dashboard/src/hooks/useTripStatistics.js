import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useTripStatistics(initialPeriod = '30d') {
  const [period, setPeriod] = useState(initialPeriod);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const channelRef = useRef(null);

  const fetchStats = useCallback(async (selectedPeriod = period) => {
    setLoading(true);
    setError(null);

    try {
      let response = await fetch(
        `/api/trip-statistics?period=${encodeURIComponent(selectedPeriod)}`,
        { cache: 'no-store' },
      );
      let contentType = response.headers.get('content-type') || '';

      if (!contentType.includes('application/json')) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        response = await fetch(
          `/api/trip-statistics?period=${encodeURIComponent(selectedPeriod)}`,
          { cache: 'no-store' },
        );
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
  }, [period]);

  useEffect(() => {
    fetchStats(period);
  }, [period, fetchStats]);

  useEffect(() => {
    channelRef.current = supabase
      .channel('trip_statistics_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
        fetchStats(period);
      })
      .subscribe();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchStats, period]);

  const changePeriod = useCallback((nextPeriod) => {
    setPeriod(nextPeriod);
  }, []);

  return {
    stats,
    loading,
    error,
    period,
    changePeriod,
    lastUpdated,
    refetch: () => fetchStats(period),
  };
}
