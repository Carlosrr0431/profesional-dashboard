import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useDriverTrips(driverId) {
  const [trips, setTrips] = useState([]);
  const [commissionPayments, setCommissionPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef(null);
  const commChannelRef = useRef(null);

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

  const fetchCommissionPayments = useCallback(async () => {
    if (!driverId) return;
    try {
      const { data, error } = await supabase
        .from('commission_payments')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false });
      if (!error) setCommissionPayments(data || []);
    } catch (err) {
      console.error('Error fetching commission payments:', err);
    }
  }, [driverId]);

  useEffect(() => {
    if (!driverId) {
      setTrips([]);
      setCommissionPayments([]);
      return;
    }
    fetchTrips();
    fetchCommissionPayments();

    // Realtime subscription for this driver's trips
    channelRef.current = supabase
      .channel(`trips_driver_${driverId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips', filter: `driver_id=eq.${driverId}` },
        () => fetchTrips()
      )
      .subscribe();

    // Realtime subscription for commission payments
    commChannelRef.current = supabase
      .channel(`commissions_driver_${driverId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'commission_payments', filter: `driver_id=eq.${driverId}` },
        () => fetchCommissionPayments()
      )
      .subscribe();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (commChannelRef.current) supabase.removeChannel(commChannelRef.current);
    };
  }, [driverId, fetchTrips, fetchCommissionPayments]);

  // Computed stats
  const stats = computeStats(trips, commissionPayments);

  return { trips, commissionPayments, loading, stats, refetch: fetchTrips, refetchPayments: fetchCommissionPayments };
}

function computeStats(trips, commissionPayments = []) {
  const completed = trips.filter((t) => t.status === 'completed');
  const cancelled = trips.filter((t) => t.status === 'cancelled');
  const inProgress = trips.find(
    (t) => t.status === 'in_progress' || t.status === 'going_to_pickup' || t.status === 'accepted'
  );

  const totalEarnings = completed.reduce((s, t) => s + (parseFloat(t.price) || 0), 0);
  const totalKm = completed.reduce((s, t) => s + (parseFloat(t.distance_km) || 0), 0);
  const totalMinutes = completed.reduce((s, t) => s + (parseInt(t.duration_minutes) || 0), 0);

  // Commission stats
  const totalCommission = completed.reduce((s, t) => s + (parseFloat(t.commission_amount) || 0), 0);
  const totalPaid = commissionPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const commissionBalance = Math.round((totalCommission - totalPaid) * 100) / 100;

  // Check if overdue (last payment or first trip > 3 days ago)
  const lastPayment = commissionPayments.length > 0 ? new Date(commissionPayments[0].created_at) : null;
  const oldestUnpaidTrip = findOldestUnpaidTrip(completed, commissionPayments);
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const isOverdue = commissionBalance > 0 && oldestUnpaidTrip && new Date(oldestUnpaidTrip.completed_at) < threeDaysAgo;

  // Today stats
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTrips = completed.filter((t) => new Date(t.completed_at) >= todayStart);
  const todayEarnings = todayTrips.reduce((s, t) => s + (parseFloat(t.price) || 0), 0);
  const todayKm = todayTrips.reduce((s, t) => s + (parseFloat(t.distance_km) || 0), 0);
  const todayCommission = todayTrips.reduce((s, t) => s + (parseFloat(t.commission_amount) || 0), 0);

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
    todayCommission,
    totalCommission,
    totalPaid,
    commissionBalance,
    isOverdue,
    lastPayment,
  };
}

function findOldestUnpaidTrip(completedTrips, payments) {
  if (completedTrips.length === 0) return null;
  const lastPaymentDate = payments.length > 0 ? new Date(payments[0].created_at) : null;
  // Find oldest completed trip after last payment
  const unpaid = lastPaymentDate
    ? completedTrips.filter((t) => new Date(t.completed_at) > lastPaymentDate && parseFloat(t.commission_amount) > 0)
    : completedTrips.filter((t) => parseFloat(t.commission_amount) > 0);
  if (unpaid.length === 0) return null;
  return unpaid[unpaid.length - 1]; // oldest (list is desc sorted)
}
