const LINE = '5493872138777';
const PAGE = 400;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function authorized(request, env) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return Boolean(env.CHATS_SECRET) && token === env.CHATS_SECRET;
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

export default {
  async fetch(request, env) {
    if (!authorized(request, env)) return json({ ok: false, message: 'No autorizado' }, 401);
    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/ingest') return ingest(request, env);
      if (request.method === 'GET' && url.pathname === '/chats') return listChats(env);
      if (request.method === 'GET' && url.pathname === '/messages') return listMessages(url, env);
      if (request.method === 'POST' && url.pathname === '/read') return markRead(request, env);
      return json({ ok: false, message: 'No encontrado' }, 404);
    } catch {
      return json({ ok: false, message: 'No se pudo leer el archivo de chats' }, 500);
    }
  },
};

async function ingest(request, env) {
  const body = await request.json().catch(() => null);
  const linePhone = digits(body?.linePhone);
  const peerPhone = digits(body?.peerPhone);
  const messageId = String(body?.messageId || '').trim().slice(0, 180);
  if (linePhone !== LINE || peerPhone.length < 8 || peerPhone === LINE || !messageId) {
    return json({ ok: false, message: 'Mensaje incompleto' }, 400);
  }
  const direction = body?.direction === 'outgoing' ? 'outgoing' : 'incoming';
  const messageType = String(body?.messageType || 'text').slice(0, 32);
  const text = String(body?.body || '').replace(/\s+/g, ' ').trim().slice(0, 4000);
  const sentAt = Number(body?.sentAt);
  const when = Number.isFinite(sentAt) && sentAt > 0 ? Math.trunc(sentAt) : Date.now();
  const peerName = String(body?.peerName || '').trim().slice(0, 80) || null;
  const savedName = String(body?.savedName || '').trim().slice(0, 80) || null;
  const chatId = `${LINE}:${peerPhone}`;

  const inserted = await env.DB.prepare(
    `INSERT INTO wa_messages (id, chat_id, line_phone, peer_phone, direction, message_type, body, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).bind(messageId, chatId, LINE, peerPhone, direction, messageType, text, when).run();
  const isNew = Number(inserted?.meta?.changes || 0) > 0;
  const unreadBump = isNew && direction === 'incoming' ? 1 : 0;

  await env.DB.prepare(
    `INSERT INTO wa_chats (
       id, line_phone, peer_phone, peer_name, saved_name, last_body, last_type, last_direction, last_at, unread
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       peer_name = COALESCE(excluded.peer_name, wa_chats.peer_name),
       saved_name = COALESCE(excluded.saved_name, wa_chats.saved_name),
       last_body = CASE WHEN excluded.last_at >= wa_chats.last_at THEN excluded.last_body ELSE wa_chats.last_body END,
       last_type = CASE WHEN excluded.last_at >= wa_chats.last_at THEN excluded.last_type ELSE wa_chats.last_type END,
       last_direction = CASE WHEN excluded.last_at >= wa_chats.last_at THEN excluded.last_direction ELSE wa_chats.last_direction END,
       last_at = CASE WHEN excluded.last_at >= wa_chats.last_at THEN excluded.last_at ELSE wa_chats.last_at END,
       unread = wa_chats.unread + ?`,
  ).bind(
    chatId,
    LINE,
    peerPhone,
    peerName,
    savedName,
    text,
    messageType,
    direction,
    when,
    unreadBump,
    unreadBump,
  ).run();

  return json({ ok: true, stored: isNew });
}

async function listChats(env) {
  const rows = await env.DB.prepare(
    `SELECT id, peer_phone, peer_name, saved_name, last_body, last_type, last_direction, last_at, unread
     FROM wa_chats
     WHERE line_phone = ?
     ORDER BY last_at DESC
     LIMIT 300`,
  ).bind(LINE).all();
  return json({ ok: true, linePhone: LINE, chats: rows.results || [] });
}

async function listMessages(url, env) {
  const chatId = String(url.searchParams.get('chat') || '').trim();
  if (!chatId.startsWith(`${LINE}:`)) return json({ ok: false, message: 'Chat inválido' }, 400);
  const before = Number(url.searchParams.get('before'));
  const hasBefore = Number.isFinite(before) && before > 0;
  const statement = hasBefore
    ? `SELECT id, direction, message_type, body, sent_at
       FROM wa_messages
       WHERE chat_id = ? AND sent_at < ?
       ORDER BY sent_at DESC
       LIMIT ?`
    : `SELECT id, direction, message_type, body, sent_at
       FROM wa_messages
       WHERE chat_id = ?
       ORDER BY sent_at DESC
       LIMIT ?`;
  const query = env.DB.prepare(statement);
  const bound = hasBefore
    ? query.bind(chatId, Math.trunc(before), PAGE)
    : query.bind(chatId, PAGE);
  const rows = await bound.all();
  const messages = (rows.results || []).slice().reverse();
  return json({ ok: true, messages, hasMore: (rows.results || []).length === PAGE });
}

async function markRead(request, env) {
  const body = await request.json().catch(() => null);
  const chatId = String(body?.chatId || '').trim();
  if (!chatId.startsWith(`${LINE}:`)) return json({ ok: false, message: 'Chat inválido' }, 400);
  await env.DB.prepare('UPDATE wa_chats SET unread = 0 WHERE id = ? AND line_phone = ?')
    .bind(chatId, LINE)
    .run();
  return json({ ok: true });
}
