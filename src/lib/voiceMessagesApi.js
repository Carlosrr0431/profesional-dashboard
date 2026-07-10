import { supabase } from './supabase';

/**
 * Inserta filas en voice_messages vía API admin (evita RLS del cliente).
 * @param {Array<{ driver_id: string, sender_type?: string, audio_url: string, duration_seconds?: number }>} messages
 */
export async function insertVoiceMessagesViaApi(messages) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;

  const response = await fetch('/api/voice-messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    const err = new Error(payload?.error?.message || 'No se pudo enviar el mensaje de voz');
    err.code = payload?.error?.code || null;
    err.status = response.status;
    throw err;
  }

  return payload?.data || null;
}
