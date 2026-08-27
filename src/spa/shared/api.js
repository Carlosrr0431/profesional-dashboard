export const PASSENGER_CLIENT = 'passenger-app/web-spa';

export async function spaJson(url, options = {}) {
  const { method = 'GET', body, headers, timeoutMs = 20000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      data: {
        ok: false,
        message: aborted ? 'Tiempo de espera agotado.' : 'Sin conexión. Verificá tu internet.',
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export function passengerHeaders(extra = {}) {
  return {
    'X-Profesional-Client': PASSENGER_CLIENT,
    'x-profesional-client': PASSENGER_CLIENT,
    ...extra,
  };
}
