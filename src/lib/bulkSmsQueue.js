/**
 * Cola de difusión masiva (SMS + WhatsApp).
 * WhatsApp no usa la cola de viajes: ritmo propio de 30s y línea de negocio.
 */

import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  BULK_CHANNEL_SMS,
  BULK_CHANNEL_WHATSAPP,
  SMS_BULK_COOLDOWN_HOURS,
  SMS_BULK_MAX_PER_TICK,
  WHATSAPP_BULK_INTERVAL_MS,
  WHATSAPP_BULK_MAX_PER_TICK,
  bulkIntervalMs,
  bulkMaxBody,
  bulkMaxRecipients,
  composeBulkSmsText,
  nextSmsSendWindow,
  normalizeBulkChannel,
  normalizeHttpUrl,
  parseBulkSmsRecipients,
} from './bulkSms';
import {
  SMS_GATEWAY_BULK_PRIORITY,
  isSmsGatewayConfigured,
  sendSmsGatewayMessage,
} from './smsGateway';
import { normalizePhoneForWhatsApp } from './passengerAuthPhone';
import { sendWhatsmeowImageDirect, sendWhatsmeowTextDirect } from './whatsmeowClient';
import { getBulkWhatsappLine } from './whatsmeowLines';
import {
  isWhatsappBanLikeError,
  WHATSAPP_BAN_PAUSE_MS,
} from './whatsappAntiBan';

const PRODUCTION_APP_URL = 'https://www.profesionalviajes.com.ar';
const DEFAULT_WORKER_URL = `${PRODUCTION_APP_URL}/api/sms-queue-worker`;
const QUEUE_WAKE_TIMEOUT_MS = 65_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function isMissingRelationError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return (
    code === '42P01'
    || code === 'PGRST202'
    || code === 'PGRST205'
    || /sms_campaigns|sms_outbound_queue|claim_sms_outbound|sms_send_throttle|claim_whatsapp_bulk|bulk_whatsapp_throttle/i.test(message)
  );
}

export function hashSmsBody(text, { channel = BULK_CHANNEL_SMS, imageUrl = '' } = {}) {
  const raw = [
    normalizeBulkChannel(channel),
    String(text || '').trim(),
    normalizeBulkChannel(channel) === BULK_CHANNEL_WHATSAPP ? normalizeHttpUrl(imageUrl) : '',
  ].join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 40);
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

function resolveWorkerUrl() {
  const candidates = [
    process.env.SMS_QUEUE_WORKER_URL,
    process.env.NEXT_PUBLIC_APP_URL
      ? `${String(process.env.NEXT_PUBLIC_APP_URL).trim().replace(/\/+$/, '')}/api/sms-queue-worker`
      : '',
    DEFAULT_WORKER_URL,
  ];
  for (const raw of candidates) {
    const value = String(raw || '').trim().replace(/\/+$/, '');
    if (!value) continue;
    if (/profesional-dashboard\.vercel\.app/i.test(value)) continue;
    return value;
  }
  return DEFAULT_WORKER_URL;
}

