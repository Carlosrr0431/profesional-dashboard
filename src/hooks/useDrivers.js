import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useDrivers() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  const fetchDrivers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('driver_locations')
        .select(`
          driver_id,
          lat,
          lng,
          speed,
          heading,
          is_online,
          updated_at,
          drivers (
            id,
            full_name,
            phone,
            photo_url,
            vehicle_brand,
            vehicle_model,
            vehicle_plate,
            vehicle_color,
            is_available,
            rating,
            total_trips
          )
        `);

      if (error) throw error;

      const mapped = (data || []).map((loc) => ({
        id: loc.driver_id,
        lat: parseFloat(loc.lat),
        lng: parseFloat(loc.lng),
        speed: parseFloat(loc.speed || 0),
        heading: parseFloat(loc.heading || 0),
        isOnline: loc.is_online,
        updatedAt: loc.updated_at,
        fullName: loc.drivers?.full_name || 'Sin nombre',
        phone: loc.drivers?.phone || '',
        photoUrl: loc.drivers?.photo_url || '',
        vehicleBrand: loc.drivers?.vehicle_brand || '',
        vehicleModel: loc.drivers?.vehicle_model || '',
        vehiclePlate: loc.drivers?.vehicle_plate || '',
        vehicleColor: loc.drivers?.vehicle_color || '',
        isAvailable: loc.drivers?.is_available || false,
        rating: parseFloat(loc.drivers?.rating || 5),
        totalTrips: loc.drivers?.total_trips || 0,
      }));

      setDrivers(mapped);
    } catch (err) {
      console.error('Error fetching drivers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDrivers();

    channelRef.current = supabase
      .channel('driver_locations_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_locations' },
        (payload) => {
          const loc = payload.new;
          if (!loc) return;

          setDrivers((prev) => {
            const idx = prev.findIndex((d) => d.id === loc.driver_id);
            if (idx === -1) {
              // New driver appeared — refetch to get full driver info
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
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [fetchDrivers]);

  return { drivers, loading, refetch: fetchDrivers };
}
