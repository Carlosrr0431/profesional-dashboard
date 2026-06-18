import { supabase } from './supabase';
import { getDirections } from './googleMaps';

const DASHBOARD_URL =
  process.env.EXPO_PUBLIC_DASHBOARD_URL || 'https://profesional-dashboard.vercel.app';

const DEFAULT_TARIFF_PER_KM = 1000;

export const PASSENGER_APP_TARIFF_SETTING_KEYS = [
  'passenger_app_tariff_per_km',
  'passenger_app_tariff_base',
  'passenger_app_commission_percent',
];

function parseSettingNumber(rawValue) {
  const normalized = String(rawValue ?? '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function settingsRowsToMap(rows = []) {
  const map = {};
  rows.forEach((row) => {
    const key = String(row?.key || '').trim().toLowerCase();
    if (key) map[key] = parseSettingNumber(row?.value);
  });
  return map;
}

function settingsObjectToMap(rawMap = {}) {
  const map = {};
  Object.entries(rawMap).forEach(([key, value]) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    if (normalizedKey) map[normalizedKey] = parseSettingNumber(value);
  });
  return map;
}

export function resolvePassengerAppTariff(settingsMap, { defaultPerKm = DEFAULT_TARIFF_PER_KM } = {}) {
  const perKm = parseSettingNumber(settingsMap.passenger_app_tariff_per_km);
  const base = parseSettingNumber(settingsMap.passenger_app_tariff_base) || 0;
  const commissionPercent = parseSettingNumber(settingsMap.passenger_app_commission_percent) || 0;

  return {
    base,
    perKm: perKm > 0 ? perKm : defaultPerKm,
    commissionPercent,
  };
}

/** Misma fórmula que el dashboard: base + $/km × distancia. */
export function calculateTripPrice({ base, perKm, distanceKm }) {
  const dist = Number(distanceKm);
  if (!Number.isFinite(dist) || dist <= 0) return null;
  return Math.round((Number(base) || 0) + (Number(perKm) || 0) * dist);
}

async function fetchTariffSettingsFromDashboard() {
  const response = await fetch(`${DASHBOARD_URL}/api/tariff-settings`, { cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error?.message || 'No se pudieron cargar las tarifas');
  }
  return settingsObjectToMap(payload?.data || {});
}

async function fetchTariffSettingsFromSupabase() {
  const { data, error } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', PASSENGER_APP_TARIFF_SETTING_KEYS);

  if (error) throw error;
  return settingsRowsToMap(data);
}

function passengerAppSettingsLookEmpty(map) {
  return PASSENGER_APP_TARIFF_SETTING_KEYS.every(
    (key) => map[key] == null || map[key] === undefined
  );
}

let cachedTariff = null;
let cacheAt = 0;
const CACHE_MS = 5 * 60 * 1000;

export async function fetchPassengerAppTariff({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cachedTariff && now - cacheAt < CACHE_MS) {
    return cachedTariff;
  }

  let map = {};
  try {
    map = await fetchTariffSettingsFromSupabase();
  } catch (error) {
    console.warn('[tripPricing] Supabase settings:', error?.message || error);
  }

  if (passengerAppSettingsLookEmpty(map)) {
    try {
      map = await fetchTariffSettingsFromDashboard();
    } catch (error) {
      console.warn('[tripPricing] Dashboard tariff API:', error?.message || error);
    }
  }

  const tariff = resolvePassengerAppTariff(map);
  cachedTariff = tariff;
  cacheAt = now;
  return tariff;
}

function normalizeRouteWaypoints(stops = []) {
  return (stops || [])
    .map((stop) => {
      const lat = Number(stop?.lat);
      const lng = Number(stop?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { latitude: lat, longitude: lng };
    })
    .filter(Boolean);
}

/**
 * Estima precio del viaje (tarifa app pasajeros) entre recogida, paradas y destino final.
 */
export async function estimatePassengerTripFare(pickup, destination, stops = []) {
  const pickupLat = Number(pickup?.lat);
  const pickupLng = Number(pickup?.lng);
  const destLat = Number(destination?.lat);
  const destLng = Number(destination?.lng);

  if (
    !Number.isFinite(pickupLat) ||
    !Number.isFinite(pickupLng) ||
    !Number.isFinite(destLat) ||
    !Number.isFinite(destLng)
  ) {
    return null;
  }

  const waypoints = normalizeRouteWaypoints(stops);
  if (waypoints.length !== (stops || []).length) {
    return null;
  }

  const route = await getDirections(
    { latitude: pickupLat, longitude: pickupLng },
    { latitude: destLat, longitude: destLng },
    waypoints
  );

  if (!route?.distanceValue) return null;

  const distanceKm = route.distanceValue / 1000;
  const tariff = await fetchPassengerAppTariff();
  const price = calculateTripPrice({
    base: tariff.base,
    perKm: tariff.perKm,
    distanceKm,
  });

  if (price == null) return null;

  return {
    price,
    distanceKm,
    distanceText: route.distance,
    durationText: route.duration,
    tariffBase: tariff.base,
    tariffPerKm: tariff.perKm,
    commissionPercent: tariff.commissionPercent,
  };
}

/** @deprecated Usar estimatePassengerTripFare */
export const estimatePlatformTripFare = estimatePassengerTripFare;
