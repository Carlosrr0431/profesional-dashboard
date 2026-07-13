/**
 * Presencia en mapa/flota.
 *
 * - Sin coords: no puede estar "Disponible" aunque is_available=true (flag atascado).
 * - Con coords + is_available: se muestra online.
 * - La frescura del GPS solo se usa como señal suave (timeAgo en UI), no para
 *   pisar is_available en BD (eso dejaba offline a choferes realmente conectados).
 */

export const DRIVER_PRESENCE_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2h (solo referencia UI)

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
 * Online efectivo para UI.
 * Confía en is_available + coords. gps_simulation_active cuenta como presencia válida.
 *
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
export function resolveDriverIsOnline(driver, nowMs = Date.now()) {
  const flagged = Boolean(driver?.isAvailable ?? driver?.is_available);
  if (!flagged) return false;
  if (!hasValidDriverCoords(driver?.lat, driver?.lng)) return false;

  const sim = Boolean(driver?.gpsSimulationActive ?? driver?.gps_simulation_active);
  if (sim) return true;

  // Si hay coords y el flag está on, mostrar online. timeAgo ya indica si el GPS está viejo.
  // Solo ocultar como offline si el heartbeat es absurdamente viejo (>2h).
  if (!driver?.updatedAt) return true;
  return isDriverPresenceFresh(driver.updatedAt, nowMs);
}
