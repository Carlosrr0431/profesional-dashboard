import { after } from 'next/server';

const PRODUCTION_APP_URL = 'https://www.profesionalviajes.com.ar';
const DEFAULT_DISPATCH_WORKER_URL =
  `${PRODUCTION_APP_URL}/api/dispatch-worker`;

/** Debe cubrir dispatch-worker (maxDuration 60s) + margen de red. */
const DISPATCH_WAKE_TIMEOUT_MS = Math.max(
  10_000,
  Math.round(Number(process.env.DISPATCH_WAKE_TIMEOUT_MS || 65_000) || 65_000)
);

function resolveDispatchWorkerUrl() {
  const candidates = [
    process.env.DISPATCH_WORKER_URL,
    process.env.NEXT_PUBLIC_APP_URL
      ? `${String(process.env.NEXT_PUBLIC_APP_URL).trim().replace(/\/+$/, '')}/api/dispatch-worker`
      : '',
    DEFAULT_DISPATCH_WORKER_URL,
  ];

  for (const raw of candidates) {
    const value = String(raw || '').trim().replace(/\/+$/, '');
    if (!value) continue;
    if (/profesional-dashboard\.vercel\.app/i.test(value)) continue;
    return value;
  }

  return DEFAULT_DISPATCH_WORKER_URL;
}

async function invokeDispatchWorker(meta = {}) {
  const url = resolveDispatchWorkerUrl();
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const headers = {};

  if (cronSecret) {
    headers.Authorization = `Bearer ${cronSecret}`;
    headers['x-cron-secret'] = cronSecret;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DISPATCH_WAKE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.warn('[dispatch-wake] worker respondió error', {
        status: response.status,
        body: body.slice(0, 200),
        ...meta,
      });
      return;
    }

    console.info('[dispatch-wake] worker invocado', meta);
  } catch (error) {
    const message = error?.message || String(error);
    const aborted =
      error?.name === 'AbortError' || /aborted/i.test(message);

    console.warn('[dispatch-wake] fallo al invocar worker', {
      error: message,
      aborted,
      ...(aborted ? { timeoutMs: DISPATCH_WAKE_TIMEOUT_MS } : {}),
      ...meta,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Despierta /api/dispatch-worker sin bloquear la respuesta al cliente.
 * Usa `after()` para que el fetch no se cancele al enviar la respuesta en serverless.
 * El cron de Vercel queda como red de seguridad; esto acorta la latencia de reasignación.
 */
export function triggerDispatchWorker(meta = {}) {
  const run = () => invokeDispatchWorker(meta);

  try {
    after(run);
  } catch {
    void run();
  }
}
