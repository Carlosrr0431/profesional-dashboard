import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useDriverTrips(driverId) {
  const [trips, setTrips] = useState([]);
  const [commissionPayments, setCommissionPayments] = useState([]);
  const [driverFinancials, setDriverFinancials] = useState({
    pendingCommission: 0,
    lastCommissionPaymentAt: null,
  });
  const [loading, setLoading] = useState(false);
  const channelRef = useRef(null);
  const commChannelRef = useRef(null);

  const fetchSnapshot = useCallback(async () => {
    if (!driverId) {
      return {
        trips: [],
        commissionPayments: [],
        pendingCommission: 0,
        lastCommissionPaymentAt: null,
      };
    }
    const response = await fetch(`/api/driver-trips-snapshot/${encodeURIComponent(driverId)}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) {
      const enriched = {
        status: response.status,
        code: payload?.error?.code || null,
        message: payload?.error?.message || 'Request failed',
        details: payload?.error?.details || null,
      };
      throw enriched;
    }
    return {
      trips: payload?.data?.trips || [],
      commissionPayments: payload?.data?.commissionPayments || [],
      pendingCommission: Number(payload?.data?.pendingCommission) || 0,
      lastCommissionPaymentAt: payload?.data?.lastCommissionPaymentAt || null,
    };
  }, [driverId]);

  const fetchTrips = useCallback(async () => {
    if (!driverId) return;
    setLoading(true);
    try {
      const snapshot = await fetchSnapshot();
      setTrips(snapshot.trips);
      setCommissionPayments(snapshot.commissionPayments);
      setDriverFinancials({
        pendingCommission: snapshot.pendingCommission,
        lastCommissionPaymentAt: snapshot.lastCommissionPaymentAt,
      });
    } catch (err) {
      console.error('Error fetching trips:', {
        status: err?.status || null,
        code: err?.code || null,
        message: err?.message || String(err),
        details: err?.details || null,
      });
    } finally {
      setLoading(false);
    }
  }, [driverId, fetchSnapshot]);

  const fetchCommissionPayments = useCallback(async () => {
    if (!driverId) return;
    try {
      const snapshot = await fetchSnapshot();
      setCommissionPayments(snapshot.commissionPayments);
      setDriverFinancials({
        pendingCommission: snapshot.pendingCommission,
        lastCommissionPaymentAt: snapshot.lastCommissionPaymentAt,
      });
    } catch (err) {
      console.error('Error fetching commission payments:', {
        status: err?.status || null,
        code: err?.code || null,
        message: err?.message || String(err),
        details: err?.details || null,
      });
    }
  }, [driverId, fetchSnapshot]);

  useEffect(() => {
    if (!driverId) {
      setTrips([]);
      setCommissionPayments([]);
      setDriverFinancials({ pendingCommission: 0, lastCommissionPaymentAt: null });
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
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'drivers', filter: `id=eq.${driverId}` },
        () => fetchTrips()
      )
      .subscribe();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (commChannelRef.current) supabase.removeChannel(commChannelRef.current);
    };
  }, [driverId, fetchTrips, fetchCommissionPayments]);

  // Computed stats
  const stats = computeStats(trips, commissionPayments, driverFinancials);

  return { trips, commissionPayments, loading, stats, refetch: fetchTrips, refetchPayments: fetchCommissionPayments };
}

function computeStats(
  trips,
  commissionPayments = [],
  { pendingCommission = 0, lastCommissionPaymentAt = null } = {}
) {
  const completed = trips.filter((t) => t.status === 'completed');
  const cancelled = trips.filter((t) => t.status === 'cancelled');
  const inProgress = trips.find(
    (t) => t.status === 'in_progress' || t.status === 'going_to_pickup' || t.status === 'accepted'
  );

  const totalEarnings = completed.reduce((s, t) => s + (parseFloat(t.price) || 0), 0);
  const totalKm = completed.reduce((s, t) => s + (parseFloat(t.distance_km) || 0), 0);
  const totalMinutes = completed.reduce((s, t) => s + (parseInt(t.duration_minutes) || 0), 0);

  // Commission stats (informativos)
  const totalCommission = completed.reduce((s, t) => s + (parseFloat(t.commission_amount) || 0), 0);
  const totalPaid = commissionPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const rawCommissionBalance = Math.round((totalCommission - totalPaid) * 100) / 100;

  // pending_commission en drivers es la fuente de verdad operativa (igual que Gestión de Choferes).
  const pendingFromDb = Math.max(0, Math.round((Number(pendingCommission) || 0) * 100) / 100);
  const commissionBalance = pendingFromDb > 0
    ? pendingFromDb
    : Math.max(0, rawCommissionBalance);
  const commissionCredit = pendingFromDb > 0
    ? 0
    : Math.max(0, Math.round((totalPaid - totalCommission) * 100) / 100);

  const lastPayment = lastCommissionPaymentAt
    ? new Date(lastCommissionPaymentAt)
    : (commissionPayments.length > 0 ? new Date(commissionPayments[0].created_at) : null);
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const isOverdue = commissionBalance > 0 && (!lastPayment || lastPayment < threeDaysAgo);

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
    commissionCredit,
    commissionBalance,
    isOverdue,
    lastPayment,
  };
}