async function invokeSmsQueueWorker(meta = {}) {
  const url = resolveWorkerUrl();
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
      console.warn('[sms-queue-wake] error', {
        status: response.status,
        body: body.slice(0, 200),
        ...meta,
      });
      return;
    }
    console.info('[sms-queue-wake] ok', meta);
  } catch (error) {
    console.warn('[sms-queue-wake] fail', {
      error: error?.message || String(error),
      ...meta,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function triggerSmsQueueWorker(meta = {}) {
  const run = () => invokeSmsQueueWorker(meta);
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

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function findCooldownPhones(supabase, locals, bodyHash, now, channel) {
  const blocked = new Set();
  if (!locals.length) return blocked;
  const cutoff = new Date(now.getTime() - SMS_BULK_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
  for (const group of chunk(locals, 80)) {
    const { data, error } = await supabase
      .from('sms_outbound_queue')
      .select('phone_local')
      .in('phone_local', group)
      .eq('body_hash', bodyHash)
      .eq('channel', channel)
      .in('status', ['queued', 'sending', 'sent'])
      .gte('created_at', cutoff);
    if (error) {
      if (isMissingRelationError(error)) {
        const err = new Error('missing_sms_queue');
        err.missingTable = true;
        throw err;
      }
      throw error;
    }
    for (const row of data || []) {
      if (row?.phone_local) blocked.add(row.phone_local);
    }
  }
  return blocked;
}

export async function previewBulkSmsCampaign({
  phones = '',
  body = '',
  link = '',
  imageUrl = '',
  channel = BULK_CHANNEL_SMS,
  respectQuietHours = true,
  now = new Date(),
} = {}, { supabase } = {}) {
  const parsed = parseBulkSmsRecipients(phones);
  const resolvedChannel = normalizeBulkChannel(channel);
  const composedText = composeBulkSmsText({ body, link, imageUrl, channel: resolvedChannel });
  const storedImage = normalizeHttpUrl(imageUrl);
  const bodyHash = hashSmsBody(composedText, { channel: resolvedChannel, imageUrl: storedImage });
  const startAt = nextSmsSendWindow(now, respectQuietHours);
  const maxRecipients = bulkMaxRecipients(resolvedChannel);
  const maxBody = bulkMaxBody(resolvedChannel);

  if (!composedText && !(resolvedChannel === BULK_CHANNEL_WHATSAPP && storedImage)) {
    return {
      ok: false,
      error: resolvedChannel === BULK_CHANNEL_WHATSAPP
        ? 'Escribí el texto o pegá la URL de una imagen.'
        : 'Escribí el texto del SMS.',
      parsed,
      composedText,
      bodyHash,
      channel: resolvedChannel,
      startAt: startAt.toISOString(),
    };
  }
  if (composedText.length > maxBody) {
    return {
      ok: false,
      error: `El texto supera ${maxBody} caracteres.`,
      parsed,
      composedText,
      channel: resolvedChannel,
    };
  }

  const capped = parsed.valid.slice(0, maxRecipients);
  const overflow = parsed.valid.slice(maxRecipients);
  let cooldown = new Set();
  try {
    if (supabase && capped.length) {
      cooldown = await findCooldownPhones(
        supabase,
        capped.map((item) => item.local),
        bodyHash,
        now,
        resolvedChannel,
      );
    }
  } catch (error) {
    if (error?.missingTable) {
      return {
        ok: false,
        missingTable: true,
        error: 'Falta migrar bulk_sms_queue.sql en Supabase',
        parsed,
        composedText,
        bodyHash,
        channel: resolvedChannel,
      };
    }
    throw error;
  }

  const sendable = capped.filter((item) => !cooldown.has(item.local));
  const skippedCooldown = capped.filter((item) => cooldown.has(item.local));

  return {
    ok: true,
    parsed,
    composedText,
    bodyHash,
    channel: resolvedChannel,
    imageUrl: storedImage,
    startAt: startAt.toISOString(),
    sendable,
    skippedCooldown,
    overflow,
    queuedCount: sendable.length,
    skippedCount: skippedCooldown.length + overflow.length + parsed.duplicates.length + parsed.invalid.length,
  };
}

export async function createBulkSmsCampaign({
  phones,
  body,
  link,
  imageUrl,
  channel = BULK_CHANNEL_SMS,
  respectQuietHours = true,
  createdBy = null,
  createdByEmail = '',
  now = new Date(),
  wake = true,
} = {}, { supabase: supabaseClient } = {}) {
  const supabase = supabaseClient || getSupabaseAdmin();
  const resolvedChannel = normalizeBulkChannel(channel);

  const preview = await previewBulkSmsCampaign({
    phones,
    body,
    link,
    imageUrl,
    channel: resolvedChannel,
    respectQuietHours,
    now,
  }, { supabase });

  if (!preview.ok) return preview;
  if (!preview.sendable.length) {
    return {
      ...preview,
      ok: false,
      error: preview.skippedCooldown.length
        ? 'Todos esos números ya recibieron este mismo contenido en las últimas 24 h.'
        : 'No hay números argentinos válidos para enviar.',
    };
  }

  const { data: campaign, error: campaignError } = await supabase
    .from('sms_campaigns')
    .insert({
      created_by: createdBy,
      created_by_email: createdByEmail || null,
      status: 'queued',
      channel: resolvedChannel,
      body: String(body || '').trim(),
      link: normalizeStoredUrl(link),
      image_url: preview.imageUrl || null,
      composed_text: preview.composedText,
      body_hash: preview.bodyHash,
      recipient_count: preview.sendable.length + preview.skippedCooldown.length,
      queued_count: preview.sendable.length,
      skipped_count: preview.skippedCooldown.length,
      respect_quiet_hours: Boolean(respectQuietHours),
    })
    .select('*')
    .single();

  if (campaignError) {
    if (isMissingRelationError(campaignError)) {
      return { ok: false, missingTable: true, error: 'Falta migrar bulk_sms_queue.sql en Supabase' };
    }
    return { ok: false, error: campaignError.message || 'No se pudo crear la campaña' };
  }

  const intervalMs = bulkIntervalMs(resolvedChannel);
  const baseMs = new Date(preview.startAt).getTime();
  const rows = [
    ...preview.sendable.map((item, index) => ({
      campaign_id: campaign.id,
      channel: resolvedChannel,
      phone_local: item.local,
      body: preview.composedText,
      body_hash: preview.bodyHash,
      image_url: resolvedChannel === BULK_CHANNEL_WHATSAPP ? (preview.imageUrl || null) : null,
      status: 'queued',
      available_at: new Date(baseMs + index * intervalMs).toISOString(),
    })),
    ...preview.skippedCooldown.map((item) => ({
      campaign_id: campaign.id,
      channel: resolvedChannel,
      phone_local: item.local,
      body: preview.composedText,
      body_hash: preview.bodyHash,
      image_url: resolvedChannel === BULK_CHANNEL_WHATSAPP ? (preview.imageUrl || null) : null,
      status: 'skipped',
      skip_reason: 'cooldown',
      available_at: preview.startAt,
    })),
  ];

  for (const group of chunk(rows, 80)) {
    const { error: insertError } = await supabase.from('sms_outbound_queue').insert(group);
    if (insertError) {
      if (isMissingRelationError(insertError)) {
        return { ok: false, missingTable: true, error: 'Falta migrar bulk_sms_queue.sql en Supabase' };
      }
      return { ok: false, error: insertError.message || 'No se pudo encolar los mensajes' };
    }
  }

  if (wake) triggerSmsQueueWorker({ campaignId: campaign.id, queued: preview.sendable.length, channel: resolvedChannel });

  return {
    ok: true,
    campaign,
    channel: resolvedChannel,
    queuedCount: preview.sendable.length,
    skippedCount: preview.skippedCooldown.length,
    invalidCount: preview.parsed.invalid.length,
    duplicateCount: preview.parsed.duplicates.length,
    startAt: preview.startAt,
    composedText: preview.composedText,
  };
}

function normalizeStoredUrl(value) {
  const raw = String(value || '').trim();
  return raw || null;
}

export async function listSmsCampaigns({ limit = 20 } = {}, { supabase: supabaseClient } = {}) {
  const supabase = supabaseClient || getSupabaseAdmin();
  const { data, error } = await supabase
    .from('sms_campaigns')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(50, Math.max(1, limit)));

  if (error) {
    if (isMissingRelationError(error)) {
      return { ok: false, missingTable: true, error: 'Falta migrar bulk_sms_queue.sql en Supabase' };
    }
    return { ok: false, error: error.message };
  }

  const campaigns = data || [];
  const ids = campaigns.map((row) => row.id);
  const countsByCampaign = {};
  if (ids.length) {
    const { data: queueRows, error: queueError } = await supabase
      .from('sms_outbound_queue')
      .select('campaign_id, status')
      .in('campaign_id', ids);
    if (queueError && !isMissingRelationError(queueError)) {
      return { ok: false, error: queueError.message };
    }
    for (const row of queueRows || []) {
      const bucket = countsByCampaign[row.campaign_id] || {
        queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0,
      };
      const key = row.status;
      if (key in bucket) bucket[key] += 1;
      countsByCampaign[row.campaign_id] = bucket;
    }
  }

  return {
    ok: true,
    campaigns: campaigns.map((row) => ({
      ...row,
      counts: countsByCampaign[row.id] || { queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0 },
    })),
    gatewayConfigured: isSmsGatewayConfigured(),
    whatsappConfigured: Boolean(getBulkWhatsappLine()),
  };
}

export async function getSmsCampaign(campaignId, { supabase: supabaseClient } = {}) {
  const supabase = supabaseClient || getSupabaseAdmin();
  const { data: campaign, error } = await supabase
    .from('sms_campaigns')
    .select('*')
    .eq('id', campaignId)
    .maybeSingle();
  if (error) {
    if (isMissingRelationError(error)) {
      return { ok: false, missingTable: true, error: 'Falta migrar bulk_sms_queue.sql en Supabase' };
    }
    return { ok: false, error: error.message };
  }
  if (!campaign) return { ok: false, error: 'Campaña no encontrada', status: 404 };

  const { data: items, error: itemsError } = await supabase
    .from('sms_outbound_queue')
    .select('id, phone_local, status, skip_reason, available_at, sent_at, last_error, attempts, channel')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true });
  if (itemsError) return { ok: false, error: itemsError.message };

  return { ok: true, campaign, items: items || [] };
}

export async function cancelSmsCampaign(campaignId, { supabase: supabaseClient } = {}) {
  const supabase = supabaseClient || getSupabaseAdmin();
  const { data: queued, error: updateError } = await supabase
    .from('sms_outbound_queue')
    .update({ status: 'skipped', skip_reason: 'cancelled' })
    .eq('campaign_id', campaignId)
    .eq('status', 'queued')
    .select('id');
  if (updateError) {
    if (isMissingRelationError(updateError)) {
      return { ok: false, missingTable: true, error: 'Falta migrar bulk_sms_queue.sql en Supabase' };
    }
    return { ok: false, error: updateError.message };
  }

  const { error: campaignError } = await supabase
    .from('sms_campaigns')
    .update({ status: 'cancelled' })
    .eq('id', campaignId)
    .in('status', ['queued', 'running']);
  if (campaignError) return { ok: false, error: campaignError.message };

  return { ok: true, cancelledQueued: (queued || []).length };
}

async function refreshCampaignStatus(supabase, campaignId) {
  const { data: rows, error } = await supabase
    .from('sms_outbound_queue')
    .select('status')
    .eq('campaign_id', campaignId);
  if (error || !rows) return;
  const pending = rows.some((row) => row.status === 'queued' || row.status === 'sending');
  const next = pending ? 'running' : 'done';
  await supabase.from('sms_campaigns').update({ status: next }).eq('id', campaignId).neq('status', 'cancelled');
}

async function markQueueResult(supabase, row, { ok, messageId, error, pauseMs = 60_000 }) {
  const attempts = Number(row.attempts || 0);
  const maxAttempts = Number(row.max_attempts || 5);
  const permanent = !ok && attempts >= maxAttempts;
  if (ok) {
    await supabase
      .from('sms_outbound_queue')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        gateway_message_id: messageId || null,
        last_error: null,
      })
      .eq('id', row.id);
  } else {
    await supabase
      .from('sms_outbound_queue')
      .update(permanent
        ? { status: 'failed', last_error: error || 'send_failed' }
        : {
          status: 'queued',
          last_error: error || 'send_failed',
          available_at: new Date(Date.now() + pauseMs).toISOString(),
          claimed_at: null,
          claimed_by: null,
        })
      .eq('id', row.id);
  }
  if (row.campaign_id) await refreshCampaignStatus(supabase, row.campaign_id);
  return { permanent };
}

