import { useCallback, useEffect, useState } from 'react';

export function useGeocodeErrors(initialFilter = 'pending') {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ pending: 0, returned: 0 });
  const [filter, setFilter] = useState(initialFilter);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchItems = useCallback(async (nextFilter = filter) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/geocode-errors?filter=${encodeURIComponent(nextFilter)}&limit=200`);
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'No se pudieron cargar los errores');
      }
      setItems(json.data || []);
      setStats(json.stats || { pending: 0, returned: 0 });
    } catch (err) {
      setError(err?.message || 'Error al cargar');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchItems(filter);
  }, [filter, fetchItems]);

  const setResolved = useCallback(async (id, resolved, resolvedNote = '') => {
    const res = await fetch('/api/geocode-errors', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, resolved, resolved_note: resolvedNote }),
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      throw new Error(json?.error || 'No se pudo actualizar');
    }

    setItems((prev) => {
      if (filter === 'pending' && resolved) {
        return prev.filter((item) => item.id !== id);
      }
      if (filter === 'resolved' && !resolved) {
        return prev.filter((item) => item.id !== id);
      }
      return prev.map((item) => (item.id === id ? json.data : item));
    });

    await fetchItems(filter);
    return json.data;
  }, [filter, fetchItems]);

  return {
    items,
    stats,
    filter,
    setFilter,
    loading,
    error,
    refetch: () => fetchItems(filter),
    setResolved,
  };
}
