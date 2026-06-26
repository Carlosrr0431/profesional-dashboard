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

async function resolveDriverOrigin(driver) {
  const supabase = getSupabaseAdmin();

  const { data: loc } = await supabase
    .from('driver_locations')
    .select('lat, lng, updated_at')
    .eq('driver_id', driver.id)
    .maybeSingle();

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
      gpsSimulationActive: Boolean(driver.gps_simulation_active),
    };
  }

  const fromDriversTable = parseCoord(driver.current_lat) != null && parseCoord(driver.current_lng) != null;

  return {
    latitude: lat,
    longitude: lng,
    driverId: driver.id,
    fullName: driver.full_name,
    driverNumber: driver.driver_number,
    gpsSimulationActive: Boolean(driver.gps_simulation_active),
    source: fromDriversTable ? 'drivers' : 'driver_locations',
    updatedAt: driver.updated_at || loc?.updated_at,
  };
}

/** Lista de choferes para el selector del simulador GPS. */
export async function listSimulatorDrivers() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('drivers')
    .select('id, full_name, driver_number, current_lat, current_lng, is_available, vehicle_plate, updated_at, gps_simulation_active')
    .order('driver_number', { ascending: true });

  if (error) throw error;

  return (data || []).map((driver) => {
    const lat = parseCoord(driver.current_lat);
    const lng = parseCoord(driver.current_lng);
    return {
      id: driver.id,
      fullName: driver.full_name,
      driverNumber: driver.driver_number,
      isAvailable: driver.is_available,
      vehiclePlate: driver.vehicle_plate,
      hasLocation: lat != null && lng != null,
      latitude: lat,
      longitude: lng,
      gpsSimulationActive: Boolean(driver.gps_simulation_active),
    };
  });
}

/**
 * Ubicación del chofer a simular.
 * @param {{ driverId?: string }} options — driverId del query/UI; si no, env o driver_number por defecto.
 */
export async function getSimulatorDriverOrigin({ driverId } = {}) {
  const driverNumber = Number(process.env.EMULATOR_SIM_DRIVER_NUMBER || 1);
  const driverIdEnv = driverId || process.env.EMULATOR_SIM_DRIVER_ID;

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('drivers')
    .select('id, full_name, driver_number, current_lat, current_lng, updated_at, gps_simulation_active');

  if (driverIdEnv) {
    query = query.eq('id', driverIdEnv);
  } else {
    query = query.eq('driver_number', driverNumber);
  }

  const { data: driver, error } = await query.maybeSingle();
  if (error) throw error;
  if (!driver) return null;

  return resolveDriverOrigin(driver);
}

/** Escribe ubicación simulada en drivers + driver_locations (visible en dashboard y tracking). */
export async function setSimulatorDriverPosition(driverId, latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!driverId || typeof driverId !== 'string') {
    throw new Error('driverId es obligatorio');
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('latitude y longitude inválidas');
  }

  const supabase = getSupabaseAdmin();
  const updatedAt = new Date().toISOString();

  const { error: driverError } = await supabase
    .from('drivers')
    .update({
      current_lat: lat,
      current_lng: lng,
      updated_at: updatedAt,
    })
    .eq('id', driverId);

  if (driverError) throw driverError;

  const { error: locError } = await supabase
    .from('driver_locations')
    .upsert(
      {
        driver_id: driverId,
        lat,
        lng,
        speed: 0,
        heading: 0,
        is_online: true,
        updated_at: updatedAt,
      },
      { onConflict: 'driver_id' },
    );

  if (locError) throw locError;

  return { latitude: lat, longitude: lng, updatedAt };
}

/** Activa o desactiva simulación remota para un chofer (solo desarrollo / panel Sim. GPS). */
export async function setGpsSimulationMode(driverId, active) {
  if (!driverId || typeof driverId !== 'string') {
    throw new Error('driverId es obligatorio');
  }

  const supabase = getSupabaseAdmin();
  const updatedAt = new Date().toISOString();

  const { error } = await supabase
    .from('drivers')
    .update({
      gps_simulation_active: Boolean(active),
      updated_at: updatedAt,
    })
    .eq('id', driverId);

  if (error) throw error;

  return { driverId, gpsSimulationActive: Boolean(active), updatedAt };
}
