const PASSENGER_KEY = 'profesional-pasajero-session-v1';
const PASSENGER_CREDENTIAL_CACHE_KEY = 'profesional-pasajero-credentials-v1';

export function readPassengerSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PASSENGER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.phone || !parsed?.sessionToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePassengerSession(session) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PASSENGER_KEY, JSON.stringify(session));
}

export function clearPassengerSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PASSENGER_KEY);
}

export function readPassengerCredentialCache() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PASSENGER_CREDENTIAL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.phone) return null;
    return { name: String(parsed.name || ''), phone: String(parsed.phone) };
  } catch {
    return null;
  }
}

export function writePassengerCredentialCache(name, phone) {
  if (typeof window === 'undefined' || !phone) return;
  try {
    window.localStorage.setItem(PASSENGER_CREDENTIAL_CACHE_KEY, JSON.stringify({
      name: String(name || ''),
      phone: String(phone),
    }));
  } catch {}
}
