import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useDrivers() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  const fetchDrivers = useCallback(async () => {
    try {
      const response = await fetch('/api/drivers-snapshot', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) {
        console.error('Error fetching drivers:', {
          status: response.status,
          code: payload?.error?.code || null,
          message: payload?.error?.message || 'Request failed',
          details: payload?.error?.details || null,
        });
        return;
      }

      setDrivers(payload?.data || []);
    } catch (err) {
      console.error('Error fetching drivers:', {
        message: err?.message || String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDrivers();

    channelRef.current = supabase
      .channel('dashboard_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_locations' },
        (payload) => {
          const loc = payload.new;
          if (!loc) return;

          setDrivers((prev) => {
            const idx = prev.findIndex((d) => d.id === loc.driver_id);
            if (idx === -1) {
              fetchDrivers();
              return prev;
            }

            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              lat: parseFloat(loc.lat),
              lng: parseFloat(loc.lng),
              speed: parseFloat(loc.speed || 0),
              heading: parseFloat(loc.heading || 0),
              isOnline: loc.is_online,
              updatedAt: loc.updated_at,
            };
            return updated;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'drivers' },
        (payload) => {
          const d = payload.new;
          if (!d) return;

          setDrivers((prev) => {
            const idx = prev.findIndex((dr) => dr.id === d.id);
            if (idx === -1) {
              fetchDrivers();
              return prev;
            }

            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              lat: parseFloat(d.current_lat || updated[idx].lat),
              lng: parseFloat(d.current_lng || updated[idx].lng),
              isOnline: updated[idx].isOnline !== undefined ? updated[idx].isOnline : d.is_available,
              isAvailable: d.is_available,
              fullName: d.full_name || updated[idx].fullName,
              vehicleType: d.vehicle_type || updated[idx].vehicleType || 'auto',
              updatedAt: d.updated_at,
            };
            return updated;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips' },
        () => fetchDrivers()
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [fetchDrivers]);

  return { drivers, loading, refetch: fetchDrivers };
}
