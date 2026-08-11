/**
 * Cola global de salida WhatsApp: 1 mensaje cada N ms (default 15s).
 * Persistida en Supabase para sobrevivir instancias serverless.
 */

import { createClient } from '@supabase/supabase-js';
import {
  sendWhatsmeowTextDirect,
  sendWhatsmeowPollDirect,
  getWhatsmeowApiKey,
} from './whatsmeowClient';

export const WHATSAPP_OUTBOUND_INTERVAL_MS = Math.max(
  1000,
  Math.round(Number(process.env.WHATSAPP_OUTBOUND_INTERVAL_MS || 15_000) || 15_000)
);

export const OUTBOUND_PRIORITY = Object.freeze({
  DEFAULT: 0,
  POLL: 10,
  OTP: 100,
});

const PRODUCTION_APP_URL = 'https://www.profesionalviajes.com.ar';
const DEFAULT_QUEUE_WORKER_URL = `${PRODUCTION_APP_URL}/api/whatsapp-queue-worker`;
const QUEUE_WAKE_TIMEOUT_MS = Math.max(
  10_000,
  Math.round(Number(process.env.WHATSAPP_QUEUE_WAKE_TIMEOUT_MS || 65_000) || 65_000)
);

function isMissingQueueRelationError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return (
    code === '42P01'
    || code === 'PGRST202'
    || code === 'PGRST205'
    || /whatsapp_outbound_queue|claim_whatsapp_outbound|whatsapp_send_throttle/i.test(message)
  );
}

export function isWhatsappOutboundQueueEnabled() {
  const flag = String(process.env.WHATSAPP_OUTBOUND_QUEUE_ENABLED || 'true').toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'off') return false;
  // Tests unitarios del cliente HTTP deben seguir yendo directos.
  if (process.env.NODE_ENV === 'test' && process.env.WHATSAPP_OUTBOUND_QUEUE_ENABLED !== 'true') {
    return false;
  }
  return true;
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function resolveQueueWorkerUrl() {
  const candidates = [
    process.env.WHATSAPP_QUEUE_WORKER_URL,
    process.env.NEXT_PUBLIC_APP_URL
      ? `${String(process.env.NEXT_PUBLIC_APP_URL).trim().replace(/\/+$/, '')}/api/whatsapp-queue-worker`
      : '',
    DEFAULT_QUEUE_WORKER_URL,
  ];

  for (const raw of candidates) {
    const value = String(raw || '').trim().replace(/\/+$/, '');
    if (!value) continue;
    if (/profesional-dashboard\.vercel\.app/i.test(value)) continue;
    return value;
  }
  return DEFAULT_QUEUE_WORKER_URL;
}

