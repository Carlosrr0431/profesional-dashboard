import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

function patchDriverInList(list, driverId, patch) {
  return list.map((driver) => (driver.id === driverId ? { ...driver, ...patch } : driver));
}

export function useDriverManagement() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  const fetchDrivers = useCallback(async () => {
    try {
      const response = await fetch('/api/driver-management/drivers', { cache: 'no-store' });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return;

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

  const patchDriver = useCallback((driverId, patch) => {
    setDrivers((prev) => patchDriverInList(prev, driverId, patch));
  }, []);

  useEffect(() => {
    fetchDrivers();
    channelRef.current = supabase
      .channel('driver_mgmt_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => fetchDrivers())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => fetchDrivers())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commission_payments' }, () => fetchDrivers())
      .subscribe();
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchDrivers]);

  const createDriver = useCallback(async ({ email, password, ...profileData }) => {
    const response = await fetch('/api/driver-management/drivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, profileData }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw {
        status: response.status,
        code: payload?.error?.code || null,
        message: payload?.error?.message || 'Request failed',
        details: payload?.error?.details || null,
      };
    }

    await fetchDrivers();
    return payload?.data || null;
  }, [fetchDrivers]);

  const updateDriver = useCallback(async (driverId, updates) => {
    const response = await fetch(`/api/driver-management/drivers/${encodeURIComponent(driverId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw {
        status: response.status,
        code: payload?.error?.code || null,
        message: payload?.error?.message || 'Request failed',
        details: payload?.error?.details || null,
      };
    }
    await fetchDrivers();
  }, [fetchDrivers]);

  const getDriverTrips = useCallback(async (driverId) => {
    const response = await fetch(`/api/driver-trips-snapshot/${encodeURIComponent(driverId)}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) {
      throw {
        status: response.status,
        code: payload?.error?.code || null,
        message: payload?.error?.message || 'Request failed',
        details: payload?.error?.details || null,
      };
    }
    return payload?.data?.trips || [];
  }, []);

  const getDriverCommissionPayments = useCallback(async (driverId) => {
    const response = await fetch(`/api/driver-trips-snapshot/${encodeURIComponent(driverId)}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) {
      throw {
        status: response.status,
        code: payload?.error?.code || null,
        message: payload?.error?.message || 'Request failed',
        details: payload?.error?.details || null,
      };
    }
    return payload?.data?.commissionPayments || [];
  }, []);

  const getDriverPendingCommission = useCallback(async (driverId) => {
    const response = await fetch(`/api/driver-management/financials/${encodeURIComponent(driverId)}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) {
      throw {
        status: response.status,
        code: payload?.error?.code || null,
        message: payload?.error?.message || 'Request failed',
        details: payload?.error?.details || null,
      };
    }
    return {
      pending_commission: payload?.data?.pending_commission || 0,
      last_commission_payment_at: payload?.data?.last_commission_payment_at || null,
    };
  }, []);

  const getDriverCommissionAccumulation = useCallback(async (driverId) => {
    const response = await fetch(`/api/driver-management/financials/${encodeURIComponent(driverId)}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) {
      throw {
        status: response.status,
        code: payload?.error?.code || null,
        message: payload?.error?.message || 'Request failed',
        details: payload?.error?.details || null,
      };
    }
    return payload?.data?.accumulation || [];
  }, []);

  const recordCommissionPayment = useCallback(async (driverId, amount, notes) => {
    const response = await fetch('/api/driver-management/commission-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId, amount, notes: notes || null }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw {
        status: response.status,
        code: payload?.error?.code || null,
        message: payload?.error?.message || 'Request failed',
        details: payload?.error?.details || null,
      };
    }

    const pendingCommission = payload?.data?.pending_commission;
    if (pendingCommission !== undefined) {
      patchDriver(driverId, {
        pending_commission: pendingCommission,
        last_commission_payment_at: new Date().toISOString(),
      });
    }

    await fetchDrivers();
    return {
      pending_commission: pendingCommission ?? 0,
      amountPaid: amount,
    };
  }, [fetchDrivers, patchDriver]);

  const toggleCommissionBlock = useCallback(async (driverId) => {
    const financialsResponse = await fetch(`/api/driver-management/financials/${encodeURIComponent(driverId)}`, { cache: 'no-store' });
    const financialsPayload = await financialsResponse.json();
    if (!financialsResponse.ok) {
      throw {
        status: financialsResponse.status,
        code: financialsPayload?.error?.code || null,
        message: financialsPayload?.error?.message || 'Request failed',
        details: financialsPayload?.error?.details || null,
      };
    }

    const pendingFromDb = parseFloat(financialsPayload?.data?.pending_commission || 0);
    let amountToPay = pendingFromDb;

    if (amountToPay <= 0) {
      const snapshotResponse = await fetch(`/api/driver-trips-snapshot/${encodeURIComponent(driverId)}`, { cache: 'no-store' });
      const snapshotPayload = await snapshotResponse.json();
      if (!snapshotResponse.ok) {
        throw {
          status: snapshotResponse.status,
          code: snapshotPayload?.error?.code || null,
          message: snapshotPayload?.error?.message || 'Request failed',
          details: snapshotPayload?.error?.details || null,
        };
      }

      const trips = snapshotPayload?.data?.trips || [];
      const payments = snapshotPayload?.data?.commissionPayments || [];
      const totalCommission = trips
        .filter((trip) => trip?.status === 'completed')
        .reduce((sum, trip) => sum + (parseFloat(trip?.commission_amount) || 0), 0);
      const totalPaid = payments.reduce((sum, payment) => sum + (parseFloat(payment?.amount) || 0), 0);
      amountToPay = Math.round((totalCommission - totalPaid) * 100) / 100;
    }

    if (amountToPay <= 0) {
      patchDriver(driverId, { pending_commission: 0 });
      await fetchDrivers();
      return { pending_commission: 0, amountPaid: 0 };
    }

    return recordCommissionPayment(
      driverId,
      amountToPay,
      'Ajuste manual: marcado como comision pagada desde Gestion de Choferes'
    );
  }, [fetchDrivers, patchDriver, recordCommissionPayment]);

  return {
    drivers,
    loading,
    refetch: fetchDrivers,
    createDriver,
    updateDriver,
    getDriverTrips,
    getDriverCommissionPayments,
    getDriverPendingCommission,
    getDriverCommissionAccumulation,
    recordCommissionPayment,
    toggleCommissionBlock,
    patchDriver,
  };
}
