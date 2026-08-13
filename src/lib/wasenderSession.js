/**
 * Sesión WhatsApp vía whatsmeow-api (QR / status / connect).
 * Reusa las mismas keys de settings que Wasender para no romper el modal.
 */
import { getSupabaseAdmin } from './supabaseAdmin';
import {
  connectWhatsmeowSession,
  configureWhatsmeowWebhook,
  fetchWhatsmeowQr,
  fetchWhatsmeowStatus,
  getWhatsmeowApiBase,
  getWhatsmeowApiKey,
} from './whatsmeowClient';
import {
  getDefaultWhatsmeowLine,
  getWhatsmeowLinesHealth,
  hasAnyWhatsmeowConfig,
} from './whatsmeowLines';

const SETTING_STATUS = 'wasender_session_status';
const SETTING_QR = 'wasender_session_qr';
const SETTING_PASSKEY = 'wasender_session_passkey';
const SETTING_META = 'wasender_session_meta';
const SETTING_UPDATED_AT = 'wasender_session_updated_at';

const RECONNECT_STATUSES = new Set([
  'logged_out',
  'disconnected',
  'expired',
  'need_scan',
  'need_passkey',
]);

export function normalizeWasenderStatus(raw) {
  const value = String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!value) return 'unknown';
  if (value === 'needscan') return 'need_scan';
  if (value === 'needpasskey') return 'need_passkey';
  if (value === 'loggedout') return 'logged_out';
  if (value === 'qr' || value === 'waiting_qr') return 'need_scan';
  return value;
}

export function isReconnectStatus(status) {
  return RECONNECT_STATUSES.has(normalizeWasenderStatus(status));
}

export function isConnectedStatus(status) {
  return normalizeWasenderStatus(status) === 'connected';
}

export function getWasenderConfigHealth() {
  const line = getDefaultWhatsmeowLine();
  const hasKey = Boolean(getWhatsmeowApiKey());
  return {
    hasSessionApiKey: hasKey,
    // Compat modal legacy (antes exigía PAT de Wasender)
    hasPersonalAccessToken: hasKey,
    hasConfiguredSessionId: Boolean(line?.agentCode),
    phone: line?.phone || null,
    agentCode: line?.agentCode || null,
    baseUrl: getWhatsmeowApiBase(),
    provider: 'whatsmeow',
    lines: getWhatsmeowLinesHealth(),
  };
}

async function upsertSetting(key, value) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('settings')
    .upsert(
      { key, value: value == null ? '' : String(value), updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
  if (error) throw error;
}

async function readSettings(keys) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', keys);
  if (error) throw error;
  return Object.fromEntries((data || []).map((row) => [row.key, row.value]));
}

export async function persistWasenderSessionState(patch = {}) {
  const ops = [];
  if (patch.status != null) ops.push(upsertSetting(SETTING_STATUS, normalizeWasenderStatus(patch.status)));
  if (patch.qr != null) ops.push(upsertSetting(SETTING_QR, patch.qr || ''));
  if (patch.passkey !== undefined) {
    ops.push(upsertSetting(SETTING_PASSKEY, patch.passkey ? JSON.stringify(patch.passkey) : ''));
  }
  if (patch.meta != null) ops.push(upsertSetting(SETTING_META, JSON.stringify(patch.meta || {})));
  ops.push(upsertSetting(SETTING_UPDATED_AT, new Date().toISOString()));
  await Promise.all(ops);
}

export async function loadWasenderSessionState() {
  const map = await readSettings([
    SETTING_STATUS,
    SETTING_QR,
    SETTING_PASSKEY,
    SETTING_META,
    SETTING_UPDATED_AT,
  ]);
  let passkey = null;
  let meta = {};
  try {
    passkey = map[SETTING_PASSKEY] ? JSON.parse(map[SETTING_PASSKEY]) : null;
  } catch {
    passkey = null;
  }
  try {
    meta = map[SETTING_META] ? JSON.parse(map[SETTING_META]) : {};
  } catch {
    meta = {};
  }
  return {
    status: normalizeWasenderStatus(map[SETTING_STATUS] || 'unknown'),
    qr: map[SETTING_QR] || null,
    passkey,
    meta,
    updatedAt: map[SETTING_UPDATED_AT] || null,
  };
}

function resolvePublicWebhookUrl(agentCode, phone) {
  const base = (
    process.env.TRACKING_BASE_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || 'https://www.profesionalviajes.com.ar'
  ).replace(/\/$/, '');
  const slug = String(phone || agentCode || '').replace(/\D/g, '') || encodeURIComponent(agentCode);
  return `${base}/api/Agente_IA/${slug}`;
}

export async function fetchLiveWasenderStatus() {
  const line = getDefaultWhatsmeowLine();
  if (!line?.agentCode || !getWhatsmeowApiKey()) {
    return { ok: false, error: 'whatsmeow_not_configured' };
  }
  try {
    const data = await fetchWhatsmeowStatus(line.agentCode);
    if (!data) return { ok: false, error: 'status_unavailable' };
    const status = normalizeWasenderStatus(
      data.connected ? 'connected' : (data.status || 'disconnected')
    );
    return { ok: true, status, phone: data.phone || line.phone, raw: data };
  } catch (err) {
    return { ok: false, error: err?.message || 'status_error' };
  }
}

