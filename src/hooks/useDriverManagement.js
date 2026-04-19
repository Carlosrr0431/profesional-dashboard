import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useDriverManagement() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  const fetchDrivers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDrivers(data || []);
    } catch (err) {
      console.error('Error fetching drivers:', err);
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
    // Use Supabase Auth admin to create user, then insert driver profile
    // Since we're using anon key, we use signUp to create the auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: profileData.full_name } },
    });
    if (authError) throw authError;
    if (!authData.user) throw new Error('No se pudo crear el usuario');

    const driverRow = {
      user_id: authData.user.id,
      full_name: profileData.full_name || '',
      phone: profileData.phone || null,
      driver_number: profileData.driver_number ? parseInt(profileData.driver_number) : null,
      vehicle_brand: profileData.vehicle_brand || null,
      vehicle_model: profileData.vehicle_model || null,
      vehicle_year: profileData.vehicle_year ? parseInt(profileData.vehicle_year) : null,
      vehicle_plate: profileData.vehicle_plate || null,
      vehicle_color: profileData.vehicle_color || null,
      vehicle_type: profileData.vehicle_type || 'auto',
      license_expiry: profileData.license_expiry || null,
    };

    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .insert(driverRow)
      .select()
      .single();
    if (driverError) throw driverError;

    await fetchDrivers();
    return driver;
  }, [fetchDrivers]);

  const updateDriver = useCallback(async (driverId, updates) => {
    const { error } = await supabase
      .from('drivers')
      .update(updates)
      .eq('id', driverId);
    if (error) throw error;
    await fetchDrivers();
  }, [fetchDrivers]);

  const getDriverTrips = useCallback(async (driverId) => {
    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }, []);

  const getDriverCommissionPayments = useCallback(async (driverId) => {
    const { data, error } = await supabase
      .from('commission_payments')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }, []);

  const getDriverPendingCommission = useCallback(async (driverId) => {
    const { data, error } = await supabase
      .from('drivers')
      .select('pending_commission, last_commission_payment_at')
      .eq('id', driverId)
      .single();
    if (error) throw error;
    return data || { pending_commission: 0, last_commission_payment_at: null };
  }, []);

  const getDriverCommissionAccumulation = useCallback(async (driverId) => {
    const { data, error } = await supabase
      .from('commission_accumulation_log')
      .select('*')
      .eq('driver_id', driverId)
      .eq('status', 'pending')
      .order('accumulated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }, []);

  const recordCommissionPayment = useCallback(async (driverId, amount, notes) => {
    try {
      // 1. Registrar el pago en commission_payments
      const { error: paymentError } = await supabase
        .from('commission_payments')
        .insert({ driver_id: driverId, amount, notes: notes || null });
      if (paymentError) throw paymentError;

      // 2. Obtener el saldo actual y actualizar
      const { data: driver, error: getError } = await supabase
        .from('drivers')
        .select('pending_commission')
        .eq('id', driverId)
        .single();
      if (getError) throw getError;

      const newBalance = Math.max(0, (driver?.pending_commission || 0) - amount);
      const { error: updateError } = await supabase
        .from('drivers')
        .update({
          pending_commission: newBalance,
          last_commission_payment_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', driverId);
      if (updateError) throw updateError;

      // 3. Marcar los registros de acumulación como pagados (los más antiguos primero)
      // Esto es informativo para auditoría
      const { data: pendingAccumulations, error: fetchError } = await supabase
        .from('commission_accumulation_log')
        .select('id')
        .eq('driver_id', driverId)
        .eq('status', 'pending')
        .order('accumulated_at', { ascending: true })
        .limit(Math.ceil(amount / 100)); // Aproximación - ajustar según tu lógica

      if (!fetchError && pendingAccumulations?.length > 0) {
        const idsToUpdate = pendingAccumulations.map(acc => acc.id);
        await supabase
          .from('commission_accumulation_log')
          .update({ status: 'paid' })
          .in('id', idsToUpdate);
      }

      // Refrescar la lista de drivers
      await fetchDrivers();
    } catch (error) {
      console.error('Error recording commission payment:', error);
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
