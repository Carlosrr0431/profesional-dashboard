/**
 * Gestión de sesión WhatsApp (WasenderAPI): estado, connect, QR y passkey.
 * Docs: https://wasenderapi.com/api-docs/sessions/get-whatsapp-session-status
 */
import { getSupabaseAdmin } from './supabaseAdmin';

const WASENDER_BASE_URL = (process.env.WASENDER_BASE_URL || 'https://www.wasenderapi.com/api').replace(/\/$/, '');
const SESSION_API_KEY = process.env.WASENDER_API_KEY || '';
const PERSONAL_ACCESS_TOKEN =
  process.env.WASENDER_PERSONAL_ACCESS_TOKEN
  || process.env.WASENDER_ACCESS_TOKEN
  || process.env.WASENDER_PAT
  || '';
const CONFIGURED_SESSION_ID =
  process.env.WASENDER_SESSION_ID
  || process.env.WASENDER_WHATSAPP_SESSION_ID
  || '';
const CONFIGURED_PHONE = String(
  process.env.WASENDER_PHONE || process.env.WASENDER_SESSION_PHONE || '+5493873088777'
).trim();

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

let cachedSessionId = null;

export function normalizeWasenderStatus(raw) {
  const value = String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!value) return 'unknown';
  if (value === 'needscan') return 'need_scan';
  if (value === 'needpasskey') return 'need_passkey';
  if (value === 'loggedout') return 'logged_out';
  return value;
}

export function isReconnectStatus(status) {
  return RECONNECT_STATUSES.has(normalizeWasenderStatus(status));
}

export function isConnectedStatus(status) {
  return normalizeWasenderStatus(status) === 'connected';
}

export function getWasenderConfigHealth() {
  return {
    hasSessionApiKey: Boolean(SESSION_API_KEY),
    hasPersonalAccessToken: Boolean(PERSONAL_ACCESS_TOKEN),
    hasConfiguredSessionId: Boolean(String(CONFIGURED_SESSION_ID || '').trim()),
    phone: CONFIGURED_PHONE || null,
    baseUrl: WASENDER_BASE_URL,
  };
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function phonesMatch(a, b) {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (!da || !db) return false;
  if (da === db) return true;
  return da.endsWith(db) || db.endsWith(da);
}

async function wasenderFetch(path, { token, method = 'GET', body } = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  if (body != null) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${WASENDER_BASE_URL}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { response, json, text };
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
  if (patch.status != null) {
    ops.push(upsertSetting(SETTING_STATUS, normalizeWasenderStatus(patch.status)));
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'qr') && patch.qr !== undefined) {
    ops.push(upsertSetting(SETTING_QR, patch.qr || ''));
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'passkey') && patch.passkey !== undefined) {
    const value = patch.passkey
      ? JSON.stringify(patch.passkey)
      : '';
    ops.push(upsertSetting(SETTING_PASSKEY, value));
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'meta') && patch.meta !== undefined) {
    ops.push(upsertSetting(SETTING_META, patch.meta ? JSON.stringify(patch.meta) : ''));
  }
  ops.push(upsertSetting(SETTING_UPDATED_AT, new Date().toISOString()));
  await Promise.all(ops);
}

export async function loadWasenderSessionState() {
  const rows = await readSettings([
    SETTING_STATUS,
    SETTING_QR,
    SETTING_PASSKEY,
    SETTING_META,
    SETTING_UPDATED_AT,
  ]);

  let passkey = null;
  if (rows[SETTING_PASSKEY]) {
    try {
      passkey = JSON.parse(rows[SETTING_PASSKEY]);
    } catch {
      passkey = null;
    }
  }

  let meta = null;
  if (rows[SETTING_META]) {
    try {
      meta = JSON.parse(rows[SETTING_META]);
    } catch {
      meta = null;
    }
  }

  return {
    status: normalizeWasenderStatus(rows[SETTING_STATUS] || 'unknown'),
    qr: rows[SETTING_QR] || null,
    passkey,
    meta,
    updatedAt: rows[SETTING_UPDATED_AT] || null,
  };
}

export async function fetchLiveWasenderStatus() {
  if (!SESSION_API_KEY) {
    return { ok: false, error: 'Falta WASENDER_API_KEY', status: 'unknown' };
  }

  const { response, json, text } = await wasenderFetch('/status', { token: SESSION_API_KEY });
  if (!response.ok) {
    return {
      ok: false,
      error: json?.message || json?.error || text || `Error HTTP ${response.status}`,
      status: 'unknown',
      httpStatus: response.status,
    };
  }

  const status = normalizeWasenderStatus(
    json?.status
    || json?.data?.status
    || json?.data?.sessionStatus
    || 'unknown'
  );

  return {
    ok: true,
    status,
    raw: json,
  };
}

