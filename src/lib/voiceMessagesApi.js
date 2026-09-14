import { supabase } from './supabase';
export { mergeVoiceMessage, mergeVoiceMessages } from './voiceMessages';

async function authHeaders() {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function throwApiError(payload, fallback) {
  const err = new Error(payload?.error?.message || fallback);
  err.code = payload?.error?.code || null;
  throw err;
}

/**
 * Inserta filas en voice_messages vía API admin (evita RLS del cliente).
 * @param {Array<{ driver_id: string, sender_type?: string, audio_url: string, duration_seconds?: number }>} messages
 */
export async function insertVoiceMessagesViaApi(messages) {
  const response = await fetch('/api/voice-messages', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ messages }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throwApiError(payload, 'No se pudo enviar el mensaje de voz');
  }

  return payload?.data || null;
}

export async function fetchVoiceMessagesViaApi(driverId) {
  const id = String(driverId || '').trim();
  if (!id) return [];

  const response = await fetch(`/api/voice-messages?driver_id=${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: await authHeaders(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throwApiError(payload, 'No se pudieron cargar los mensajes de voz');
  }
  return Array.isArray(payload?.data?.messages) ? payload.data.messages : [];
}

export async function fetchIncomingDriverVoiceViaApi() {
  const response = await fetch('/api/voice-messages?inbox=1', {
    method: 'GET',
    headers: await authHeaders(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throwApiError(payload, 'No se pudieron cargar los audios del chofer');
  }
  return Array.isArray(payload?.data?.messages) ? payload.data.messages : [];
}

export async function markVoiceMessagesPlayedViaApi(ids) {
  const messageIds = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (messageIds.length === 0) return [];

  const response = await fetch('/api/voice-messages', {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify({ ids: messageIds, is_played: true }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throwApiError(payload, 'No se pudo marcar el audio como escuchado');
  }
  return Array.isArray(payload?.data?.ids) ? payload.data.ids : messageIds;
}
