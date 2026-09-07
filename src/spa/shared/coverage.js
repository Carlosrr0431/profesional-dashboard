export const PICKUP_OUTSIDE_COVERAGE_MESSAGE =
  'Esa dirección de retiro no está disponible para viajes por el momento.';

export function isPointInPolygon(lat, lng, coordinates) {
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

/** True si el origen cae en una zona de no cobertura activa. */
export function isPickupInExclusionZone(zones, lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (zones || []).some(
    (zone) => zone?.is_active !== false
      && Array.isArray(zone.coordinates)
      && zone.coordinates.length >= 3
      && isPointInPolygon(lat, lng, zone.coordinates),
  );
}

/**
 * True si se puede tomar el viaje.
 * Sin zonas (o todas inactivas): se acepta todo.
 * Con zonas activas: se rechaza solo si el origen cae adentro.
 */
export function isPickupInActiveZones(zones, lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;
  const activeZones = (zones || []).filter(
    (zone) => zone?.is_active !== false && Array.isArray(zone.coordinates) && zone.coordinates.length >= 3,
  );
  if (activeZones.length === 0) return true;
  return !isPickupInExclusionZone(activeZones, lat, lng);
}
