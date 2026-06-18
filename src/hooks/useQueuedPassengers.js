import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';

function waitMinutes(dateStr, nowMs = Date.now()) {
  if (!dateStr) return 0;
  return Math.max(0, Math.round((nowMs - new Date(dateStr).getTime()) / 60000));
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

async function fetchQueueSnapshot() {
  let response = await fetch('/api/queue-snapshot', { cache: 'no-store' });
  let contentType = response.headers.get('content-type') || '';

  // Durante HMR, Next.js puede devolver HTML mientras compila la ruta API.
  if (!contentType.includes('application/json')) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    response = await fetch('/api/queue-snapshot', { cache: 'no-store' });
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

  return {
    queue: payload?.data?.queue || [],
    log: payload?.data?.log || [],
  };
}

export function useQueuedPassengers() {
  const [queuedRaw, setQueuedRaw] = useState([]);
  const [dispatchLog, setDispatchLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [waitTick, setWaitTick] = useState(() => Date.now());
  const channelRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const result = await fetchQueueSnapshot();

      if (result.skipped) return;

      if (result.error) {
        console.error('[useQueuedPassengers] Error:', {
          status: result.status || null,
          message: result.error,
        });
        return;
      }

      setQueuedRaw(result.queue);
      setDispatchLog(result.log);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[useQueuedPassengers] Error:', formatFetchError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel('queue-monitor-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, fetchAll)
      .subscribe();

    channelRef.current = channel;

    const fallbackPoll = setInterval(fetchAll, 30000);

    return () => {
      clearInterval(fallbackPoll);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [fetchAll]);

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
