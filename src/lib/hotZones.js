/**
 * Zonas calientes: recargo porcentual sobre $/km (plataforma y app pasajeros).
 * Independiente de las zonas de cobertura.
 */

export const MAX_FARE_SURCHARGE_PERCENT = 200;

export function normalizeFareSurchargePercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(MAX_FARE_SURCHARGE_PERCENT, Math.round(parsed * 10) / 10);
}

export function applyFareSurcharge(amount, percent) {
  const base = Number(amount);
  if (!Number.isFinite(base)) return 0;
  const pct = normalizeFareSurchargePercent(percent);
  if (pct === 0) return Math.round(base);
  return Math.round(base * (1 + pct / 100));
}

export function isPointInHotZone(lat, lng, coordinates) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (!Array.isArray(coordinates) || coordinates.length < 3) return false;

  let inside = false;
  const n = coordinates.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = Number(coordinates[i].lat);
    const xi = Number(coordinates[i].lng);
    const yj = Number(coordinates[j].lat);
    const xj = Number(coordinates[j].lng);
    if (![yi, xi, yj, xj].every(Number.isFinite)) continue;
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Si el punto cae en varias zonas, gana la de mayor recargo. */
export function findHotZoneForPoint(zones, lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let best = null;
  let bestPct = -1;
  for (const zone of zones || []) {
    if (zone?.is_active === false) continue;
    if (!isPointInHotZone(lat, lng, zone?.coordinates)) continue;
    const pct = normalizeFareSurchargePercent(zone.fare_surcharge_percent);
    if (pct > bestPct) {
      best = zone;
      bestPct = pct;
    }
  }
  return best;
}

export function resolveHotZoneSurchargePercent(zones, lat, lng) {
  const zone = findHotZoneForPoint(zones, lat, lng);
  return normalizeFareSurchargePercent(zone?.fare_surcharge_percent);
}

export async function fetchActiveHotZones(supabase) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('hot_zones')
      .select('id, name, coordinates, fare_surcharge_percent, is_active')
      .eq('is_active', true);
    if (error) return [];
    return (data || []).filter(
      (zone) => Array.isArray(zone.coordinates) && zone.coordinates.length >= 3
    );
  } catch {
    return [];
  }
}

export async function resolveHotZoneSurchargeForPoint(supabase, lat, lng) {
  const zones = await fetchActiveHotZones(supabase);
  return resolveHotZoneSurchargePercent(zones, lat, lng);
}
