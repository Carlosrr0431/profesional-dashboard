/**
 * Autenticación compartida para crons de Vercel y despertadores HTTP (pg_net, triggerDispatchWorker).
 */

export function isVercelCronInvocation({ userAgent = '', xVercelCron = '' } = {}) {
  const ua = String(userAgent || '').toLowerCase();
  const cronHeader = String(xVercelCron || '').toLowerCase();
  return cronHeader === '1' || ua.includes('vercel-cron');
}

function secretsMatch(provided, expected) {
  const a = String(provided || '').trim();
  const b = String(expected || '').trim();
  return Boolean(a && b && a === b);
}

/**
 * @param {object} params
 * @param {Headers|{get?: function}} [params.headers]
 * @param {URLSearchParams|string|null} [params.searchParams]
 * @param {string} [params.cronSecret] — CRON_SECRET del entorno
 */
export function validateCronAuth({
  headers = null,
  searchParams = null,
  cronSecret = '',
} = {}) {
  const getHeader = (name) => {
    if (!headers) return '';
    if (typeof headers.get === 'function') return headers.get(name) || '';
    return headers[name] || headers[String(name).toLowerCase()] || '';
  };

  const authHeader = getHeader('authorization');
  const userAgent = getHeader('user-agent');
  const xVercelCron = getHeader('x-vercel-cron');
  const xCronSecret = getHeader('x-cron-secret');

  let querySecret = '';
  if (searchParams) {
    if (typeof searchParams.get === 'function') {
      querySecret = searchParams.get('cron_secret') || '';
    } else if (typeof searchParams === 'string') {
      querySecret = new URLSearchParams(searchParams).get('cron_secret') || '';
    }
  }

  const viaVercelCron = isVercelCronInvocation({ userAgent, xVercelCron });
  const secret = String(cronSecret || '').trim();

  if (!secret) {
    return {
      ok: true,
      viaVercelCron,
      authMode: viaVercelCron ? 'vercel_cron' : 'open',
    };
  }

  if (viaVercelCron) {
    return { ok: true, viaVercelCron: true, authMode: 'vercel_cron' };
  }

  if (authHeader === `Bearer ${secret}`) {
    return { ok: true, viaVercelCron: false, authMode: 'bearer' };
  }

  if (secretsMatch(xCronSecret, secret)) {
    return { ok: true, viaVercelCron: false, authMode: 'x_cron_secret' };
  }

  if (secretsMatch(querySecret, secret)) {
    return { ok: true, viaVercelCron: false, authMode: 'query_secret' };
  }

  return {
    ok: false,
    viaVercelCron: false,
    authMode: null,
    hasAuthHeader: Boolean(authHeader),
    hasXCronSecret: Boolean(String(xCronSecret || '').trim()),
    hasQuerySecret: Boolean(String(querySecret || '').trim()),
  };
}
