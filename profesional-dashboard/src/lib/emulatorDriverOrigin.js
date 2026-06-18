import { createClient } from '@supabase/supabase-js';
import { EMULATOR_GPS_DEFAULT_ORIGIN } from './constants.js';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function parseCoord(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Ubicación del chofer a simular (misma lógica que drivers-snapshot:
 * driver_locations primero, sino current_lat/current_lng en drivers).
 */
export async function getSimulatorDriverOrigin() {
  const driverNumber = Number(process.env.EMULATOR_SIM_DRIVER_NUMBER || 2);
  const driverIdEnv = process.env.EMULATOR_SIM_DRIVER_ID;

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('drivers')
    .select('id, full_name, driver_number, current_lat, current_lng, updated_at');

  if (driverIdEnv) {
    query = query.eq('id', driverIdEnv);
  } else {
    query = query.eq('driver_number', driverNumber);
  }

  const { data: driver, error } = await query.maybeSingle();
  if (error) throw error;
  if (!driver) return null;

  const { data: loc } = await supabase
    .from('driver_locations')
    .select('lat, lng, updated_at')
    .eq('driver_id', driver.id)
    .maybeSingle();

  // Para el simulador: priorizar current_lat/current_lng del chofer (como en el panel de Supabase).
  const lat = parseCoord(driver.current_lat) ?? parseCoord(loc?.lat);
  const lng = parseCoord(driver.current_lng) ?? parseCoord(loc?.lng);

  if (lat == null || lng == null) {
    return {
      latitude: EMULATOR_GPS_DEFAULT_ORIGIN.lat,
      longitude: EMULATOR_GPS_DEFAULT_ORIGIN.lng,
      driverId: driver.id,
      fullName: driver.full_name,
      driverNumber: driver.driver_number,
      source: 'fallback',
    };
  }

  const fromDriversTable = parseCoord(driver.current_lat) != null && parseCoord(driver.current_lng) != null;

  return {
    latitude: lat,
    longitude: lng,
    driverId: driver.id,
    fullName: driver.full_name,
    driverNumber: driver.driver_number,
    source: fromDriversTable ? 'drivers' : 'driver_locations',
    updatedAt: driver.updated_at || loc?.updated_at,
  };
}
