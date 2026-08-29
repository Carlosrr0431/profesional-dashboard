import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useHotZones() {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/hot-zones');
      const json = await res.json();
      if (json.ok) setZones(json.data || []);
    } catch (err) {
      console.error('useHotZones refetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    channelRef.current = supabase
      .channel('hot_zones_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hot_zones' }, refetch)
      .subscribe();
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [refetch]);

  const createZone = useCallback(
    async ({ name, color, coordinates, fare_surcharge_percent }) => {
      const res = await fetch('/api/hot-zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color, coordinates, fare_surcharge_percent }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Error al crear la zona caliente');
      await refetch();
      return json.data;
    },
    [refetch]
  );

  const updateZone = useCallback(
    async (id, updates) => {
      const res = await fetch('/api/hot-zones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Error al actualizar la zona caliente');
      await refetch();
      return json.data;
    },
    [refetch]
  );

  const deleteZone = useCallback(
    async (id) => {
      const res = await fetch(`/api/hot-zones?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Error al eliminar la zona caliente');
      await refetch();
    },
    [refetch]
  );

  const toggleZoneActive = useCallback(
    async (id, is_active) => updateZone(id, { is_active }),
    [updateZone]
  );

  return { zones, loading, refetch, createZone, updateZone, deleteZone, toggleZoneActive };
}
