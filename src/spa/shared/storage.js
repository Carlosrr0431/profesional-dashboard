const PASSENGER_KEY = 'profesional-pasajero-session-v1';

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
