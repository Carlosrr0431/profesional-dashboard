import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';

const SETTING_LABELS = {
  platform_tariff_per_km: 'Tarifa por km (plataforma)',
  platform_tariff_base: 'Tarifa base (plataforma)',
  platform_commission_percent: 'Comisión (plataforma)',
  passenger_app_tariff_per_km: 'Tarifa app pasajeros por km',
  passenger_app_tariff_base: 'Tarifa base app pasajeros',
  passenger_app_commission_percent: 'Comisión app pasajeros',
};

const NUMERIC_SETTING_KEYS = new Set([
  'platform_tariff_per_km',
  'platform_tariff_base',
  'platform_commission_percent',
  'passenger_app_tariff_per_km',
  'passenger_app_tariff_base',
  'passenger_app_commission_percent',
]);

function normalizeNumericSettingValue(key, value) {
  const trimmed = String(value ?? '').trim().replace(',', '.');
  if (trimmed === '') return '0';

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return '0';

  let normalized = Math.round(parsed);
  if (key.endsWith('_commission_percent') && normalized > 100) {
    normalized = 100;
  }

  return String(normalized);
}

export function useSettings() {
  const toast = useToast();
  const toastTimerRef = useRef(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

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
      (payload?.data || []).forEach((row) => {
        map[row.key] = NUMERIC_SETTING_KEYS.has(row.key)
          ? normalizeNumericSettingValue(row.key, row.value)
          : row.value;
      });
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

    // Suscripción Realtime: cualquier cambio en settings se refleja automáticamente
    // (útil cuando otro operador modifica tarifas o comisiones desde otro browser)
    channelRef.current = supabase
      .channel('settings_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, fetchSettings)
      .subscribe();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchSettings]);

  const updateSetting = useCallback(async (key, value) => {
    const strValue = NUMERIC_SETTING_KEYS.has(key)
      ? normalizeNumericSettingValue(key, value)
      : String(value);
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
        toast.error('No se pudo guardar la configuración');
        fetchSettings();
        return;
      }

      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        toast.success(`${SETTING_LABELS[key] || 'Configuración'} actualizada`);
      }, 700);
    } catch (error) {
      console.error('Error updating setting:', {
        message: error?.message || String(error),
      });
      toast.error('No se pudo guardar la configuración');
      fetchSettings();
    }
  }, [fetchSettings, toast]);

  const tariffPerKm = parseFloat(settings.platform_tariff_per_km) || 0;
  const tariffBase = parseFloat(settings.platform_tariff_base) || 0;
  const commissionPercent = parseFloat(settings.platform_commission_percent) || 10;
  const passengerAppTariffPerKm = parseFloat(settings.passenger_app_tariff_per_km) || 0;
  const passengerAppTariffBase = parseFloat(settings.passenger_app_tariff_base) || 0;
  const passengerAppCommissionPercent = parseFloat(settings.passenger_app_commission_percent) || 0;

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
    passengerAppTariffPerKm,
    passengerAppTariffBase,
    passengerAppCommissionPercent,
    updateSetting,
    calculatePrice,
    refetch: fetchSettings,
  };
}
