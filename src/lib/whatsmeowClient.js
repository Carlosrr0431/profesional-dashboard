/**
 * Cliente HTTP hacia whatsmeow-api (Railway).
 * Auth: header X-API-Key. Sesión: agent_code.
 *
 * Patrón alineado con remax-noa `whatsmeow-send-client.js`:
 * check-number antes de enviar, no normalizar JIDs (@lid).
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

/**
 * Normaliza a dígitos AR típicos (549…).
 * No usar con JIDs (@lid / @s.whatsapp.net): devolvería basura.
 */
export function normalizeWhatsmeowPhone(telefono) {
  const raw = String(telefono || '').trim();
  if (!raw || raw.includes('@')) return '';

  let clean = raw.replace(/\D/g, '');
  if (!clean) return '';

  if (clean.startsWith('0')) clean = clean.replace(/^0+/, '');

  // Evitar tratar un user-id de @lid (15+ dígitos) como teléfono AR
  if (clean.length > 13 && !clean.startsWith('54')) return '';

  if (clean.startsWith('549')) return clean;
  if (clean.startsWith('54') && !clean.startsWith('549')) {
    return `549${clean.slice(2)}`;
  }
  if (clean.length >= 8 && clean.length <= 11) {
    return `549${clean}`;
  }
  return clean;
}

function isWhatsappJid(value) {
  const s = String(value || '');
  return s.includes('@lid') || s.includes('@s.whatsapp.net') || s.includes('@g.us');
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

/** Check local (sin importar la cola) para no cargar next/server en tests. */
function shouldUseOutboundQueue(bypassQueue) {
  if (bypassQueue) return false;
  const flag = String(process.env.WHATSAPP_OUTBOUND_QUEUE_ENABLED || 'true').toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'off') return false;
  if (process.env.NODE_ENV === 'test' && process.env.WHATSAPP_OUTBOUND_QUEUE_ENABLED !== 'true') {
    return false;
  }
  return true;
}

/**
 * Resuelve el JID real (@lid o @s.whatsapp.net).
 * Enviar solo el número 549… puede devolver success sin entregar.
 */
export async function resolveWhatsmeowJid(agentCode, to, { apiKey } = {}) {
  const raw = String(to || '').trim();
  if (!raw || !agentCode) return '';
  if (raw.includes('@lid') || raw.includes('@s.whatsapp.net') || raw.includes('@g.us')) {
    return raw;
  }
  const phone = normalizeWhatsmeowPhone(raw);
  if (!phone) return '';
  try {
    const result = await whatsmeowFetch(
      `/api/check-number?agent_code=${encodeURIComponent(agentCode)}&phone=${encodeURIComponent(phone)}`,
      { method: 'GET', apiKey }
    );
    const jid = result.data?.data?.jid;
    const registered = result.data?.data?.registered;
    if (result.ok && result.data?.success !== false && registered && jid) {
      return String(jid);
    }
    if (result.ok && result.data?.success !== false && registered === false) {
      return '';
    }
  } catch {
    // fallback al teléfono
  }
  return phone;
}

/**
 * Envío HTTP inmediato (sin cola). Usar solo desde el worker de cola o bypass explícito.
 * @returns {Promise<{success: boolean, messageId?: string|null, error?: string, payload?: any, destinatario?: string}>}
 */
export async function sendWhatsmeowTextDirect(agentCode, to, text, { apiKey } = {}) {
  const message = String(text || '').trim();
  if (!agentCode || !to || !message) {
    return { success: false, error: 'agentCode, to y text son requeridos' };
  }

  try {
    const dest = await resolveWhatsmeowJid(agentCode, to, { apiKey });
    if (!dest) {
      return { success: false, error: 'number is not registered on WhatsApp' };
    }
    // Si `to` es teléfono → mandar dígitos (server resuelve JID + sender_pn).
    // Si `to` ya es JID (@lid) → mandar el JID resuelto. NUNCA normalizePhone(JID).
    const phonePayload = isWhatsappJid(to) ? dest : (normalizeWhatsmeowPhone(to) || dest);
    const result = await whatsmeowFetch('/api/messages/send', {
      method: 'POST',
      apiKey,
      body: { agent_code: agentCode, phone: phonePayload, message },
    });
    const messageId = extractMessageId(result.data);
    if (!result.ok || result.data?.success === false) {
      return {
        success: false,
        error: result.data?.message || result.data?.error || result.text?.slice(0, 200) || `HTTP ${result.status}`,
        payload: result.data,
      };
    }
    return {
      success: true,
      messageId: messageId || `out_${Date.now()}`,
      payload: result.data,
      destinatario: dest,
    };
  } catch (err) {
    return { success: false, error: err?.message || 'send_failed' };
  }
}

/**
 * POST /v2/message/sendPoll/{agentCode} — envío inmediato (sin cola).
 * @returns {Promise<{success: boolean, messageId?: string|null, error?: string, payload?: any, destinatario?: string}>}
 */
