import {
  CHATS_LINE_PHONE,
  chatMessagePreview,
  digitsOnly,
  isChatsLine,
} from './chatDisplay';

export {
  CHATS_LINE_PHONE,
  chatMessagePreview,
  digitsOnly,
  formatArMobile,
  isChatsLine,
} from './chatDisplay';

function chatsConfig() {
  const baseUrl = String(process.env.CLOUDFLARE_CHATS_URL || '').replace(/\/$/, '');
  const secret = String(process.env.CLOUDFLARE_CHATS_SECRET || '');
  if (!baseUrl || !secret) return null;
  return { baseUrl, secret };
}

async function chatsFetch(path, { method = 'GET', body } = {}) {
  const config = chatsConfig();
  if (!config) {
    const error = new Error('El archivo de chats todavía no está configurado.');
    error.status = 503;
    throw error;
  }
  const response = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${config.secret}`,
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.message || 'No se pudo leer los chats.');
    error.status = response.status || 502;
    throw error;
  }
  return payload;
}

export async function recordWhatsAppChatMessage(input = {}) {
  try {
    const linePhone = digitsOnly(input.linePhone);
    const peerPhone = digitsOnly(input.peerPhone);
    const messageId = String(input.messageId || '').trim();
    if (!isChatsLine(linePhone) || peerPhone.length < 8 || peerPhone === digitsOnly(CHATS_LINE_PHONE)) {
      return { stored: false };
    }
    if (!messageId || !chatsConfig()) return { stored: false };
    const sentAt = Number(input.sentAt);
    await chatsFetch('/ingest', {
      method: 'POST',
      body: {
        linePhone: CHATS_LINE_PHONE,
        peerPhone,
        peerName: String(input.peerName || '').trim() || null,
        messageId,
        direction: input.direction === 'outgoing' ? 'outgoing' : 'incoming',
        messageType: String(input.messageType || 'text').slice(0, 32),
        body: chatMessagePreview(input),
        sentAt: Number.isFinite(sentAt) && sentAt > 0 ? sentAt : Date.now(),
      },
    });
    return { stored: true };
  } catch {
    return { stored: false };
  }
}

export function listStoredChats() {
  return chatsFetch('/chats');
}

export function listStoredMessages(chatId, before) {
  const params = new URLSearchParams({ chat: String(chatId || '') });
  if (before) params.set('before', String(before));
  return chatsFetch(`/messages?${params}`);
}

export function markStoredChatRead(chatId) {
  return chatsFetch('/read', { method: 'POST', body: { chatId } });
}