export async function resolveWasenderSessionId({ force = false } = {}) {
  if (!force && cachedSessionId) return { ok: true, sessionId: cachedSessionId, source: 'cache' };

  const configured = String(CONFIGURED_SESSION_ID || '').trim();
  if (configured) {
    cachedSessionId = configured;
    return { ok: true, sessionId: configured, source: 'env' };
  }

  if (!PERSONAL_ACCESS_TOKEN) {
    return {
      ok: false,
      error: 'Configurá WASENDER_SESSION_ID o WASENDER_PERSONAL_ACCESS_TOKEN para vincular la sesión.',
    };
  }

  const { response, json, text } = await wasenderFetch('/whatsapp-sessions', {
    token: PERSONAL_ACCESS_TOKEN,
  });

  if (!response.ok) {
    return {
      ok: false,
      error: json?.message || json?.error || text || `No se pudieron listar sesiones (${response.status})`,
    };
  }

  const sessions = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
  if (sessions.length === 0) {
    return { ok: false, error: 'No hay sesiones WhatsApp en la cuenta Wasender.' };
  }

  let match = null;
  if (CONFIGURED_PHONE) {
    match = sessions.find((s) => phonesMatch(s.phone_number || s.phoneNumber || s.phone, CONFIGURED_PHONE));
  }
  if (!match) {
    match = sessions.find((s) => /profesional/i.test(String(s.name || ''))) || sessions[0];
  }

  const sessionId = match?.id != null ? String(match.id) : null;
  if (!sessionId) {
    return { ok: false, error: 'No se pudo determinar el ID de sesión de Wasender.' };
  }

  cachedSessionId = sessionId;
  return {
    ok: true,
    sessionId,
    source: 'list',
    session: match,
  };
}

export async function connectWasenderSession({ linkMethod = 'qr' } = {}) {
  if (!PERSONAL_ACCESS_TOKEN) {
    return {
      ok: false,
      error: 'Falta WASENDER_PERSONAL_ACCESS_TOKEN para iniciar la vinculación.',
    };
  }

  const resolved = await resolveWasenderSessionId();
  if (!resolved.ok) return resolved;

  const method = linkMethod === 'passkey' ? 'passkey' : 'qr';
  const { response, json, text } = await wasenderFetch(
    `/whatsapp-sessions/${encodeURIComponent(resolved.sessionId)}/connect`,
    {
      token: PERSONAL_ACCESS_TOKEN,
      method: 'POST',
      body: { linkMethod: method },
    }
  );

  if (!response.ok) {
    return {
      ok: false,
      error: json?.message || json?.error || text || `No se pudo conectar la sesión (${response.status})`,
      httpStatus: response.status,
    };
  }

  const data = json?.data || json || {};
  const status = normalizeWasenderStatus(data.status || (method === 'passkey' ? 'need_passkey' : 'need_scan'));
  const qr = data.qrCode || data.qr || null;
  const passkeyToken = data.passkey?.token || data.token || null;
  const passkeyExpires = data.passkey?.expiresAt || data.passkey?.expires_at || data.expires_at || null;

  const passkey = passkeyToken
    ? {
        stage: 'request',
        token: passkeyToken,
        expiresAt: passkeyExpires,
        requestId: data.passkey?.requestId || data.requestId || null,
      }
    : null;

  await persistWasenderSessionState({
    status,
    qr: qr || (status === 'need_scan' ? undefined : ''),
    passkey: passkey || (status === 'need_passkey' ? undefined : null),
    meta: {
      sessionId: resolved.sessionId,
      linkMethod: method,
      lastConnectAt: new Date().toISOString(),
    },
  });

  // Si connect no trajo QR pero el estado pide scan, pedirlo aparte.
  let finalQr = qr;
  if (status === 'need_scan' && !finalQr) {
    const qrResult = await fetchWasenderQrCode(resolved.sessionId);
    if (qrResult.ok) finalQr = qrResult.qr;
  }

  if (status === 'need_passkey' && !passkey) {
    const tokenResult = await fetchWasenderPasskeyToken(resolved.sessionId);
    if (tokenResult.ok) {
      await persistWasenderSessionState({
        status,
        passkey: tokenResult.passkey,
      });
      return {
        ok: true,
        status,
        qr: finalQr,
        passkey: tokenResult.passkey,
        sessionId: resolved.sessionId,
      };
    }
  }

  if (finalQr && finalQr !== qr) {
    await persistWasenderSessionState({ status, qr: finalQr });
  }

  return {
    ok: true,
    status,
    qr: finalQr,
    passkey,
    sessionId: resolved.sessionId,
    raw: json,
  };
}