export async function processSmsOutboundBatch({
  claimer = 'worker',
  maxMessages = SMS_BULK_MAX_PER_TICK,
  supabase: supabaseClient,
  sendImpl = sendSmsGatewayMessage,
} = {}) {
  const supabase = supabaseClient || getSupabaseAdmin();
  const limit = Math.max(1, Math.min(8, Math.trunc(maxMessages) || SMS_BULK_MAX_PER_TICK));
  const results = [];

  const stale = await supabase.rpc('release_stale_sms_outbound', { p_stale_after_seconds: 120 });
  if (stale.error && isMissingRelationError(stale.error)) {
    return { processed: 0, sent: 0, missingTable: true, results: [{ missingTable: true }] };
  }

  for (let i = 0; i < limit; i += 1) {
    const claimed = await supabase.rpc('claim_sms_outbound_message', { p_claimer: claimer });
    if (claimed.error) {
      if (isMissingRelationError(claimed.error)) {
        return { processed: results.length, sent: 0, missingTable: true, results };
      }
      results.push({ claimed: false, error: claimed.error.message });
      break;
    }
    const row = Array.isArray(claimed.data) ? claimed.data[0] : claimed.data;
    if (!row?.id) {
      results.push({ claimed: false, skipped: 'empty_or_throttled' });
      break;
    }

    const sent = await sendImpl({
      phone: row.phone_local,
      text: row.body,
      priority: SMS_GATEWAY_BULK_PRIORITY,
    });

    if (sent?.ok) {
      await markQueueResult(supabase, row, { ok: true, messageId: sent.messageId });
      results.push({ claimed: true, sent: true, queueId: row.id, messageId: sent.messageId || null });
      continue;
    }

    const fail = await markQueueResult(supabase, row, { ok: false, error: sent?.reason || 'send_failed' });
    results.push({
      claimed: true,
      sent: false,
      queueId: row.id,
      error: sent?.reason || 'send_failed',
      permanentFailure: fail.permanent,
    });
  }

  return {
    processed: results.length,
    sent: results.filter((item) => item.sent).length,
    results,
  };
}

