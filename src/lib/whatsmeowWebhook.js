/**
 * Normaliza webhooks whatsmeow → forma que entiende Agente_IA (Wasender-like).
 *
 * whatsmeow envía MessageEvent plano:
 *   { event, agent_code, data: { id, from, body, type, chat_jid, sender_pn, button_id, poll_id, poll_option, ... } }
 *
 * Agente_IA espera:
 *   messages.upsert → data.messages = { key: { id, remoteJid, fromMe }, message: {...}, pushName }
 *   poll.results    → data.key.id + data.pollResult[{ name, voters }]
 */

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function isWhatsmeowMessageEvent(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (data.key && (data.message || data.messageBody)) return false; // ya Wasender-like
  return Boolean(
    data.id
    || data.chat_jid
    || data.sender_pn
    || data.is_from_me != null
    || data.button_id
    || data.poll_id
  );
}

function phoneFromWhatsmeowMsg(msg) {
  const pn = digitsOnly(msg.sender_pn || '');
  if (pn.length >= 8) return pn;

  const candidates = [msg.chat_jid, msg.from, msg.to];
  for (const c of candidates) {
    const s = String(c || '');
    if (!s || s.includes('@g.us') || s.includes('@lid') || s.includes('@broadcast')) continue;
    const user = s.includes('@') ? s.split('@')[0].split(':')[0] : s;
    const d = digitsOnly(user);
    if (d.length >= 8) return d;
  }
  return '';
}

function buildRemoteJid(msg) {
  const phone = phoneFromWhatsmeowMsg(msg);
  if (phone) return `${phone}@s.whatsapp.net`;
  const chat = String(msg.chat_jid || msg.from || '');
  if (chat.includes('@')) return chat;
  if (chat) return `${chat}@s.whatsapp.net`;
  return '';
}

function buildMessageObject(msg) {
  const body = String(msg.body || '');
  const type = String(msg.type || 'text');

  switch (type) {
    case 'image':
      return {
        imageMessage: {
          caption: body,
          url: msg.media_url || '',
          mimetype: msg.mimetype || 'image/jpeg',
          mediaKey: msg.media_key || undefined,
          fileSha256: msg.file_sha256 || undefined,
          fileLength: msg.file_length || undefined,
        },
      };
    case 'video':
      return {
        videoMessage: {
          caption: body,
          url: msg.media_url || '',
          mimetype: msg.mimetype || 'video/mp4',
          mediaKey: msg.media_key || undefined,
        },
      };
    case 'audio':
    case 'ptt':
      return {
        audioMessage: {
          url: msg.media_url || '',
          mimetype: msg.mimetype || 'audio/ogg; codecs=opus',
          mediaKey: msg.media_key || undefined,
          fileSha256: msg.file_sha256 || undefined,
          fileLength: msg.file_length || undefined,
          ptt: type === 'ptt',
        },
      };
    case 'document':
      return {
        documentMessage: {
          caption: body,
          url: msg.media_url || '',
          mimetype: msg.mimetype || 'application/octet-stream',
          fileName: msg.file_name || 'archivo',
        },
      };
    case 'sticker':
      return {
        stickerMessage: {
          url: msg.media_url || '',
          mimetype: msg.mimetype || 'image/webp',
        },
      };
    case 'location': {
      let lat = Number(msg.latitude);
      let lng = Number(msg.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
        const match = String(msg.body || '').match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
        if (match) {
          lat = Number(match[1]);
          lng = Number(match[2]);
        }
      }
      return {
        locationMessage: {
          degreesLatitude: Number.isFinite(lat) ? lat : 0,
          degreesLongitude: Number.isFinite(lng) ? lng : 0,
          name: String(msg.name || '').trim() || '',
          address: String(msg.address || body || '').trim() || '',
        },
      };
    }
    case 'button_reply':
    case 'list_reply':
    case 'poll_vote': {
      const buttonId = String(msg.button_id || '');
      const pollOption = String(msg.poll_option || '').trim();
      const display = pollOption || body || buttonId;
      return {
        conversation: display,
        buttonsResponseMessage: {
          selectedButtonID: buttonId,
          selectedDisplayText: display,
        },
      };
    }
    default:
      return { conversation: body };
  }
}

