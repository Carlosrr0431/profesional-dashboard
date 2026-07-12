/**
 * Presencia en mapa/flota: `is_available` solo no alcanza.
 * Si el flag quedó en true sin GPS reciente, el chofer aparece "Disponible"
 * estando desconectado (caso típico: app matada / never login / toggle atascado).
 */

export const DRIVER_PRESENCE_MAX_AGE_MS = 15 * 60 * 1000;

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
 * Online efectivo para UI / despacho.
 * @param {{ isAvailable?: boolean, is_available?: boolean, lat?: number, lng?: number, updatedAt?: string|null }} driver
 */
export function resolveDriverIsOnline(driver, nowMs = Date.now()) {
  const flagged = Boolean(driver?.isAvailable ?? driver?.is_available);
  if (!flagged) return false;
  if (!hasValidDriverCoords(driver?.lat, driver?.lng)) return false;
  return isDriverPresenceFresh(driver?.updatedAt, nowMs);
}
