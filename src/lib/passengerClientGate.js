/**
 * Gate mínimo para endpoints públicos de passenger-app.
 * Acepta X-Profesional-Client o body.client con prefijo passenger-app/.
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
  return value.length > PASSENGER_CLIENT_PREFIX.length;
}

/** IPs de Google vistas abusando send-otp (Play pre-launch / crawlers). */
export function isLikelyAutomatedScannerIp(ip) {
  const value = String(ip || '');
  if (!value || value === 'unknown') return false;
  return (
    value.startsWith('66.102.') // Google (logs OTP)
    || value.startsWith('66.249.') // Googlebot
    || value.startsWith('64.233.')
    || value.startsWith('72.14.')
    || value.startsWith('74.125.')
  );
}

/**
 * @param {Request} req
 * @param {{ client?: string } | null} [payload]
 */
export function resolvePassengerClient(req, payload = null) {
  const fromHeader = readPassengerClientHeader(req);
  if (isAllowedPassengerClient(fromHeader)) {
    return { ok: true, client: fromHeader, source: 'header' };
  }
  const fromBody = String(payload?.client || '').trim().slice(0, 80);
  if (isAllowedPassengerClient(fromBody)) {
    return { ok: true, client: fromBody, source: 'body' };
  }
  return {
    ok: false,
    client: fromHeader || fromBody || null,
    source: null,
  };
}
