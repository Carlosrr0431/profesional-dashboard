import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';

function waitMinutes(dateStr, nowMs = Date.now()) {
  if (!dateStr) return 0;
  return Math.max(0, Math.round((nowMs - new Date(dateStr).getTime()) / 60000));
}

export function useQueuedPassengers() {
  const [queuedRaw, setQueuedRaw] = useState([]);        // active queue raw rows
  const [dispatchLog, setDispatchLog] = useState([]);    // recent dispatches
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [waitTick, setWaitTick] = useState(() => Date.now());
  const channelRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const response = await fetch('/api/queue-snapshot', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) {
        console.error('[useQueuedPassengers] Error:', {
          status: response.status,
          code: payload?.error?.code || null,
          message: payload?.error?.message || 'Request failed',
          details: payload?.error?.details || null,
        });
        setLoading(false);
        return;
      }

      const queue = payload?.data?.queue || [];
      const log = payload?.data?.log || [];

      setQueuedRaw(queue);
      setDispatchLog(log);
      setLastUpdated(new Date());
      setLoading(false);
    } catch (err) {
      console.error('[useQueuedPassengers] Error:', {
        message: err?.message || String(err),
      });
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();

    // Realtime: watch conversations + trips for changes
    const channel = supabase
      .channel('queue-monitor-v1')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, fetchAll)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trips' }, fetchAll)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trips' }, fetchAll)
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [fetchAll]);

  // Actualiza solo el tiempo de espera visual sin pegarle a la API.
  useEffect(() => {
    const ticker = setInterval(() => {
      setWaitTick(Date.now());
    }, 30000);
    return () => clearInterval(ticker);
  }, []);

  const queuedList = useMemo(() => {
    return queuedRaw.map((item) => ({
      ...item,
      waitMinutes: waitMinutes(item.queuedAt, waitTick),
    }));
  }, [queuedRaw, waitTick]);

  // Derive stats
  const stats = {
    inQueue: queuedList.length,
    dispatchedToday: dispatchLog.filter((d) => d.isToday).length,
    avgWaitMinutes:
      queuedList.length > 0
        ? Math.round(queuedList.reduce((s, c) => s + c.waitMinutes, 0) / queuedList.length)
        : 0,
    longestWaitMinutes: queuedList.length > 0 ? Math.max(...queuedList.map((c) => c.waitMinutes)) : 0,
  };

  return { queuedList, dispatchLog, stats, loading, lastUpdated, refetch: fetchAll };
}
