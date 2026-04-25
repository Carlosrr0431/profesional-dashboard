import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useDriverManagement() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  const fetchDrivers = useCallback(async () => {
    try {
      const response = await fetch('/api/driver-management/drivers', { cache: 'no-store' });
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
      .channel('driver_mgmt_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => fetchDrivers())
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
    try {
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

      // Refrescar la lista de drivers
      await fetchDrivers();
    } catch (error) {
      console.error('Error recording commission payment:', {
        status: error?.status || null,
        code: error?.code || null,
        message: error?.message || String(error),
        details: error?.details || null,
      });
      throw error;
    }
  }, [fetchDrivers]);

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
  };
}
