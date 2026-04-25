import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

function waitMinutes(dateStr) {
  if (!dateStr) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(dateStr).getTime()) / 60000));
}

export function useQueuedPassengers() {
  const [queuedList, setQueuedList] = useState([]);      // active queue
  const [dispatchLog, setDispatchLog] = useState([]);    // recent dispatches
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
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

      setQueuedList(
        queue.map((item) => ({
          ...item,
          waitMinutes: waitMinutes(item.queuedAt),
        }))
      );
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

    // Refresh wait times every 30 seconds even without DB changes
    const ticker = setInterval(fetchAll, 30000);

    return () => {
      channel.unsubscribe();
      clearInterval(ticker);
    };
  }, [fetchAll]);

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
