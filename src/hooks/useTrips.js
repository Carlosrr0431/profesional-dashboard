import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useDriverTrips(driverId) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef(null);

  const fetchTrips = useCallback(async () => {
    if (!driverId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setTrips(data || []);
    } catch (err) {
      console.error('Error fetching trips:', err);
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
    if (!driverId) {
      setTrips([]);
      return;
    }
    fetchTrips();

    // Realtime subscription for this driver's trips
    channelRef.current = supabase
      .channel(`trips_driver_${driverId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips', filter: `driver_id=eq.${driverId}` },
        () => fetchTrips()
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [driverId, fetchTrips]);

  // Computed stats
  const stats = computeStats(trips);

  return { trips, loading, stats, refetch: fetchTrips };
}

function computeStats(trips) {
  const completed = trips.filter((t) => t.status === 'completed');
  const cancelled = trips.filter((t) => t.status === 'cancelled');
  const inProgress = trips.find(
    (t) => t.status === 'in_progress' || t.status === 'going_to_pickup' || t.status === 'accepted'
  );

  const totalEarnings = completed.reduce((s, t) => s + (parseFloat(t.price) || 0), 0);
  const totalKm = completed.reduce((s, t) => s + (parseFloat(t.distance_km) || 0), 0);
  const totalMinutes = completed.reduce((s, t) => s + (parseInt(t.duration_minutes) || 0), 0);

  // Today stats
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTrips = completed.filter((t) => new Date(t.completed_at) >= todayStart);
  const todayEarnings = todayTrips.reduce((s, t) => s + (parseFloat(t.price) || 0), 0);
  const todayKm = todayTrips.reduce((s, t) => s + (parseFloat(t.distance_km) || 0), 0);

  return {
    total: trips.length,
    completed: completed.length,
    cancelled: cancelled.length,
    inProgress,
    totalEarnings,
    totalKm: Math.round(totalKm * 10) / 10,
    totalMinutes,
    todayTrips: todayTrips.length,
    todayEarnings,
    todayKm: Math.round(todayKm * 10) / 10,
  };
}
