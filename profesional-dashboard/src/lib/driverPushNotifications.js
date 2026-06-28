/**
 * Push FCM para la driver-app.
 * Usa el mismo cliente Firebase ya configurado en firebaseAdmin.js.
 */
import {
  getFirebaseMessagingClient,
  isLikelyFcmToken,
  normalizeFcmDataPayload,
  normalizeFirebaseSendError,
} from './firebaseAdmin';

const STALE_TOKEN_REASONS = new Set(['device_not_registered', 'invalid_registration_token']);

/**
 * Envía una notificación push FCM al conductor.
 * @param {string} pushToken  - FCM token del conductor (drivers.push_token)
 * @param {{ title: string, body: string, data?: object, channelId?: string }} options
 */
export async function sendDriverPushNotification(
  pushToken,
  { title, body, data = {}, channelId = 'comisiones' } = {},
) {
  const token = String(pushToken || '').trim();
  if (!token) return { ok: false, reason: 'no_push_token' };
  if (!isLikelyFcmToken(token)) {
    return { ok: false, reason: 'invalid_push_token_format' };
  }

  const safeTitle = String(title || '').trim();
  const safeBody = String(body || '').trim();
  if (!safeTitle || !safeBody) return { ok: false, reason: 'invalid_payload' };

  try {
    const messageId = await getFirebaseMessagingClient().send({
      token,
      notification: { title: safeTitle, body: safeBody },
      data: normalizeFcmDataPayload(data),
      android: {
        priority: 'high',
        notification: {
          channelId,
          sound: 'default',
        },
      },
    });

    return { ok: true, messageId: messageId || null };
  } catch (error) {
    const normalized = normalizeFirebaseSendError(error);
    return {
      ok: false,
      reason: normalized.reason || 'push_error',
      code: normalized.code || null,
      message: normalized.message || null,
    };
  }
}

/**
 * Obtiene el push_token del conductor desde Supabase y envía la notificación.
 * Si el token está obsoleto, lo limpia de la tabla drivers.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} driverId
 * @param {{ title: string, body: string, data?: object, channelId?: string }} options
 */
export async function sendDriverPushById(supabase, driverId, options) {
  const { data: driver, error } = await supabase
    .from('drivers')
    .select('push_token')
    .eq('id', driverId)
    .single();

  if (error || !driver?.push_token) {
    return { ok: false, reason: 'no_push_token' };
  }

  const result = await sendDriverPushNotification(driver.push_token, options);

  if (!result.ok && STALE_TOKEN_REASONS.has(result.reason)) {
    await supabase
      .from('drivers')
      .update({ push_token: null })
      .eq('id', driverId);
  }

  return result;
}
