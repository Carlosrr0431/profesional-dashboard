import { useEffect, useMemo, useState } from 'react';
import { summarizeDemand } from '../lib/demandHeatmap';

export function useDemandMap(enabled) {
  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60000));

  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => {
      const next = Math.floor(Date.now() / 60000);
      setMinute((prev) => (prev === next ? prev : next));
    }, 20000);
    return () => clearInterval(id);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancel = false;

    const load = async () => {
      if (!ready) setLoading(true);
      try {
        const response = await fetch('/api/demand-map', { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || 'No se pudo cargar la demanda');
        }
        if (!cancel) {
          setRows(Array.isArray(payload.rows) ? payload.rows : []);
          setReady(true);
          setError('');
        }
      } catch (err) {
        if (!cancel) setError(err?.message || 'No se pudo cargar la demanda');
      } finally {
        if (!cancel) setLoading(false);
      }
    };

    load();
    const id = setInterval(load, 60000);
    return () => {
      cancel = true;
      clearInterval(id);
    };
  }, [enabled]);

  const summary = useMemo(
    () => (ready ? summarizeDemand(rows, minute * 60000) : null),
    [ready, rows, minute],
  );

  return { summary, error, loading };
}
