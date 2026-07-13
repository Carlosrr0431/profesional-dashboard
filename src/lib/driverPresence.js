/**
 * Presencia en mapa/flota.
 *
 * Online = is_available + coords válidas.
 * No usar la frescura del GPS para el color/estado: el heartbeat de
 * driver_locations puede quedar viejo mientras el flag ya está en true
 * (p.ej. tras restaurar is_available), y eso dejaba pines grises con
 * sidebar en "Disponible".
 */

export const DRIVER_PRESENCE_MAX_AGE_MS = 2 * 60 * 60 * 1000; // referencia UI / timeAgo

export function hasValidDriverCoords(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (la === 0 && ln === 0) return false;
  return true;
}

export function isDriverPresenceFresh(updatedAt, nowMs = Date.now(), maxAgeMs = DRIVER_PRESENCE_MAX_AGE_MS) {
  if (!updatedAt) return false;
  const ts = new Date(updatedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return nowMs - ts <= maxAgeMs;
}

/**
 * Online efectivo para UI / pines.
 * @param {{
 *   isAvailable?: boolean,
 *   is_available?: boolean,
 *   lat?: number,
 *   lng?: number,
 *   updatedAt?: string|null,
 *   gpsSimulationActive?: boolean,
 *   gps_simulation_active?: boolean,
 * }} driver
 */
export function resolveDriverIsOnline(driver, _nowMs = Date.now()) {
  const flagged = Boolean(driver?.isAvailable ?? driver?.is_available);
  if (!flagged) return false;
  return hasValidDriverCoords(driver?.lat, driver?.lng);
}
