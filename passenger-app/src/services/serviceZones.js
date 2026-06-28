import { supabase } from './supabase';
import { isPickupInActiveZones } from '../../../shared/geo/serviceZones';

const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedZones = null;
let cacheTimestamp = 0;
let inflightPromise = null;

export function invalidateServiceZonesCache() {
  cachedZones = null;
  cacheTimestamp = 0;
  inflightPromise = null;
}

export async function fetchActiveServiceZones({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedZones && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedZones;
  }

  if (!force && inflightPromise) {
    return inflightPromise;
  }

  inflightPromise = (async () => {
    const { data, error } = await supabase
      .from('service_zones')
      .select('id, name, coordinates, is_active')
      .eq('is_active', true);

    if (error) throw error;

    const zones = (data || []).filter(
      (zone) => Array.isArray(zone.coordinates) && zone.coordinates.length >= 3
    );

    cachedZones = zones;
    cacheTimestamp = Date.now();
    return zones;
  })();

  try {
    return await inflightPromise;
  } finally {
    inflightPromise = null;
  }
}

export async function isPickupCoveredByServiceZones(lat, lng) {
  const zones = await fetchActiveServiceZones();
  return isPickupInActiveZones(zones, lat, lng);
}
