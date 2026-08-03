/**
 * Cliente HTTP hacia whatsmeow-api (Railway).
 * Auth: header X-API-Key. Sesión: agent_code.
 */

const DEFAULT_API_URL = 'https://whatsmeow-api-production.up.railway.app';

export function getWhatsmeowApiBase() {
  return (
    process.env.WHATSMEOW_API_URL
    || process.env.NEXT_PUBLIC_WHATSMEOW_API_URL
    || DEFAULT_API_URL
  ).replace(/\/$/, '');
}

export function getWhatsmeowApiKey() {
  return String(
    process.env.WHATSMEOW_API_KEY
    || process.env.NEXT_PUBLIC_WHATSMEOW_API_KEY
    || ''
  ).trim();
}

/** Normaliza a dígitos AR típicos (549…). */
export function normalizeWhatsmeowPhone(telefono) {
  let clean = String(telefono || '').replace(/\D/g, '');
  if (!clean) return '';
  if (clean.startsWith('0')) clean = clean.replace(/^0+/, '');
  if (clean.startsWith('549')) return clean;
  if (clean.startsWith('54') && !clean.startsWith('549')) {
    return `549${clean.slice(2)}`;
  }
  if (clean.length >= 8 && clean.length <= 11) {
    return `549${clean}`;
  }
  return clean;
}

async function whatsmeowFetch(path, { method = 'GET', body, apiKey } = {}) {
  const key = apiKey || getWhatsmeowApiKey();
  const headers = {
    'X-API-Key': key,
    Accept: 'application/json',
  };
  if (body != null) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${getWhatsmeowApiBase()}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  const text = typeof response.text === 'function'
    ? await response.text().catch(() => '')
    : '';
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { success: false, message: text };
  }
  if (!data && typeof response.json === 'function') {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }
  return { ok: response.ok, status: response.status, data, text };
}

function extractMessageId(data) {
  return data?.data?.message_id || data?.data?.id || data?.message_id || null;
}

/**
 * @returns {Promise<{success: boolean, messageId?: string|null, error?: string, payload?: any}>}
 */
export async function sendWhatsmeowText(agentCode, to, text, { apiKey } = {}) {
  const phone = normalizeWhatsmeowPhone(to);
  const message = String(text || '').trim();
  if (!agentCode || !phone || !message) {
    return { success: false, error: 'agentCode, to y text son requeridos' };
  }

  try {
    const result = await whatsmeowFetch('/api/messages/send', {
      method: 'POST',
      apiKey,
      body: { agent_code: agentCode, phone, message },
    });
    const messageId = extractMessageId(result.data);
    if (!result.ok || result.data?.success === false) {
      return {
        success: false,
        error: result.data?.message || result.data?.error || result.text?.slice(0, 200) || `HTTP ${result.status}`,
        payload: result.data,
      };
    }
    return { success: true, messageId: messageId || `out_${Date.now()}`, payload: result.data };
  } catch (err) {
    return { success: false, error: err?.message || 'send_failed' };
  }
}

/**
 * POST /v2/message/sendPoll/{agentCode}
 * @returns {Promise<{success: boolean, messageId?: string|null, error?: string, payload?: any}>}
 */
export async function sendWhatsmeowPoll(agentCode, to, { name, options, maxSelections = 1 } = {}, { apiKey } = {}) {
  const phone = normalizeWhatsmeowPhone(to);
  const opts = (Array.isArray(options) ? options : [])
    .map((o) => String(o || '').trim())
    .filter(Boolean)
    .slice(0, 8);

  if (!agentCode || !phone || opts.length < 2) {
    return { success: false, error: 'agentCode, to y al menos 2 options son requeridos' };
  }

  try {
    const result = await whatsmeowFetch(
      `/v2/message/sendPoll/${encodeURIComponent(agentCode)}`,
      {
        method: 'POST',
        apiKey,
        body: {
          agent_code: agentCode,
          number: phone,
          name: name || 'Elegí una opción',
          options: opts,
          max_selections: maxSelections > 0 ? maxSelections : 1,
        },
      }
    );
    const messageId = extractMessageId(result.data);
    if (!result.ok || result.data?.success === false) {
      return {
        success: false,
        error: result.data?.message || result.data?.error || result.text?.slice(0, 200) || `HTTP ${result.status}`,
        payload: result.data,
      };
    }
    return { success: true, messageId: messageId || `poll_${Date.now()}`, payload: result.data };
  } catch (err) {
    return { success: false, error: err?.message || 'poll_send_failed' };
  }
}

/**
 * Descarga media desencriptada: GET /api/messages/media/{id}?agent_code=&type=
 * @returns {Promise<{ok: boolean, buffer?: Buffer, contentType?: string, error?: string}>}
 */
export async function downloadWhatsmeowMedia(agentCode, messageId, type = 'audio', { apiKey } = {}) {
  if (!agentCode || !messageId) {
    return { ok: false, error: 'agentCode y messageId son requeridos' };
  }
  const qs = new URLSearchParams({
    agent_code: agentCode,
    type: type === 'ptt' ? 'ptt' : type,
  });
  const key = apiKey || getWhatsmeowApiKey();
  try {
    const response = await fetch(
      `${getWhatsmeowApiBase()}/api/messages/media/${encodeURIComponent(messageId)}?${qs}`,
      {
        headers: { 'X-API-Key': key },
        cache: 'no-store',
      }
    );
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { ok: false, error: text.slice(0, 200) || `HTTP ${response.status}` };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      ok: true,
      buffer,
      contentType: response.headers.get('content-type') || 'application/octet-stream',
    };
  } catch (err) {
    return { ok: false, error: err?.message || 'media_download_failed' };
  }
}

export async function fetchWhatsmeowStatus(agentCode, { apiKey } = {}) {
  if (!agentCode) return null;
  const result = await whatsmeowFetch(
    `/api/status?agent_code=${encodeURIComponent(agentCode)}`,
    { apiKey }
  );
  if (!result.ok || result.data?.success === false) return null;
  return result.data?.data || null;
}

export async function fetchWhatsmeowQr(agentCode, { apiKey } = {}) {
  if (!agentCode) return null;
  const result = await whatsmeowFetch(
    `/api/session/qr?agent_code=${encodeURIComponent(agentCode)}`,
    { apiKey }
  );
  if (!result.ok || result.data?.success === false) return null;
  return result.data?.data?.qr_image || result.data?.data?.qr_code || null;
}

export async function connectWhatsmeowSession(agentCode, webhookUrl, { apiKey } = {}) {
  return whatsmeowFetch('/api/session/connect', {
    method: 'POST',
    apiKey,
    body: {
      agent_code: agentCode,
      webhook_url: webhookUrl || undefined,
    },
  });
}

export async function configureWhatsmeowWebhook(agentCode, webhookUrl, webhookSecret, { apiKey } = {}) {
  return whatsmeowFetch('/api/webhook/config', {
    method: 'POST',
    apiKey,
    body: {
      agent_code: agentCode,
      webhook_url: webhookUrl,
      webhook_secret: webhookSecret || undefined,
    },
  });
}

export async function logoutWhatsmeowSession(agentCode, { apiKey } = {}) {
  return whatsmeowFetch('/api/session/logout', {
    method: 'POST',
    apiKey,
    body: { agent_code: agentCode },
  });
}
