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

      // Fetch commission data for all drivers
      let commissionMap = {}; // driverId -> { total, paid, balance, isOverdue }
      try {
        const { data: commTrips } = await supabase
          .from('trips')
          .select('driver_id, commission_amount, completed_at')
          .eq('status', 'completed')
          .gt('commission_amount', 0);

        const { data: commPayments } = await supabase
          .from('commission_payments')
          .select('driver_id, amount, created_at')
          .order('created_at', { ascending: false });

        // Aggregate commissions per driver
        const driverComm = {};
        (commTrips || []).forEach((t) => {
          if (!driverComm[t.driver_id]) driverComm[t.driver_id] = { total: 0, trips: [] };
          driverComm[t.driver_id].total += parseFloat(t.commission_amount) || 0;
          driverComm[t.driver_id].trips.push(t);
        });

        // Aggregate payments per driver
        const driverPaid = {};
        (commPayments || []).forEach((p) => {
          if (!driverPaid[p.driver_id]) driverPaid[p.driver_id] = { total: 0, lastDate: null };
          driverPaid[p.driver_id].total += parseFloat(p.amount) || 0;
          if (!driverPaid[p.driver_id].lastDate) driverPaid[p.driver_id].lastDate = p.created_at;
        });

        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        Object.keys(driverComm).forEach((dId) => {
          const total = driverComm[dId].total;
          const paid = driverPaid[dId]?.total || 0;
          const balance = Math.round((total - paid) * 100) / 100;
          const lastPayDate = driverPaid[dId]?.lastDate ? new Date(driverPaid[dId].lastDate) : null;
          const trips = driverComm[dId].trips.sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));
          const unpaid = lastPayDate
            ? trips.filter((t) => new Date(t.completed_at) > lastPayDate)
            : trips;
          const oldest = unpaid.length > 0 ? unpaid[0] : null;
          const isOverdue = balance > 0 && oldest && new Date(oldest.completed_at) < threeDaysAgo;
          commissionMap[dId] = { total, paid, balance, isOverdue };
        });
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
          commissionBalance: commissionMap[d.id]?.balance || 0,
          commissionOverdue: commissionMap[d.id]?.isOverdue || false,
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
