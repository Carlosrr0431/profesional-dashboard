import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { resolveChannelTariff } from '../lib/resolveTariff';

const SETTING_LABELS = {
  platform_tariff_per_km: 'Tarifa por km (plataforma)',
  platform_tariff_base: 'Tarifa base (plataforma)',
  platform_commission_percent: 'Comisión (plataforma)',
  passenger_app_tariff_per_km: 'Tarifa app pasajeros por km',
  passenger_app_tariff_base: 'Tarifa base app pasajeros',
  passenger_app_commission_percent: 'Comisión app pasajeros',
  passenger_web_tariff_per_km: 'Tarifa web pasajeros por km',
  passenger_web_tariff_base: 'Tarifa base web pasajeros',
  passenger_web_commission_percent: 'Comisión web pasajeros',
  whatsapp_agent_enabled: 'Agente IA de WhatsApp',
  driver_app_latest_version_code: 'versionCode app Conductor',
  passenger_app_latest_version_code: 'versionCode app Pasajero',
};

function isTruthySetting(value, defaultValue = true) {
  if (value == null || String(value).trim() === '') {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return true;
}

const NUMERIC_SETTING_KEYS = new Set([
  'platform_tariff_per_km',
  'platform_tariff_base',
  'platform_commission_percent',
  'passenger_app_tariff_per_km',
  'passenger_app_tariff_base',
  'passenger_app_commission_percent',
  'passenger_web_tariff_per_km',
  'passenger_web_tariff_base',
  'passenger_web_commission_percent',
  'driver_app_latest_version_code',
  'passenger_app_latest_version_code',
]);

const VERSION_CODE_SETTING_KEYS = new Set([
  'driver_app_latest_version_code',
  'passenger_app_latest_version_code',
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
  if (VERSION_CODE_SETTING_KEYS.has(key) && normalized < 1) {
    normalized = 1;
  }

  return String(normalized);
}

export function useSettings() {
  const toast = useToast();
  const toastTimerRef = useRef(null);
  const [settings, setSettings] = useState({});
  const [tariffWindows, setTariffWindows] = useState([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  const fetchWindows = useCallback(async () => {
    try {
      const response = await fetch('/api/tariff-windows', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) return;
      setTariffWindows(Array.isArray(payload?.data) ? payload.data : []);
    } catch (error) {
      console.error('Error fetching tariff windows:', {
        message: error?.message || String(error),
      });
    }
  }, []);

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
    fetchWindows();

    // Nombre único: App y Zonas montan useSettings a la vez.
    // Reusar `settings_realtime` tira "cannot add postgres_changes after subscribe()".
    const channel = supabase
      .channel(`settings_realtime_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, fetchSettings)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tariff_windows' }, fetchWindows)
      .subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [fetchSettings, fetchWindows]);

  const updateSetting = useCallback(async (key, value) => {
    const strValue = NUMERIC_SETTING_KEYS.has(key)
      ? normalizeNumericSettingValue(key, value)
      : String(value);
    const toastPosition = key === 'whatsapp_agent_enabled'
      ? { position: 'bottom-center' }
      : undefined;
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
        toast.error('No se pudo guardar la configuración', toastPosition);
        fetchSettings();
        return;
      }

      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        toast.success(`${SETTING_LABELS[key] || 'Configuración'} actualizada`, toastPosition);
      }, 700);
    } catch (error) {
      console.error('Error updating setting:', {
        message: error?.message || String(error),
      });
      toast.error('No se pudo guardar la configuración', toastPosition);
      fetchSettings();
    }
  }, [fetchSettings, toast]);

  const saveTariffWindow = useCallback(async (body) => {
    const method = body?.id ? 'PATCH' : 'POST';
    try {
      const response = await fetch('/api/tariff-windows', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        toast.error(payload?.error?.message || 'No se pudo guardar la franja');
        return false;
      }
      toast.success(body?.id ? 'Franja actualizada' : 'Franja agregada');
      await fetchWindows();
      return true;
    } catch (error) {
      toast.error(error?.message || 'No se pudo guardar la franja');
      return false;
    }
  }, [fetchWindows, toast]);

  const deleteTariffWindow = useCallback(async (id) => {
    try {
      const response = await fetch(`/api/tariff-windows?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        toast.error(payload?.error?.message || 'No se pudo borrar la franja');
        return false;
      }
      toast.success('Franja eliminada');
      await fetchWindows();
      return true;
    } catch (error) {
      toast.error(error?.message || 'No se pudo borrar la franja');
      return false;
    }
  }, [fetchWindows, toast]);

  const platformDefaultPerKm = parseFloat(settings.platform_tariff_per_km) || 0;
  const platformDefaultBase = parseFloat(settings.platform_tariff_base) || 0;
  const platformDefaultCommission = parseFloat(settings.platform_commission_percent) || 10;
  const passengerAppTariffPerKm = parseFloat(settings.passenger_app_tariff_per_km) || 0;
  const passengerAppTariffBase = parseFloat(settings.passenger_app_tariff_base) || 0;
  const passengerAppCommissionPercent = parseFloat(settings.passenger_app_commission_percent) || 0;
  const passengerWebTariffPerKm = settings.passenger_web_tariff_per_km != null
    && String(settings.passenger_web_tariff_per_km).trim() !== ''
    ? (parseFloat(settings.passenger_web_tariff_per_km) || 0)
    : passengerAppTariffPerKm;
  const passengerWebTariffBase = settings.passenger_web_tariff_base != null
    && String(settings.passenger_web_tariff_base).trim() !== ''
    ? (parseFloat(settings.passenger_web_tariff_base) || 0)
    : passengerAppTariffBase;
  const passengerWebCommissionPercent = settings.passenger_web_commission_percent != null
    && String(settings.passenger_web_commission_percent).trim() !== ''
    ? (parseFloat(settings.passenger_web_commission_percent) || 0)
    : passengerAppCommissionPercent;

  const livePlatform = useMemo(
    () => resolveChannelTariff({
      settingsMap: settings,
      windows: tariffWindows,
      channel: 'platform',
    }),
    [settings, tariffWindows],
  );

  const tariffPerKm = livePlatform.perKm;
  const tariffBase = livePlatform.base;
  const commissionPercent = Number.isFinite(livePlatform.commissionPercent)
    ? livePlatform.commissionPercent
    : 10;
  const whatsappAgentEnabled = isTruthySetting(settings.whatsapp_agent_enabled, true);
  const driverAppLatestVersionCode = Math.max(
    0,
    Math.round(Number(settings.driver_app_latest_version_code) || 0)
  );
  const passengerAppLatestVersionCode = Math.max(
    0,
    Math.round(Number(settings.passenger_app_latest_version_code) || 0)
  );

  const calculatePrice = useCallback((distanceKm) => {
    if (!distanceKm || distanceKm <= 0) return null;
    return Math.round(tariffBase + tariffPerKm * distanceKm);
  }, [tariffPerKm, tariffBase]);

  return {
    settings,
    loading,
    tariffWindows,
    tariffPerKm,
    tariffBase,
    commissionPercent,
    platformDefaultPerKm,
    platformDefaultBase,
    platformDefaultCommission,
    passengerAppTariffPerKm,
    passengerAppTariffBase,
    passengerAppCommissionPercent,
    passengerWebTariffPerKm,
    passengerWebTariffBase,
    passengerWebCommissionPercent,
    whatsappAgentEnabled,
    driverAppLatestVersionCode,
    passengerAppLatestVersionCode,
    updateSetting,
    saveTariffWindow,
    deleteTariffWindow,
    calculatePrice,
    refetch: fetchSettings,
  };
}
