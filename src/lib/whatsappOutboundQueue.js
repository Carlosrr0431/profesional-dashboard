/**
 * Cola de salida WhatsApp por línea (agent_code): 1 mensaje cada N ms (default 15s).
 * Las dos líneas pueden enviar en paralelo. Persistida en Supabase.
 */

import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  sendWhatsmeowTextDirect,
  sendWhatsmeowPollDirect,
  getWhatsmeowApiKey,
} from './whatsmeowClient';
import {
  isWhatsappBanLikeError,
  isWhatsappPermanentSendError,
  isWhatsappTransientDisconnect,
  WHATSAPP_BAN_PAUSE_MS,
  WHATSAPP_DISCONNECT_PAUSE_MS,
} from './whatsappAntiBan';

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
const EMPTY_RETRY_MS = 250;

function isMissingQueueRelationError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return (
    code === '42P01'
    || code === 'PGRST202'
    || code === 'PGRST205'
    || /whatsapp_outbound_queue|claim_whatsapp_outbound|whatsapp_send_throttle|whatsapp_line_throttle|dedup_key/i.test(message)
  );
}

function isUniqueViolation(error) {
  return String(error?.code || '') === '23505'
    || /duplicate key|unique constraint/i.test(String(error?.message || ''));
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

function digitsOrRaw(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  return digits || raw;
}

/** Clave estable para no encolar el mismo texto/poll pendiente dos veces en la misma línea. */
export function buildOutboundDedupKey({ kind, dest, payload } = {}) {
  const destNorm = digitsOrRaw(dest);
  if (kind === 'poll') {
    const name = String(payload?.name || '').trim().toLowerCase();
    const opts = (Array.isArray(payload?.options) ? payload.options : [])
      .map((o) => String(o || '').trim().toLowerCase())
      .filter(Boolean)
      .join('|');
    const raw = `poll:${destNorm}:${name}:${opts}`;
    return createHash('sha256').update(raw).digest('hex').slice(0, 40);
  }
  const text = String(payload?.text || '').trim();
  const raw = `text:${destNorm}:${text}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 40);
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

async function findPendingByDedup(supabase, agentCode, dedupKey) {
  const { data, error } = await supabase
    .from('whatsapp_outbound_queue')
    .select('id')
    .eq('agent_code', agentCode)
    .eq('dedup_key', dedupKey)
    .in('status', ['pending', 'sending'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data?.id || null;
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

  const dedupKey = buildOutboundDedupKey({ kind: messageKind, dest, payload });

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
      dedup_key: dedupKey,
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
      if (isUniqueViolation(error)) {
        const existingId = await findPendingByDedup(supabase, code, dedupKey);
        if (wake) {
          triggerWhatsappQueueWorker({ queueId: existingId, kind: messageKind, duplicate: true });
        }
        return {
          success: true,
          queued: true,
          duplicate: true,
          queueId: existingId,
          messageId: null,
        };
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

async function markRetryOrFailed(supabase, row, errorMessage, { forceFailed = false, pauseMs = 0 } = {}) {
  const attempts = Number(row.attempts || 0);
  const maxAttempts = Number(row.max_attempts || 5);
  const permanent = forceFailed || attempts >= maxAttempts;
  const backoffMs = pauseMs > 0
    ? pauseMs
    : Math.min(5 * 60_000, WHATSAPP_OUTBOUND_INTERVAL_MS * Math.max(1, attempts));

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

async function pauseWhatsappLine(supabase, agentCode, pauseMs) {
  const code = String(agentCode || '').trim();
  if (!code || !supabase) return;
  const nowIso = new Date().toISOString();
  try {
    await supabase.from('whatsapp_line_throttle').upsert({
      agent_code: code,
      last_sent_at: nowIso,
      interval_ms: Math.max(60_000, Math.trunc(pauseMs) || WHATSAPP_BAN_PAUSE_MS),
      updated_at: nowIso,
    }, { onConflict: 'agent_code' });
  } catch {
    // no-op si la tabla no existe o el cliente mock no implementa upsert
  }
}

async function restoreLineInterval(supabase, agentCode) {
  const code = String(agentCode || '').trim();
  if (!code || !supabase) return;
  try {
    const updated = supabase
      .from('whatsapp_line_throttle')
      .update({
        interval_ms: WHATSAPP_OUTBOUND_INTERVAL_MS,
        updated_at: new Date().toISOString(),
      })
      .eq('agent_code', code);
    if (typeof updated?.gt === 'function') {
      await updated.gt('interval_ms', WHATSAPP_OUTBOUND_INTERVAL_MS + 2000);
    } else if (updated && typeof updated.then === 'function') {
      await updated;
    }
  } catch {
    // no-op
  }
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
 * Toma y envía como máximo un mensaje listo (throttle por línea en Postgres).
 * @returns {Promise<{claimed: boolean, sent?: boolean, skipped?: string, queueId?: string, agentCode?: string, error?: string, missingTable?: boolean}>}
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
    await restoreLineInterval(supabase, row.agent_code);
    await markSent(supabase, row.id, result.messageId);
    return {
      claimed: true,
      sent: true,
      queueId: row.id,
      agentCode: row.agent_code || null,
      messageId: result.messageId || null,
    };
  }

  const failError = result?.error || 'send_failed';
  if (isWhatsappBanLikeError(failError)) {
    await pauseWhatsappLine(supabase, row.agent_code, WHATSAPP_BAN_PAUSE_MS);
    const fail = await markRetryOrFailed(supabase, row, failError, {
      forceFailed: true,
      pauseMs: WHATSAPP_BAN_PAUSE_MS,
    });
    return {
      claimed: true,
      sent: false,
      queueId: row.id,
      agentCode: row.agent_code || null,
      error: failError,
      permanentFailure: fail.permanent,
      pausedMs: WHATSAPP_BAN_PAUSE_MS,
    };
  }
  if (isWhatsappPermanentSendError(failError)) {
    const fail = await markRetryOrFailed(supabase, row, failError, { forceFailed: true });
    return {
      claimed: true,
      sent: false,
      queueId: row.id,
      agentCode: row.agent_code || null,
      error: failError,
      permanentFailure: fail.permanent,
    };
  }
  if (isWhatsappTransientDisconnect(failError)) {
    await pauseWhatsappLine(supabase, row.agent_code, WHATSAPP_DISCONNECT_PAUSE_MS);
    const fail = await markRetryOrFailed(supabase, row, failError, {
      pauseMs: WHATSAPP_DISCONNECT_PAUSE_MS,
    });
    return {
      claimed: true,
      sent: false,
      queueId: row.id,
      agentCode: row.agent_code || null,
      error: failError,
      permanentFailure: fail.permanent,
      pausedMs: WHATSAPP_DISCONNECT_PAUSE_MS,
    };
  }

  const fail = await markRetryOrFailed(supabase, row, failError);
  return {
    claimed: true,
    sent: false,
    queueId: row.id,
    agentCode: row.agent_code || null,
    error: result?.error || 'send_failed',
    permanentFailure: fail.permanent,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Drena la cola. Cada línea tiene su propio throttle: no espera 15s entre líneas distintas.
 */
export async function processWhatsappOutboundBatch({
  claimer = 'worker',
  maxMessages = 8,
  deadlineMs = 55_000,
  apiKey,
} = {}) {
  const started = Date.now();
  const results = [];
  const limit = Math.max(1, Math.min(20, Math.trunc(maxMessages) || 8));
  let emptyStreak = 0;

  for (let i = 0; i < limit; i += 1) {
    if (Date.now() - started > deadlineMs) break;

    const one = await processOneWhatsappOutbound({ claimer, apiKey });
    results.push(one);

    if (one.missingTable) break;
    if (one.claimed) {
      emptyStreak = 0;
      continue;
    }

    emptyStreak += 1;
    if (emptyStreak >= 2) break;
    if (Date.now() - started + EMPTY_RETRY_MS > deadlineMs) break;
    await sleep(EMPTY_RETRY_MS);
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
    .select('id, status, message_id, last_error, payload, agent_code')
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
  const ourCode = String(params?.agentCode || '').trim();
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
        duplicate: Boolean(queued.duplicate),
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

    const otherLine = Boolean(
      lastProcess.claimed
      && lastProcess.agentCode
      && ourCode
      && lastProcess.agentCode !== ourCode
    );
    const waitMs = Math.min(
      otherLine || !lastProcess.claimed ? 250 : WHATSAPP_OUTBOUND_INTERVAL_MS,
      Math.max(200, deadline - Date.now())
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