export async function connectWasenderSession({ linkMethod = 'qr' } = {}) {
  void linkMethod; // whatsmeow solo QR
  const line = getDefaultWhatsmeowLine();
  if (!line?.agentCode) {
    return { ok: false, error: 'Falta WHATSMEOW_AGENT_CODE / WHATSMEOW_PHONE' };
  }
  if (!getWhatsmeowApiKey()) {
    return { ok: false, error: 'Falta WHATSMEOW_API_KEY' };
  }

  const webhookUrl = resolvePublicWebhookUrl(line.agentCode, line.phone);
  const secret = process.env.WHATSMEOW_WEBHOOK_SECRET || '';

  try {
    await configureWhatsmeowWebhook(line.agentCode, webhookUrl, secret);
    const connected = await connectWhatsmeowSession(line.agentCode, webhookUrl);
    if (!connected.ok && connected.data?.success === false) {
      return {
        ok: false,
        error: connected.data?.message || connected.text?.slice(0, 200) || 'connect_failed',
      };
    }

    // Esperar QR
    let qr = null;
    for (let i = 0; i < 8; i += 1) {
      qr = await fetchWhatsmeowQr(line.agentCode);
      if (qr) break;
      await new Promise((r) => setTimeout(r, 700));
    }

    const live = await fetchLiveWasenderStatus();
    const status = live.ok && live.status === 'connected'
      ? 'connected'
      : (qr ? 'need_scan' : normalizeWasenderStatus(live.status || 'connecting'));

    await persistWasenderSessionState({
      status,
      qr: qr || '',
      passkey: null,
      meta: { agentCode: line.agentCode, webhookUrl, provider: 'whatsmeow' },
    });

    return { ok: true, status, qr };
  } catch (err) {
    return { ok: false, error: err?.message || 'connect_error' };
  }
}

export async function fetchWasenderQrCode() {
  const line = getDefaultWhatsmeowLine();
  if (!line?.agentCode) return { ok: false, error: 'whatsmeow_not_configured' };
  try {
    const qr = await fetchWhatsmeowQr(line.agentCode);
    if (!qr) return { ok: false, error: 'qr_unavailable' };
    await persistWasenderSessionState({ status: 'need_scan', qr, passkey: null });
    return { ok: true, qr };
  } catch (err) {
    return { ok: false, error: err?.message || 'qr_error' };
  }
}

export async function fetchWasenderPasskeyToken() {
  return {
    ok: false,
    error: 'Passkey no está disponible con whatsmeow. Usá vinculación por QR.',
  };
}

export async function handleWasenderSessionWebhook(event, data = {}) {
  const name = String(event || '').trim().toLowerCase();
  if (name !== 'session.status') return { handled: false };

  const status = normalizeWasenderStatus(data?.status);
  const patch = { status };
  if (status === 'connected') {
    patch.qr = '';
    patch.passkey = null;
  }
  if (['logged_out', 'disconnected', 'expired'].includes(status)) {
    patch.qr = '';
    patch.passkey = null;
  }
  const qr = data?.qr || data?.qr_image || data?.qr_code || null;
  if (qr && status !== 'connected') {
    patch.qr = qr;
    patch.status = 'need_scan';
  }
  await persistWasenderSessionState(patch);
  return { handled: true, status: patch.status || status };
}

export async function getWasenderSessionSnapshot({ refreshLive = true } = {}) {
  const config = getWasenderConfigHealth();
  const stored = await loadWasenderSessionState();

  let live = null;
  if (refreshLive && hasAnyWhatsmeowConfig()) {
    live = await fetchLiveWasenderStatus();
    if (live.ok && live.status && live.status !== stored.status) {
      const patch = { status: live.status };
      if (live.status === 'connected') {
        patch.qr = '';
        patch.passkey = null;
      }
      await persistWasenderSessionState(patch);
      stored.status = live.status;
      if (live.status === 'connected') {
        stored.qr = null;
        stored.passkey = null;
      }
      stored.updatedAt = new Date().toISOString();
    }

    // Si necesita QR y no hay uno guardado, intentar traerlo
    if (
      live?.ok
      && isReconnectStatus(live.status)
      && live.status !== 'connected'
      && !stored.qr
    ) {
      const qrResult = await fetchWasenderQrCode();
      if (qrResult.ok) stored.qr = qrResult.qr;
    }
  }

  const status = live?.ok ? live.status : stored.status;
  return {
    ok: true,
    status,
    canReconnect: isReconnectStatus(status),
    connected: isConnectedStatus(status),
    qr: stored.qr,
    passkey: null,
    meta: stored.meta,
    updatedAt: stored.updatedAt,
    liveOk: Boolean(live?.ok),
    liveError: live && !live.ok ? live.error : null,
    config,
  };
}

export const WASENDER_SESSION_WEBHOOK_EVENTS = ['session.status'];

/** No-op: whatsmeow no usa session id numérico. */
export async function resolveWasenderSessionId() {
  return getDefaultWhatsmeowLine()?.agentCode || null;
}
