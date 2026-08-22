/**
 * Señales de bloqueo / error permanente de WhatsApp (whatsmeow).
 * Usado por la cola de salida para no martillar la línea cuando Meta ya la marcó.
 */

export const WHATSAPP_BAN_PAUSE_MS = Math.max(
  60_000,
  Math.round(Number(process.env.WHATSAPP_BAN_PAUSE_MS || 45 * 60_000) || 45 * 60_000)
);

export const WHATSAPP_DISCONNECT_PAUSE_MS = Math.max(
  30_000,
  Math.round(Number(process.env.WHATSAPP_DISCONNECT_PAUSE_MS || 120_000) || 120_000)
);

export function isWhatsappBanLikeError(error) {
  const msg = String(error || '').toLowerCase();
  if (!msg.trim()) return false;
  return /banned|blocked|forbidden|\bspam\b|rate.?limit|too many|not.?authorized|\b403\b|\b401\b|iq.?error|temporarily.?banned|connection.?closed/.test(msg);
}

export function isWhatsappPermanentSendError(error) {
  const msg = String(error || '').toLowerCase();
  if (/not registered|no longer available|item-not-found|recipient.{0,60}not.{0,30}whatsapp/.test(msg)) {
    return true;
  }
  return isWhatsappBanLikeError(error);
}

export function isWhatsappTransientDisconnect(error) {
  const msg = String(error || '').toLowerCase();
  if (!msg.trim()) return false;
  if (isWhatsappBanLikeError(msg)) return false;
  return /websocket not connected|whatsapp not connected|not connected for this agent/.test(msg);
}
