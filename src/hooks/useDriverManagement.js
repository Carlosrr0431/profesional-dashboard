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

  const recordCommissionPayment = useCallback(async (driverId, amount, notes) => {
    const { error } = await supabase
      .from('commission_payments')
      .insert({ driver_id: driverId, amount, notes: notes || null });
    if (error) throw error;
  }, []);

  return {
    drivers,
    loading,
    refetch: fetchDrivers,
    createDriver,
    updateDriver,
    getDriverTrips,
    getDriverCommissionPayments,
    recordCommissionPayment,
  };
}
