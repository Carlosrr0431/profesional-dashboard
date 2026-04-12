import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useSettings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    const { data, error } = await supabase.from('settings').select('*');
    if (!error && data) {
      const map = {};
      data.forEach((row) => { map[row.key] = row.value; });
      setSettings(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSetting = useCallback(async (key, value) => {
    const strValue = String(value);
    setSettings((prev) => ({ ...prev, [key]: strValue }));

    const { error } = await supabase
      .from('settings')
      .upsert({ key, value: strValue, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (error) {
      console.error('Error updating setting:', error);
      fetchSettings(); // revert on error
    }
  }, [fetchSettings]);

  const tariffPerKm = parseFloat(settings.tariff_per_km) || 0;
  const tariffBase = parseFloat(settings.tariff_base) || 0;

  const calculatePrice = useCallback((distanceKm) => {
    if (!distanceKm || distanceKm <= 0) return null;
    return Math.round(tariffBase + tariffPerKm * distanceKm);
  }, [tariffPerKm, tariffBase]);

  return {
    settings,
    loading,
    tariffPerKm,
    tariffBase,
    updateSetting,
    calculatePrice,
    refetch: fetchSettings,
  };
}