function toWasenderUpsert(msg, agentCode) {
  const remoteJid = buildRemoteJid(msg);
  const phone = phoneFromWhatsmeowMsg(msg);
  return {
    event: 'messages.upsert',
    agent_code: agentCode || undefined,
    data: {
      messages: {
        key: {
          id: msg.id || msg.message_id || `wm_${Date.now()}`,
          remoteJid,
          fromMe: msg.is_from_me === true,
          cleanedSenderPn: phone || undefined,
          senderPn: phone ? `${phone}@s.whatsapp.net` : undefined,
        },
        message: buildMessageObject(msg),
        messageBody: String(msg.poll_option || msg.body || '').trim() || undefined,
        pushName: msg.push_name || msg.pushName || null,
        _whatsmeow: {
          type: msg.type,
          button_id: msg.button_id || null,
          poll_id: msg.poll_id || null,
          poll_option: msg.poll_option || null,
          has_media: Boolean(msg.has_media),
        },
      },
    },
  };
}

/**
 * Convierte voto whatsmeow (poll/button) al handler poll.results de Agente_IA.
 * voted.name = texto de la opción (poll_option) para match contra candidates.
 */
function toPollResults(msg, agentCode) {
  const phone = phoneFromWhatsmeowMsg(msg);
  const remoteJid = phone ? `${phone}@s.whatsapp.net` : buildRemoteJid(msg);
  const pollMsgId = String(msg.poll_id || '').trim();
  const buttonId = String(msg.button_id || '').trim();
  const pollOption = String(msg.poll_option || '').trim();
  const body = String(msg.body || '').trim();

  // Prioridad: texto de opción → body → button_id (opt_N).
  // El handler de Agente_IA resuelve opt_N / índice vía findPollCandidateByVote.
  let votedName = pollOption || body || buttonId;

  return {
    event: 'poll.results',
    agent_code: agentCode || undefined,
    data: {
      key: {
        id: pollMsgId || msg.id || '',
        remoteJid,
        fromMe: false,
      },
      pollResult: [
        {
          name: votedName,
          voters: phone ? [`${phone}@s.whatsapp.net`] : (remoteJid ? [remoteJid] : []),
          button_id: buttonId || null,
          poll_option: pollOption || null,
        },
      ],
      _whatsmeow_vote: true,
    },
  };
}

function isPollVoteMsg(msg) {
  if (!msg || typeof msg !== 'object') return false;
  if (msg.poll_id) return true;
  if (String(msg.type || '') === 'poll_vote') return true;
  if (/^opt_\d+$/i.test(String(msg.button_id || ''))) return true;
  return false;
}

/**
 * @param {object} body webhook crudo
 * @returns {object} body normalizado para processWebhookBody
 */
export function normalizeWhatsmeowWebhookBody(body) {
  if (!body || typeof body !== 'object') return body;

  const event = String(body.event || '').trim();
  const agentCode = body.agent_code || body.agentCode || null;
  const rawData = body.data;

  // session.status already compatible enough
  if (event === 'session.status') {
    return {
      ...body,
      event: 'session.status',
      data: {
        ...(typeof rawData === 'object' && rawData ? rawData : {}),
        status: rawData?.status || body.status,
        qr: rawData?.qr_image || rawData?.qr_code || rawData?.qr || null,
        phone: rawData?.phone || null,
        agent_code: agentCode || rawData?.agent_code,
      },
    };
  }

  // Dedicar poll/button con voto a poll.results; ignorar duplicados button/list sin voto
  const msgs = Array.isArray(rawData) ? rawData : (rawData ? [rawData] : []);
  const first = msgs[0];

  if (['messages.poll', 'messages.button', 'messages.list'].includes(event) && isWhatsmeowMessageEvent(first)) {
    if (isPollVoteMsg(first) || event === 'messages.poll') {
      return toPollResults(first, agentCode);
    }
    // button/list sin poll → upsert texto
    return toWasenderUpsert(first, agentCode);
  }

  if (['messages.upsert', 'messages.received'].includes(event) && isWhatsmeowMessageEvent(first)) {
    // Voto también llega como upsert: convertir a poll.results (idempotente si llega messages.poll después)
    if (isPollVoteMsg(first)) {
      return toPollResults(first, agentCode);
    }
    return toWasenderUpsert(first, agentCode);
  }

  // Payload whatsmeow sin event explícito
  if (!event && isWhatsmeowMessageEvent(rawData || body)) {
    const msg = isWhatsmeowMessageEvent(rawData) ? rawData : body;
    if (isPollVoteMsg(msg)) return toPollResults(msg, agentCode);
    return toWasenderUpsert(msg, agentCode);
  }

  return body;
}

/** Extrae teléfono del payload whatsmeow crudo (antes de normalizar). */
export function peekWhatsmeowPhone(body) {
  try {
    const data = body?.data;
    const msg = Array.isArray(data) ? data[0] : data;
    if (isWhatsmeowMessageEvent(msg)) {
      return phoneFromWhatsmeowMsg(msg);
    }
    return '';
  } catch {
    return '';
  }
}
