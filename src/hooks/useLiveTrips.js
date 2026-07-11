import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const ACTIVE_STATUSES = new Set(['pending', 'accepted', 'going_to_pickup', 'in_progress']);
const TRIP_SELECT =
  'id, passenger_name, passenger_phone, origin_address, destination_address, ' +
  'status, created_at, accepted_at, started_at, completed_at, notes, driver_id, ' +
  'cancel_reason, price, distance_km, duration_minutes, commission_amount, dispatch_status';

function formatFetchError(err) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Error desconocido';
  }
}

function isToday(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr).toDateString() === new Date().toDateString();
}

function mapTrip(trip, driversMap) {
  return {
    id: trip.id,
    passengerName: trip.passenger_name || 'Pasajero',
    passengerPhone: trip.passenger_phone || '',
    pickupAddress: trip.destination_address || trip.origin_address || '—',
    driverOrigin: trip.origin_address || null,
    destination: trip.destination_address || null,
    status: trip.status,
    cancelReason: trip.cancel_reason || null,
    createdAt: trip.created_at,
    acceptedAt: trip.accepted_at,
    startedAt: trip.started_at,
    completedAt: trip.completed_at,
    price: trip.price != null ? Number(trip.price) : null,
    distanceKm: trip.distance_km != null ? Number(trip.distance_km) : null,
    durationMinutes: trip.duration_minutes != null ? Number(trip.duration_minutes) : null,
    commissionAmount: trip.commission_amount != null ? Number(trip.commission_amount) : null,
    notes: trip.notes || null,
    driver: trip.driver_id ? driversMap[trip.driver_id] || null : null,
    isToday: isToday(trip.created_at),
    isActive: ACTIVE_STATUSES.has(trip.status),
  };
}

export function useLiveTrips() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const channelRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const { data: rawTrips, error } = await supabase
        .from('trips')
        .select(TRIP_SELECT)
        .neq('status', 'scheduled')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const filtered = (rawTrips || []).filter(
        (t) => !(t.status === 'queued' && t.dispatch_status === 'hold'),
      );

      const driverIds = [...new Set(filtered.map((t) => t.driver_id).filter(Boolean))];
      let driversMap = {};
      if (driverIds.length > 0) {
        const { data: driversData, error: driversErr } = await supabase
          .from('drivers')
          .select('id, full_name, vehicle_plate, vehicle_brand, vehicle_model, vehicle_color')
          .in('id', driverIds);
        if (driversErr) throw driversErr;
        (driversData || []).forEach((d) => {
          driversMap[d.id] = d;
        });
      }

      setTrips(filtered.map((t) => mapTrip(t, driversMap)));
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[useLiveTrips] Error:', formatFetchError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel('live-trips-monitor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, fetchAll)
      .subscribe();

    channelRef.current = channel;
    const fallbackPoll = setInterval(fetchAll, 30000);

    return () => {
      clearInterval(fallbackPoll);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchAll]);

  const stats = useMemo(() => {
    const today = trips.filter((t) => t.isToday);
    return {
      total: trips.length,
      active: trips.filter((t) => t.isActive).length,
      queued: trips.filter((t) => t.status === 'queued').length,
      completedToday: today.filter((t) => t.status === 'completed').length,
      cancelledToday: today.filter((t) => t.status === 'cancelled').length,
    };
  }, [trips]);

  return { trips, stats, loading, lastUpdated, refetch: fetchAll };
}
