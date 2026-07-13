/**
 * Gate mínimo para endpoints públicos de passenger-app.
 * Exige X-Profesional-Client con prefijo passenger-app/ (corta bots/crawlers).
 */

export const PASSENGER_CLIENT_HEADER = 'x-profesional-client';
export const PASSENGER_CLIENT_PREFIX = 'passenger-app/';

export function readPassengerClientHeader(req) {
  return String(req?.headers?.get?.(PASSENGER_CLIENT_HEADER) || '').trim().slice(0, 80);
}

export function isAllowedPassengerClient(client) {
  const value = String(client || '').trim();
  if (!value) return false;
  if (!value.startsWith(PASSENGER_CLIENT_PREFIX)) return false;
  // passenger-app/1.0.12 — versión no vacía
  return value.length > PASSENGER_CLIENT_PREFIX.length;
}

/**
 * @returns {{ ok: true, client: string } | { ok: false, client: string|null, response: Response }}
 */
export function assertPassengerClient(req) {
  const client = readPassengerClientHeader(req);
  if (isAllowedPassengerClient(client)) {
    return { ok: true, client };
  }
  return {
    ok: false,
    client: client || null,
  };
}