export async function fetchWasenderQrCode(sessionId) {
  if (!PERSONAL_ACCESS_TOKEN) {
    return { ok: false, error: 'Falta WASENDER_PERSONAL_ACCESS_TOKEN' };
  }

  let id = sessionId;
  if (!id) {
    const resolved = await resolveWasenderSessionId();
    if (!resolved.ok) return resolved;
    id = resolved.sessionId;
  }

  const { response, json, text } = await wasenderFetch(
    `/whatsapp-sessions/${encodeURIComponent(id)}/qrcode`,
    { token: PERSONAL_ACCESS_TOKEN }
  );

  if (!response.ok) {
    return {
      ok: false,
      error: json?.message || json?.error || text || `No se pudo obtener el QR (${response.status})`,
      httpStatus: response.status,
    };
  }

  const qr = json?.data?.qrCode || json?.data?.qr || json?.qrCode || json?.qr || null;
  if (!qr) {
    return { ok: false, error: 'Wasender no devolvió un código QR.' };
  }

  await persistWasenderSessionState({ status: 'need_scan', qr });
  return { ok: true, qr, sessionId: id };
}

export async function fetchWasenderPasskeyToken(sessionId) {
  if (!PERSONAL_ACCESS_TOKEN) {
    return { ok: false, error: 'Falta WASENDER_PERSONAL_ACCESS_TOKEN' };
  }

  let id = sessionId;
  if (!id) {
    const resolved = await resolveWasenderSessionId();
    if (!resolved.ok) return resolved;
    id = resolved.sessionId;
  }

  const { response, json, text } = await wasenderFetch(
    `/whatsapp-sessions/${encodeURIComponent(id)}/passkey-token`,
    { token: PERSONAL_ACCESS_TOKEN }
  );

  if (!response.ok) {
    return {
      ok: false,
      error: json?.message || json?.error || text || `No se pudo obtener el token passkey (${response.status})`,
      httpStatus: response.status,
    };
  }

  const token = json?.data?.token || json?.token || null;
  if (!token) {
    return { ok: false, error: 'Wasender no devolvió un token passkey.' };
  }

  const passkey = {
    stage: 'request',
    token,
    expiresAt: json?.data?.expires_at || json?.data?.expiresAt || null,
    requestId: json?.data?.requestId || null,
  };

  await persistWasenderSessionState({ status: 'need_passkey', passkey });
  return { ok: true, passkey, sessionId: id };
}

/**
 * Persiste eventos de webhook de sesión (session.status, qrcode.updated, passkey.updated).
 */
export async function handleWasenderSessionWebhook(event, data = {}) {
  const name = String(event || '').trim().toLowerCase();

  if (name === 'session.status') {
    const status = normalizeWasenderStatus(data?.status);
    const patch = { status };
    if (status === 'connected') {
      patch.qr = '';
      patch.passkey = null;
    }
    if (status === 'logged_out' || status === 'disconnected' || status === 'expired') {
      patch.qr = '';
      patch.passkey = null;
    }
    await persistWasenderSessionState(patch);
    return { handled: true, status };
  }

  if (name === 'qrcode.updated') {
    const qr = data?.qr || data?.qrCode || null;
    await persistWasenderSessionState({
      status: 'need_scan',
      qr: qr || '',
      passkey: null,
    });
    return { handled: true, status: 'need_scan', qr };
  }

  if (name === 'passkey.updated') {
    const stage = String(data?.stage || '').trim().toLowerCase();
    if (stage === 'fallback_qr') {
      await persistWasenderSessionState({
        status: 'need_scan',
        passkey: null,
        meta: {
          lastPasskeyError: data?.error || 'Passkey cayó a vinculación por QR',
          stage,
        },
      });
      return { handled: true, status: 'need_scan', stage };
    }

    if (stage === 'no_continuation') {
      await persistWasenderSessionState({
        status: 'need_passkey',
        passkey: {
          stage,
          token: null,
          error: data?.error || 'WhatsApp no continuó el flujo Passkey',
          requestId: data?.requestId || null,
        },
      });
      return { handled: true, status: 'need_passkey', stage };
    }

    const passkey = {
      stage: stage || 'request',
      token: data?.token || null,
      expiresAt: data?.expiresAt || data?.expires_at || null,
      requestId: data?.requestId || null,
      code: data?.code || null,
    };

    await persistWasenderSessionState({
      status: stage === 'confirmation' ? 'need_passkey' : 'need_passkey',
      passkey,
      qr: '',
    });
    return { handled: true, status: 'need_passkey', stage, passkey };
  }

  return { handled: false };
}

export async function getWasenderSessionSnapshot({ refreshLive = true } = {}) {
  const config = getWasenderConfigHealth();
  const stored = await loadWasenderSessionState();

  let live = null;
  if (refreshLive && config.hasSessionApiKey) {
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
  }

  const status = live?.ok ? live.status : stored.status;
  return {
    ok: true,
    status,
    canReconnect: isReconnectStatus(status),
    connected: isConnectedStatus(status),
    qr: stored.qr,
    passkey: stored.passkey,
    meta: stored.meta,
    updatedAt: stored.updatedAt,
    liveOk: Boolean(live?.ok),
    liveError: live && !live.ok ? live.error : null,
    config,
  };
}

export const WASENDER_SESSION_WEBHOOK_EVENTS = [
  'session.status',
  'qrcode.updated',
  'passkey.updated',
];