export async function sendWhatsmeowPollDirect(agentCode, to, { name, options, maxSelections = 1 } = {}, { apiKey } = {}) {
  const opts = (Array.isArray(options) ? options : [])
    .map((o) => String(o || '').trim())
    .filter(Boolean)
    .slice(0, 8);

  if (!agentCode || !to || opts.length < 2) {
    return { success: false, error: 'agentCode, to y al menos 2 options son requeridos' };
  }

  try {
    const dest = await resolveWhatsmeowJid(agentCode, to, { apiKey });
    if (!dest) {
      return { success: false, error: 'number is not registered on WhatsApp' };
    }
    const numberPayload = isWhatsappJid(to) ? dest : (normalizeWhatsmeowPhone(to) || dest);
    const result = await whatsmeowFetch(
      `/v2/message/sendPoll/${encodeURIComponent(agentCode)}`,
      {
        method: 'POST',
        apiKey,
        body: {
          agent_code: agentCode,
          number: numberPayload,
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
    return {
      success: true,
      messageId: messageId || `poll_${Date.now()}`,
      payload: result.data,
      destinatario: dest,
    };
  } catch (err) {
    return { success: false, error: err?.message || 'poll_send_failed' };
  }
}

/**
 * Envío de texto vía cola por línea (1 msg / 15s por agent_code). Fallback a directo si la cola no está migrada.
 * Opciones:
 * - `{ bypassQueue: true }` fuerza envío inmediato
 * - `{ awaitDelivery: true }` encola y espera el envío real (p.ej. resumen de viaje)
 */
export async function sendWhatsmeowText(agentCode, to, text, {
  apiKey,
  bypassQueue = false,
  awaitDelivery = false,
  priority,
  meta,
} = {}) {
  const message = String(text || '').trim();
  if (!agentCode || !to || !message) {
    return { success: false, error: 'agentCode, to y text son requeridos' };
  }

  if (shouldUseOutboundQueue(bypassQueue)) {
    try {
      const {
        enqueueWhatsappOutbound,
        enqueueAndAwaitWhatsappOutbound,
        OUTBOUND_PRIORITY,
      } = await import('./whatsappOutboundQueue');

      const enqueueParams = {
        agentCode,
        to,
        kind: 'text',
        payload: { text: message },
        priority: priority ?? OUTBOUND_PRIORITY.DEFAULT,
        meta,
      };

      const queued = awaitDelivery
        ? await enqueueAndAwaitWhatsappOutbound(enqueueParams, {
          apiKey,
          timeoutMs: 50_000,
          claimer: 'text-await',
        })
        : await enqueueWhatsappOutbound(enqueueParams);

      if (queued.success) return queued;
      if (!queued.missingTable) {
        return queued;
      }
      console.warn('[whatsmeow] cola ausente; envío directo', queued.error);
    } catch (err) {
      console.warn('[whatsmeow] cola falló; envío directo', err?.message || err);
    }
  }

  return sendWhatsmeowTextDirect(agentCode, to, message, { apiKey });
}

/**
 * Envío de poll vía cola por línea (espera el messageId real para matchear votos).
 * `{ bypassQueue: true }` fuerza inmediato.
 */
export async function sendWhatsmeowPoll(agentCode, to, { name, options, maxSelections = 1 } = {}, {
  apiKey,
  bypassQueue = false,
  priority,
  meta,
} = {}) {
  const opts = (Array.isArray(options) ? options : [])
    .map((o) => String(o || '').trim())
    .filter(Boolean)
    .slice(0, 8);

  if (!agentCode || !to || opts.length < 2) {
    return { success: false, error: 'agentCode, to y al menos 2 options son requeridos' };
  }

  if (shouldUseOutboundQueue(bypassQueue)) {
    try {
      const {
        enqueueAndAwaitWhatsappOutbound,
        OUTBOUND_PRIORITY,
      } = await import('./whatsappOutboundQueue');

      const queued = await enqueueAndAwaitWhatsappOutbound(
        {
          agentCode,
          to,
          kind: 'poll',
          payload: {
            name: name || 'Elegí una opción',
            options: opts,
            maxSelections: maxSelections > 0 ? maxSelections : 1,
          },
          priority: priority ?? OUTBOUND_PRIORITY.POLL,
          meta,
        },
        { apiKey, timeoutMs: 50_000, claimer: 'poll-await' }
      );
      if (queued.success) return queued;
      if (!queued.missingTable) {
        return queued;
      }
      console.warn('[whatsmeow] cola ausente; poll directo', queued.error);
    } catch (err) {
      console.warn('[whatsmeow] cola falló; poll directo', err?.message || err);
    }
  }

  return sendWhatsmeowPollDirect(
    agentCode,
    to,
    { name, options: opts, maxSelections },
    { apiKey }
  );
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

export async function disconnectWhatsmeowSession(agentCode, { apiKey } = {}) {
  return whatsmeowFetch('/api/session/disconnect', {
    method: 'POST',
    apiKey,
    body: { agent_code: agentCode },
  });
}

export async function logoutWhatsmeowSession(agentCode, { apiKey } = {}) {
  return whatsmeowFetch('/api/session/logout', {
    method: 'POST',
    apiKey,
    body: { agent_code: agentCode },
  });
}