export async function downloadImageAsBase64(url, { fetchImpl = fetch, maxBytes = MAX_IMAGE_BYTES } = {}) {
  const normalized = normalizeHttpUrl(url);
  if (!normalized) return { ok: false, reason: 'invalid_image_url' };
  try {
    const response = await fetchImpl(normalized, { redirect: 'follow' });
    if (!response?.ok) return { ok: false, reason: `image_http_${response?.status || 0}` };
    const contentType = String(response.headers?.get?.('content-type') || '');
    if (contentType && !/image\/(jpeg|jpg|png|webp|gif)|octet-stream/i.test(contentType)) {
      return { ok: false, reason: 'image_type' };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) return { ok: false, reason: 'image_too_large' };
    if (!buffer.length) return { ok: false, reason: 'image_empty' };
    return {
      ok: true,
      base64: buffer.toString('base64'),
      mime: contentType.split(';')[0] || 'image/jpeg',
    };
  } catch (error) {
    return { ok: false, reason: error?.message || 'image_download_failed' };
  }
}

async function sendBulkWhatsappRow(row, {
  line,
  imageCache,
  fetchImpl,
  sendTextImpl,
  sendImageImpl,
}) {
  const dest = normalizePhoneForWhatsApp(row.phone_local);
  if (!dest) return { ok: false, reason: 'invalid_phone' };
  const imageUrl = normalizeHttpUrl(row.image_url);
  if (imageUrl) {
    if (!imageCache.current || imageCache.current.url !== imageUrl) {
      imageCache.current = { url: imageUrl, ...(await downloadImageAsBase64(imageUrl, { fetchImpl })) };
    }
    if (!imageCache.current.ok) {
      return { ok: false, reason: imageCache.current.reason || 'image_download_failed' };
    }
    const sent = await sendImageImpl(line.agentCode, dest, {
      imageBase64: imageCache.current.base64,
      caption: row.body || '',
    }, { apiKey: line.apiKey });
    return sent?.success
      ? { ok: true, messageId: sent.messageId }
      : { ok: false, reason: sent?.error || 'send_image_failed' };
  }

  if (!String(row.body || '').trim()) {
    return { ok: false, reason: 'empty_body' };
  }
  const sent = await sendTextImpl(line.agentCode, dest, row.body, { apiKey: line.apiKey });
  return sent?.success
    ? { ok: true, messageId: sent.messageId }
    : { ok: false, reason: sent?.error || 'send_failed' };
}

