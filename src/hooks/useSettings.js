import { useState, useEffect, useCallback } from 'react';

export function useSettings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) {
        console.error('Error fetching settings:', {
          status: response.status,
          code: payload?.error?.code || null,
          message: payload?.error?.message || 'Request failed',
          details: payload?.error?.details || null,
        });
        setLoading(false);
        return;
      }

      const map = {};
      (payload?.data || []).forEach((row) => { map[row.key] = row.value; });
      setSettings(map);
    } catch (error) {
      console.error('Error fetching settings:', {
        message: error?.message || String(error),
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSetting = useCallback(async (key, value) => {
    const strValue = String(value);
    setSettings((prev) => ({ ...prev, [key]: strValue }));

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: strValue }),
      });
      const payload = await response.json();
      if (!response.ok) {
        console.error('Error updating setting:', {
          status: response.status,
          code: payload?.error?.code || null,
          message: payload?.error?.message || 'Request failed',
          details: payload?.error?.details || null,
        });
        fetchSettings();
      }
    } catch (error) {
      console.error('Error updating setting:', {
        message: error?.message || String(error),
      });
      fetchSettings();
    }
  }, [fetchSettings]);

  const tariffPerKm = parseFloat(settings.tariff_per_km) || 0;
  const tariffBase = parseFloat(settings.tariff_base) || 0;
  const commissionPercent = parseFloat(settings.commission_percent) || 10;
  const whatsappAmtFare = parseFloat(settings.whatsapp_amt_fare) || 0;
  const whatsappDriverCommission = parseFloat(settings.whatsapp_driver_commission) || 0;

  const calculatePrice = useCallback((distanceKm) => {
    if (!distanceKm || distanceKm <= 0) return null;
    return Math.round(tariffBase + tariffPerKm * distanceKm);
  }, [tariffPerKm, tariffBase]);

  return {
    settings,
    loading,
    tariffPerKm,
    tariffBase,
    commissionPercent,
    whatsappAmtFare,
    whatsappDriverCommission,
    updateSetting,
    calculatePrice,
    refetch: fetchSettings,
  };
}
