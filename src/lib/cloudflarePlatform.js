function platformConfig() {
  const baseUrl = String(process.env.CLOUDFLARE_PLATFORM_URL || '').replace(/\/$/, '');
  const secret = String(process.env.CLOUDFLARE_PLATFORM_SECRET || '');
  if (!baseUrl || !secret) return null;
  return { baseUrl, secret };
}

export function isCloudflarePlatformConfigured() {
  return Boolean(platformConfig());
}

async function platformFetch(path, { method = 'GET', body } = {}) {
  const config = platformConfig();
  if (!config) {
    const error = new Error('Cloudflare todavía no está configurado.');
    error.code = 'not_configured';
    throw error;
  }
  const response = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${config.secret}`,
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.message || 'Cloudflare no respondió.');
    error.status = response.status || 502;
    throw error;
  }
  return payload;
}

export async function reportCloudflareFailure({ area, operation, message, detail } = {}) {
  if (!platformConfig()) return { reported: false };
  try {
    await platformFetch('/failures', {
      method: 'POST',
      body: {
        area,
        operation,
        message: String(message || 'Error').slice(0, 500),
        detail: detail ? String(detail).slice(0, 2000) : null,
      },
    });
    return { reported: true };
  } catch {
    return { reported: false };
  }
}

export async function readCloudflareStatus() {
  const config = platformConfig();
  if (!config) {
    return { configured: false, health: null, failures: [], jobs: [] };
  }
  const healthResponse = await fetch(`${config.baseUrl}/health`, { cache: 'no-store' });
  const health = await healthResponse.json().catch(() => ({ ok: false, message: 'Sin respuesta' }));
  if (!healthResponse.ok || health?.ok === false) {
    return {
      configured: true,
      health,
      failures: [{
        id: 'probe',
        area: 'plataforma',
        operation: 'health',
        message: health?.message || 'El worker no responde',
        created_at: new Date().toISOString(),
      }],
      jobs: [],
    };
  }
  const [failures, jobs] = await Promise.all([
    platformFetch('/failures'),
    platformFetch('/jobs'),
  ]);
  return {
    configured: true,
    health,
    failures: failures.failures || [],
    jobs: jobs.jobs || [],
  };
}

/**
 * Intenta Cloudflare. Si falla, deja el registro y sigue con Supabase.
 * El resultado de Supabase es el que ve el usuario.
 */
export async function withSupabaseFallback(area, operation, cloudflareCall, supabaseCall) {
  try {
    return { source: 'cloudflare', result: await cloudflareCall() };
  } catch (error) {
    if (error?.code !== 'not_configured') {
      await reportCloudflareFailure({
        area,
        operation,
        message: error?.message || 'Cloudflare falló',
        detail: error?.stack || null,
      });
    }
    return { source: 'supabase', result: await supabaseCall() };
  }
}