export async function processWhatsappBulkBatch({
  claimer = 'worker',
  maxMessages = WHATSAPP_BULK_MAX_PER_TICK,
  supabase: supabaseClient,
  line,
  fetchImpl = fetch,
  sendTextImpl = sendWhatsmeowTextDirect,
  sendImageImpl = sendWhatsmeowImageDirect,
} = {}) {
  const resolvedLine = line || getBulkWhatsappLine();
  if (!resolvedLine?.agentCode) {
    return { processed: 0, sent: 0, skipped: 'no_whatsapp_line', results: [] };
  }

  const supabase = supabaseClient || getSupabaseAdmin();
  const limit = Math.max(1, Math.min(4, Math.trunc(maxMessages) || WHATSAPP_BULK_MAX_PER_TICK));
  const results = [];
  const imageCache = { current: null };

  const stale = await supabase.rpc('release_stale_sms_outbound', { p_stale_after_seconds: 120 });
  if (stale.error && isMissingRelationError(stale.error)) {
    return { processed: 0, sent: 0, missingTable: true, results: [{ missingTable: true }] };
  }

  for (let i = 0; i < limit; i += 1) {
    const claimed = await supabase.rpc('claim_whatsapp_bulk_message', { p_claimer: claimer });
    if (claimed.error) {
      if (isMissingRelationError(claimed.error)) {
        return { processed: results.length, sent: 0, missingTable: true, results };
      }
      results.push({ claimed: false, error: claimed.error.message });
      break;
    }
    const row = Array.isArray(claimed.data) ? claimed.data[0] : claimed.data;
    if (!row?.id) {
      results.push({ claimed: false, skipped: 'empty_or_throttled' });
      break;
    }

    const sent = await sendBulkWhatsappRow(row, {
      line: resolvedLine,
      imageCache,
      fetchImpl,
      sendTextImpl,
      sendImageImpl,
    });

    if (sent.ok) {
      await supabase
        .from('bulk_whatsapp_throttle')
        .update({ interval_ms: WHATSAPP_BULK_INTERVAL_MS, updated_at: new Date().toISOString() })
        .eq('id', 1);
      await markQueueResult(supabase, row, { ok: true, messageId: sent.messageId });
      results.push({ claimed: true, sent: true, queueId: row.id, messageId: sent.messageId || null });
      continue;
    }

    if (isWhatsappBanLikeError(sent.reason)) {
      await supabase
        .from('bulk_whatsapp_throttle')
        .update({
          last_sent_at: new Date().toISOString(),
          interval_ms: WHATSAPP_BAN_PAUSE_MS,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);
      await markQueueResult(supabase, row, {
        ok: false,
        error: sent.reason,
        pauseMs: WHATSAPP_BAN_PAUSE_MS,
      });
      results.push({
        claimed: true,
        sent: false,
        queueId: row.id,
        error: sent.reason,
        pausedMs: WHATSAPP_BAN_PAUSE_MS,
      });
      break;
    }

    const fail = await markQueueResult(supabase, row, { ok: false, error: sent.reason });
    results.push({
      claimed: true,
      sent: false,
      queueId: row.id,
      error: sent.reason,
      permanentFailure: fail.permanent,
    });
  }

  return {
    processed: results.length,
    sent: results.filter((item) => item.sent).length,
    results,
  };
}
