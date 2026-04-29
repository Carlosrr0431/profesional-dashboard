import { useState, useEffect, useCallback } from 'react';

export function useServiceZones() {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/service-zones');
      const json = await res.json();
      if (json.ok) setZones(json.data || []);
    } catch (err) {
      console.error('useServiceZones refetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createZone = useCallback(
    async ({ name, color, coordinates }) => {
      const res = await fetch('/api/service-zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color, coordinates }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Error al crear la zona');
      await refetch();
      return json.data;
    },
    [refetch]
  );

  const updateZone = useCallback(
    async (id, updates) => {
      const res = await fetch('/api/service-zones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Error al actualizar la zona');
      await refetch();
      return json.data;
    },
    [refetch]
  );

  const deleteZone = useCallback(
    async (id) => {
      const res = await fetch(`/api/service-zones?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Error al eliminar la zona');
      await refetch();
    },
    [refetch]
  );

  const toggleZoneActive = useCallback(
    async (id, is_active) => {
      return updateZone(id, { is_active });
    },
    [updateZone]
  );

  return { zones, loading, refetch, createZone, updateZone, deleteZone, toggleZoneActive };
}