async function invokeQueueWorker(meta = {}) {
  const url = resolveQueueWorkerUrl();
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const headers = {};
  if (cronSecret) {
    headers.Authorization = `Bearer ${cronSecret}`;
    headers['x-cron-secret'] = cronSecret;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), QUEUE_WAKE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.warn('[whatsapp-queue-wake] worker error', {
        status: response.status,
        body: body.slice(0, 200),
        ...meta,
      });
      return;
    }
    console.info('[whatsapp-queue-wake] ok', meta);
  } catch (error) {
    console.warn('[whatsapp-queue-wake] fail', {
      error: error?.message || String(error),
      ...meta,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Despierta el worker sin bloquear la respuesta HTTP. */
export function triggerWhatsappQueueWorker(meta = {}) {
  const run = () => invokeQueueWorker(meta);
  // Import dinámico: evita cargar next/server en tests / scripts.
  import('next/server')
    .then(({ after }) => {
      try {
        after(run);
      } catch {
        void run();
      }
    })
    .catch(() => {
      void run();
    });
}

/**
 * Encola un mensaje saliente.
 * @returns {Promise<{success: boolean, queued?: boolean, queueId?: string, error?: string, missingTable?: boolean}>}
 */
export async function enqueueWhatsappOutbound({
  agentCode,
  to,
  kind,
  payload,
  priority = OUTBOUND_PRIORITY.DEFAULT,
  meta = {},
  maxAttempts = 5,
  wake = true,
} = {}) {
  const dest = String(to || '').trim();
  const code = String(agentCode || '').trim();
  const messageKind = kind === 'poll' ? 'poll' : 'text';

  if (!code || !dest) {
    return { success: false, error: 'agentCode y to son requeridos' };
  }
  if (messageKind === 'text' && !String(payload?.text || '').trim()) {
    return { success: false, error: 'text vacío' };
  }
  if (messageKind === 'poll') {
    const opts = Array.isArray(payload?.options) ? payload.options.filter(Boolean) : [];
    if (opts.length < 2) {
      return { success: false, error: 'poll requiere al menos 2 options' };
    }
  }

  try {
    const supabase = getSupabaseAdmin();
    const row = {
      agent_code: code,
      dest,
      kind: messageKind,
      payload: payload || {},
      priority: Number.isFinite(priority) ? Math.trunc(priority) : 0,
      max_attempts: Math.max(1, Math.trunc(maxAttempts) || 5),
      meta: meta && typeof meta === 'object' ? meta : {},
      status: 'pending',
      available_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('whatsapp_outbound_queue')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      if (isMissingQueueRelationError(error)) {
        return { success: false, error: error.message, missingTable: true };
      }
      return { success: false, error: error.message || 'enqueue_failed' };
    }

    if (wake) {
      triggerWhatsappQueueWorker({ queueId: data?.id, kind: messageKind });
    }

    return {
      success: true,
      queued: true,
      queueId: data?.id || null,
      messageId: null,
    };
  } catch (err) {
    return { success: false, error: err?.message || 'enqueue_failed' };
  }
}

async function markSent(supabase, id, messageId) {
  await supabase
    .from('whatsapp_outbound_queue')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      message_id: messageId ? String(messageId) : null,
      last_error: null,
      claimed_at: null,
      claimed_by: null,
    })
    .eq('id', id);
}

async function markRetryOrFailed(supabase, row, errorMessage) {
  const attempts = Number(row.attempts || 0);
  const maxAttempts = Number(row.max_attempts || 5);
  const permanent = attempts >= maxAttempts;
  const backoffMs = Math.min(5 * 60_000, WHATSAPP_OUTBOUND_INTERVAL_MS * Math.max(1, attempts));

  await supabase
    .from('whatsapp_outbound_queue')
    .update({
      status: permanent ? 'failed' : 'pending',
      last_error: String(errorMessage || 'send_failed').slice(0, 500),
      available_at: permanent
        ? new Date().toISOString()
        : new Date(Date.now() + backoffMs).toISOString(),
      claimed_at: null,
      claimed_by: null,
    })
    .eq('id', row.id);

  return { permanent };
}

async function sendClaimedRow(row, { apiKey } = {}) {
  const key = apiKey || getWhatsmeowApiKey();
  if (row.kind === 'poll') {
    return sendWhatsmeowPollDirect(
      row.agent_code,
      row.dest,
      {
        name: row.payload?.name,
        options: row.payload?.options,
        maxSelections: row.payload?.maxSelections ?? row.payload?.max_selections ?? 1,
      },
      { apiKey: key }
    );
  }
  return sendWhatsmeowTextDirect(
    row.agent_code,
    row.dest,
    row.payload?.text,
    { apiKey: key }
  );
}

/**
 * Toma y envía como máximo un mensaje (respeta el throttle en Postgres).
 * @returns {Promise<{claimed: boolean, sent?: boolean, skipped?: string, queueId?: string, error?: string, missingTable?: boolean}>}
 */
export async function processOneWhatsappOutbound({ claimer = 'worker', apiKey } = {}) {
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    return { claimed: false, skipped: 'no_supabase', error: err?.message };
  }

  try {
    await supabase.rpc('release_stale_whatsapp_outbound', { p_stale_after_seconds: 120 });
  } catch {
    // no-op si la función aún no existe
  }

  const { data, error } = await supabase.rpc('claim_whatsapp_outbound_message', {
    p_claimer: String(claimer || 'worker').slice(0, 120),
  });

  if (error) {
    if (isMissingQueueRelationError(error)) {
      return { claimed: false, missingTable: true, error: error.message };
    }
    return { claimed: false, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) {
    return { claimed: false, skipped: 'empty_or_throttled' };
  }

  const result = await sendClaimedRow(row, { apiKey });
  if (result?.success) {
    await markSent(supabase, row.id, result.messageId);
    return {
      claimed: true,
      sent: true,
      queueId: row.id,
      messageId: result.messageId || null,
    };
  }

  const fail = await markRetryOrFailed(supabase, row, result?.error);
  return {
    claimed: true,
    sent: false,
    queueId: row.id,
    error: result?.error || 'send_failed',
    permanentFailure: fail.permanent,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Drena la cola respetando el intervalo global.
 * En una invocación de ~60s puede enviar varios mensajes (uno cada 15s).
 */
export async function processWhatsappOutboundBatch({
  claimer = 'worker',
  maxMessages = 4,
  deadlineMs = 55_000,
  apiKey,
} = {}) {
  const started = Date.now();
  const results = [];
  const limit = Math.max(1, Math.min(20, Math.trunc(maxMessages) || 4));

  for (let i = 0; i < limit; i += 1) {
    if (Date.now() - started > deadlineMs) break;

    const one = await processOneWhatsappOutbound({ claimer, apiKey });
    results.push(one);

    if (one.missingTable) break;
    if (!one.claimed) break;
    if (i + 1 >= limit) break;
    if (Date.now() - started + WHATSAPP_OUTBOUND_INTERVAL_MS > deadlineMs) break;

    // El claim ya reservó last_sent_at; esperamos el intervalo antes del siguiente.
    await sleep(WHATSAPP_OUTBOUND_INTERVAL_MS);
  }

  return {
    processed: results.length,
    sent: results.filter((r) => r.sent).length,
    results,
  };
}

async function readQueueRow(supabase, queueId) {
  const { data, error } = await supabase
    .from('whatsapp_outbound_queue')
    .select('id, status, message_id, last_error, payload')
    .eq('id', queueId)
    .maybeSingle();
  if (error) return null;
  return data;
}

/**
 * Encola y espera hasta que ese ítem se envíe (o falle).
 * Necesario para polls: el flujo del bot requiere messageId real.
 */
export async function enqueueAndAwaitWhatsappOutbound(params, {
  timeoutMs = 50_000,
  apiKey,
  claimer = 'await-inline',
} = {}) {
  // wake:false — este request drena la cola; evita carrera con otro worker.
  const queued = await enqueueWhatsappOutbound({
    ...params,
    wake: false,
  });
  if (!queued.success) return queued;

  const queueId = queued.queueId;
  if (!queueId) {
    return { success: false, error: 'enqueue_sin_queueId' };
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    return { success: false, error: err?.message || 'no_supabase', queueId };
  }

  const deadline = Date.now() + Math.max(5_000, timeoutMs);
  let lastProcess = null;

  while (Date.now() < deadline) {
    const row = await readQueueRow(supabase, queueId);
    if (row?.status === 'sent') {
      return {
        success: true,
        queued: false,
        awaited: true,
        queueId,
        messageId: row.message_id || null,
        payload: { message_id: row.message_id || null },
      };
    }
    if (row?.status === 'failed') {
      return {
        success: false,
        error: row.last_error || 'send_failed',
        queueId,
      };
    }

    // Otro worker ya lo tiene: solo esperar (no pelear el throttle).
    if (row?.status === 'sending') {
      await sleep(Math.min(1000, Math.max(250, deadline - Date.now())));
      continue;
    }

    lastProcess = await processOneWhatsappOutbound({ claimer, apiKey });
    if (lastProcess.missingTable) {
      return { success: false, error: lastProcess.error, missingTable: true, queueId };
    }

    if (lastProcess.queueId === queueId && lastProcess.sent) {
      return {
        success: true,
        queued: false,
        awaited: true,
        queueId,
        messageId: lastProcess.messageId || null,
        payload: { message_id: lastProcess.messageId || null },
      };
    }
    if (lastProcess.queueId === queueId && lastProcess.permanentFailure) {
      return {
        success: false,
        error: lastProcess.error || 'send_failed',
        queueId,
      };
    }

    // Throttle o mensaje ajeno delante: esperar el intervalo global.
    const waitMs = Math.min(
      WHATSAPP_OUTBOUND_INTERVAL_MS,
      Math.max(250, deadline - Date.now())
    );
    await sleep(waitMs);
  }

  // Backup: si este request se queda corto, el worker/cron puede terminar el envío.
  triggerWhatsappQueueWorker({ reason: 'await_timeout', queueId });

  return {
    success: false,
    error: 'timeout_esperando_envio_en_cola',
    queueId,
    lastSkipped: lastProcess?.skipped || null,
  };
}
