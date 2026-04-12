import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useDrivers() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  const fetchDrivers = useCallback(async () => {
    try {
      // Query drivers table directly (always has data)
      const { data: driversData, error: driversError } = await supabase
        .from('drivers')
        .select('*');

      if (driversError) throw driversError;

      // Try to get realtime locations (may not exist yet)
      let locationsMap = {};
      try {
        const { data: locData } = await supabase
          .from('driver_locations')
          .select('*');
        if (locData) {
          locData.forEach((loc) => {
            locationsMap[loc.driver_id] = loc;
          });
        }
      } catch (_) {
        // driver_locations table might not exist yet, that's ok
      }

      // Fetch active trips to determine driver activity
      let activeTripsMap = {};
      try {
        const { data: activeTrips } = await supabase
          .from('trips')
          .select('driver_id, status, passenger_name, destination_address')
          .in('status', ['accepted', 'going_to_pickup', 'in_progress']);
        if (activeTrips) {
          activeTrips.forEach((t) => {
            if (t.driver_id) activeTripsMap[t.driver_id] = t;
          });
        }
      } catch (_) {}

      // Load vehicle types from settings (fallback if column doesn't exist)
      let vehicleTypeMap = {};
      try {
        const { data: vtSettings } = await supabase
          .from('settings')
          .select('key, value')
          .like('key', 'vehicle_type_%');
        if (vtSettings) {
          vtSettings.forEach((s) => {
            const driverId = s.key.replace('vehicle_type_', '');
            vehicleTypeMap[driverId] = s.value;
          });
        }
      } catch (_) {}

      const mapped = (driversData || []).map((d) => {
        const loc = locationsMap[d.id];
        const activeTrip = activeTripsMap[d.id] || null;
        return {
          id: d.id,
          lat: parseFloat(loc?.lat || d.current_lat || 0),
          lng: parseFloat(loc?.lng || d.current_lng || 0),
          speed: parseFloat(loc?.speed || 0),
          heading: parseFloat(loc?.heading || 0),
          isOnline: loc ? loc.is_online : d.is_available,
          updatedAt: loc?.updated_at || d.updated_at,
          fullName: d.full_name || 'Sin nombre',
          driverNumber: d.driver_number || null,
          phone: d.phone || '',
          photoUrl: d.photo_url || '',
          vehicleBrand: d.vehicle_brand || '',
          vehicleModel: d.vehicle_model || '',
          vehiclePlate: d.vehicle_plate || '',
          vehicleColor: d.vehicle_color || '',
          vehicleType: d.vehicle_type || vehicleTypeMap[d.id] || 'auto',
          isAvailable: d.is_available || false,
          rating: parseFloat(d.rating || 5),
          totalTrips: d.total_trips || 0,
          activeTrip,
        };
      });

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
