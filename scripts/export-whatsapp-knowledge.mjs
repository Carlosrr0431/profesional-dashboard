/**
 * Exporta conversaciones WhatsApp: pedidos de viaje, seguimiento por sesión (tabla messages)
 * y frases que el pasajero usa durante el proceso (cancelar, consultar chofer, etc.).
 *
 * Dos fuentes de datos (mismo patrón de uso, distinto esquema):
 *
 * | --source   | Tablas                         | Filtro propietario      |
 * |------------|--------------------------------|-------------------------|
 * | legacy     | chats + messages               | propietario = Profesional_App |
 * | remis      | whatsapp_conversations + whatsapp_messages | todos los chats del proyecto remis |
 * | auto       | prueba legacy; si no existe, usa remis      |                          |
 *
 * Variables de entorno (prioridad para legacy / CRM):
 *   KNOWLEDGE_SUPABASE_URL, KNOWLEDGE_SUPABASE_ANON_KEY
 *   (si no están, usa NEXT_PUBLIC_SUPABASE_* / SUPABASE_SERVICE_ROLE_KEY)
 *
 * Uso:
 *   cd profesional-dashboard
 *   node scripts/export-whatsapp-knowledge.mjs
 *   node scripts/export-whatsapp-knowledge.mjs --source legacy
 *   node scripts/export-whatsapp-knowledge.mjs --source remis --limit-chats 100
 *   node scripts/export-whatsapp-knowledge.mjs --since 2026-01-01
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const DASHBOARD_ROOT = path.resolve(__dirname, '..');

const CHAT_OWNER = process.env.WHATSAPP_CHAT_OWNER || 'Profesional_App';
const PAGE_SIZE = 1000;

// ─── env ─────────────────────────────────────────────────────────────────────

function loadEnvFile(relativePath, baseDir) {
  const filePath = path.join(baseDir, relativePath);
  if (!fs.existsSync(filePath)) return;
  const env = fs.readFileSync(filePath, 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile('.env', DASHBOARD_ROOT);
loadEnvFile('.env.local', DASHBOARD_ROOT);

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    outDir: path.join(DASHBOARD_ROOT, 'data', 'whatsapp-knowledge'),
    limitChats: null,
    since: null,
    dryRun: false,
    source: 'auto',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--limit-chats') opts.limitChats = Number(argv[++i]);
    else if (arg === '--since') opts.since = argv[++i];
    else if (arg === '--out') opts.outDir = path.resolve(argv[++i]);
    else if (arg === '--source') opts.source = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log(`Uso: node scripts/export-whatsapp-knowledge.mjs [opciones]
  --source legacy|remis|auto   Fuente de datos (default: auto)
  --out <dir>                    Carpeta de salida
  --limit-chats <n>              Máximo de chats
  --since <YYYY-MM-DD>           Solo mensajes desde esa fecha (UTC)
  --dry-run                      Solo conteos, sin escribir archivos`);
      process.exit(0);
    }
  }
  if (!['legacy', 'remis', 'auto'].includes(opts.source)) {
    console.error('--source debe ser legacy, remis o auto');
    process.exit(1);
  }
  return opts;
}

const SOURCES = {
  legacy: {
    chatsTable: 'chats',
    messagesTable: 'messages',
    chatIdField: 'id',
    messageChatField: 'chat_id',
    messageTimeField: 'message_timestamp',
    ownerField: 'propietario',
    mapChat: (c) => ({
      id: c.id,
      telefono: c.telefono,
      contact_name: c.contact_name,
      updated_at: c.updated_at,
      ultimo_mensaje_asistente: c.ultimo_mensaje_asistente,
    }),
    mapMessage: (m) => ({
      id: m.id,
      chat_id: m.chat_id,
      type: m.type,
      status: m.status,
      direction: m.direction,
      content: m.content,
      metadata: m.metadata,
      reactions: m.reactions,
      media_url: m.media_url,
      message_timestamp: m.message_timestamp || m.created_at,
      created_at: m.created_at,
      propietario: m.propietario,
      is_edited: m.is_edited,
    }),
    filterChats: (q) => q.eq('propietario', CHAT_OWNER),
    filterMessages: (q) => q.eq('propietario', CHAT_OWNER),
  },
  remis: {
    chatsTable: 'whatsapp_conversations',
    messagesTable: 'whatsapp_messages',
    chatIdField: 'id',
    messageChatField: 'conversation_id',
    messageTimeField: 'created_at',
    ownerField: null,
    mapChat: (c) => ({
      id: c.id,
      telefono: c.phone,
      contact_name: c.push_name,
      updated_at: c.updated_at,
      ultimo_mensaje_asistente: null,
      status: c.status,
    }),
    mapMessage: (m) => ({
      id: m.id,
      chat_id: m.conversation_id,
      type: m.message_type,
      direction: m.direction,
      content: m.content || m.transcription,
      message_timestamp: m.created_at,
      created_at: m.created_at,
    }),
    filterChats: (q) => q,
    filterMessages: (q) => q,
  },
};

// ─── heurísticas (alineadas con route.js / intents del agente) ───────────────

function normalizeForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeAddressText(value) {
  if (!value || value.length < 4) return false;
  const hasStreetAndNumber = /[a-zA-ZÀ-ÿ]{2,}[\w\s.'-]*\s\d{1,5}(?:\s*[a-zA-Z]\d?)?/i.test(value);
  const hasIntersection = /\b[a-zA-ZÀ-ÿ]{2,}[\w\s.'-]*\s+y\s+[a-zA-ZÀ-ÿ]{2,}[\w\s.'-]*/i.test(value);
  const hasStreetKeyword = /\b(calle|av\.?|avenida|pasaje|pje\.?|barrio|esquina|callej[oó]n|manzana|mz\.?|lote)\b/i.test(value);
  if (hasStreetAndNumber || hasIntersection) return true;
  if (hasStreetKeyword && value.length >= 8) return true;
  return false;
}

function looksLikeTripRequest(text) {
  const normalized = normalizeForMatch(text);
  return /(remis|taxi|movil|auto|coche|viaje|pasame\s+a\s+buscar|busc[aá][sm]e?|me\s+busc[aá]s|llevame|llevarme|quiero\s+ir|mand[aá](?:me)?\s+(?:un|una|uno|el|la|movil|remis|taxi|auto)|ven[ií]\s+a\s+buscarme|necesito\s+(?:un|una)?\s*(?:remis|movil|taxi|auto)|quiero\s+(?:un|una)?\s*(?:remis|movil|taxi|auto))/i.test(
    normalized
  );
}

function looksLikePriceInquiry(text) {
  const n = normalizeForMatch(text);
  return /\b(cuanto|cuánto|precio|tarifa|sale|cuesta|cobran|me\s+saldr)/i.test(n) && /\b(de|a|hasta|desde)\b/i.test(n);
}

function looksLikeScheduleTrip(text) {
  const n = normalizeForMatch(text);
  const hasVehicle = looksLikeTripRequest(text) || /\b(remis|movil|taxi|auto|reserv)/i.test(n);
  const hasTime =
    /\b(hoy|manana|mañana|lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\b/i.test(n) ||
    /\ba\s+las\s+\d{1,2}(?::\d{2})?\b/i.test(n) ||
    /\bpara\s+las\s+\d{1,2}/i.test(n) ||
    /\breserv/i.test(n);
  return hasVehicle && hasTime;
}

function looksLikeCancel(text) {
  const n = normalizeForMatch(text);
  return /\b(cancel|anul|ya\s+no|no\s+quiero|me\s+surgio|olvida)/i.test(n);
}

function looksLikeStatusQuery(text) {
  const n = normalizeForMatch(text);
  return /\b(donde\s+esta|donde\s+queda|cuanto\s+falta|ya\s+viene|llego\s+el|numero\s+del\s+chofer|patente)/i.test(n);
}

function isShortAck(text) {
  const n = normalizeForMatch(text);
  if (!n || n.length > 40) return false;
  if (/^(?:ok|dale|si|sí|no|gracias|chau|listo|perfecto|genial|buenisimo|buenísimo|de\s+una|a\s+una\s+cuadra|👍|👌|🙏|✅|❌|🙂|😊)+$/.test(n)) return true;
  if (/^[\p{Emoji}\s]+$/u.test(text.trim()) && text.trim().length <= 8) return true;
  return false;
}

function isGreetingOnly(text) {
  const n = normalizeForMatch(text);
  return /^(?:hola|buen[oa]s?(?:\s+dias?|\s+tardes?|\s+noches?)?|buenas)$/.test(n);
}

/** Mensajes fuera del pedido pero aún relevantes para el agente de remises. */
function isTripContextualReply(text) {
  const raw = String(text || '').trim();
  const n = normalizeForMatch(raw);
  if (!n || /osita|ochita|weño|mila\s*\?|comidita|flyer|catalogo/i.test(n)) return false;

  if (
    /(?:remis|movil|taxi|auto|viaje|chofer|conductor|patente|espera|demora|tarifa|precio|cancel|llego|llegue|ya\s+vien|donde\s+esta|cuanto\s+falta|otro\s+pedido|ninguna|poll|opcion|direccion|retiro|destino|buscar|buscame|numero\s+del|por\s+donde\s+vien)/i.test(
      n
    )
  ) {
    return true;
  }

  if (raw.length <= 35 && /^(?:es otro pedido|porfa|por favor|todavia no|todavia ño|chi|chii|sii|si+|no+|ah[ií]|listo|ya estoy yendo)$/i.test(n)) {
    return true;
  }

  return false;
}

function classifyIncomingMessage(msg) {
  const type = String(msg.type || 'text').toLowerCase();
  const content = String(msg.content || '').trim();
  const direction = String(msg.direction || '').toLowerCase();

  if (direction !== 'incoming') {
    return { category: 'outgoing', intentHint: null };
  }

  if (type === 'location' || type === 'live_location') {
    return { category: 'location_share', intentHint: 'trip_request' };
  }
  if (type === 'poll' || type === 'poll_update') {
    return { category: 'poll_response', intentHint: 'address_reply' };
  }
  if (type !== 'text' && type !== 'chat') {
    return { category: `media_${type}`, intentHint: 'other' };
  }

  if (!content) {
    return { category: 'empty', intentHint: 'other' };
  }

  if (isGreetingOnly(content)) {
    return { category: 'greeting', intentHint: 'other' };
  }
  if (isShortAck(content)) {
    return { category: 'acknowledgment', intentHint: 'other' };
  }
  if (looksLikeCancel(content)) {
    return { category: 'cancel_trip', intentHint: 'cancel_trip' };
  }
  if (looksLikeStatusQuery(content)) {
    return { category: 'status_query', intentHint: 'status_query' };
  }
  if (looksLikePriceInquiry(content)) {
    return { category: 'price_inquiry', intentHint: 'price_inquiry' };
  }
  if (looksLikeScheduleTrip(content)) {
    return { category: 'schedule_trip', intentHint: 'schedule_trip' };
  }
  if (looksLikeTripRequest(content)) {
    return { category: 'trip_request', intentHint: 'trip_request' };
  }
  if (looksLikeAddressText(content) || /^\d{1,5}[a-z]?$/.test(normalizeForMatch(content))) {
    return { category: 'address_reply', intentHint: 'trip_request' };
  }
  if (content.length <= 3 && /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]+$/u.test(content)) {
    return { category: 'reaction_emoji', intentHint: 'other' };
  }

  return { category: 'conversational_other', intentHint: 'other' };
}

// ─── paginación Supabase ─────────────────────────────────────────────────────

async function fetchAllRows(supabase, table, buildQuery) {
  const rows = [];
  let from = 0;
  for (;;) {
    let q = supabase.from(table).select('*').range(from, from + PAGE_SIZE - 1);
    q = buildQuery(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function fetchMessagesForChats(supabase, sourceConfig, chatIds, sinceIso) {
  if (chatIds.length === 0) return [];

  const all = [];
  const chunkSize = 80;
  const { messagesTable, messageChatField, messageTimeField, filterMessages } = sourceConfig;

  for (let i = 0; i < chatIds.length; i += chunkSize) {
    const chunk = chatIds.slice(i, i + chunkSize);
    let from = 0;
    for (;;) {
      let q = supabase
        .from(messagesTable)
        .select('*')
        .in(messageChatField, chunk)
        .order(messageTimeField, { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      q = filterMessages(q);

      if (sinceIso) {
        q = q.gte(messageTimeField, sinceIso);
      }

      const { data, error } = await q;
      if (error) throw new Error(`${messagesTable}: ${error.message}`);
      if (!data?.length) break;
      all.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  return all;
}

async function detectSource(supabase) {
  const { error } = await supabase.from('chats').select('id').limit(1);
  if (!error) return 'legacy';
  const msg = String(error.message || '').toLowerCase();
  if (msg.includes('does not exist') || msg.includes('schema cache')) {
    return 'remis';
  }
  throw new Error(`No se pudo detectar fuente (chats): ${error.message}`);
}

function createSupabaseClient() {
  const url =
    process.env.KNOWLEDGE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.KNOWLEDGE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.KNOWLEDGE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Faltan credenciales. Para legacy: KNOWLEDGE_SUPABASE_URL + KNOWLEDGE_SUPABASE_ANON_KEY. Para remis: NEXT_PUBLIC_SUPABASE_*'
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── comparar con test-viajes-whatsapp.txt ───────────────────────────────────

function loadTestPhrases() {
  const testFile = path.join(REPO_ROOT, 'test-viajes-whatsapp.txt');
  if (!fs.existsSync(testFile)) return new Set();

  const lines = fs.readFileSync(testFile, 'utf8').split(/\r?\n/);
  const phrases = new Set();
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('═') || t.startsWith('─') || t.startsWith('INSTRUCCIONES')) continue;
    if (/^\d+\./.test(t)) continue;
    const norm = normalizeForMatch(t);
    if (norm.length >= 3) phrases.add(norm);
  }
  return phrases;
}

function isNovelPhrase(text, testPhrases) {
  const norm = normalizeForMatch(text);
  if (norm.length < 3) return false;
  if (testPhrases.has(norm)) return false;
  for (const known of testPhrases) {
    if (known.length >= 8 && (norm.includes(known) || known.includes(norm))) return false;
  }
  return true;
}

// ─── sesiones de viaje (seguimiento por chat_id, tabla messages) ─────────────

const SESSION_GAP_MS = 4 * 60 * 60 * 1000;

const BOT_PHASE_RULES = [
  { phase: 'confirmacion_cancelacion', match: /respond[eé].*\b(s[ií]|no)\b.*cancel/i },
  { phase: 'solicitud_cancelacion', match: /cancel(ar|á|emos)?\s+el\s+viaje|confirmar la cancelaci[oó]n/i },
  { phase: 'viaje_cancelado', match: /viaje.*cancel|se cancel[oó]|qued[oó] cancelado/i },
  { phase: 'viaje_completado', match: /viaje.*complet|llegaste|gracias por viajar/i },
  { phase: 'chofer_asignado', match: /asign[eé].*m[oó]vil|en camino a buscarte|chofer:/i },
  { phase: 'viaje_en_curso', match: /viaje sigue en curso|ya ten[eé]s un m[oó]vil asignado/i },
  { phase: 'consulta_duplicado', match: /otro pedido|evitar duplicados|revisa una persona/i },
  { phase: 'buscando_chofer', match: /esperando.*chofer|pedido est[aá] tomado|buscando.*m[oó]vil/i },
  { phase: 'confirmacion_precio', match: /cu[aá]nto sale|precio|tarifa|confirm[aá]s el viaje/i },
  { phase: 'poll_direccion', match: /eleg[ií]|encuesta|ninguna de estas|opciones/i },
  { phase: 'esperando_gps', match: /ubicaci[oó]n|compart[ií].*gps|pin de ubicaci/i },
  { phase: 'esperando_altura', match: /altura|n[uú]mero de (?:la )?calle|nro de calle/i },
  { phase: 'pregunta_destino', match: /a d[oó]nde te llevo|pasame el destino/i },
  { phase: 'reserva_programada', match: /reserv|programad|ma[nñ]ana a las/i },
  { phase: 'pedido_recibido', match: /tomamos tu pedido|pedido recibido|coordinando/i },
];

function parseTs(value) {
  const t = Date.parse(String(value || ''));
  return Number.isFinite(t) ? t : 0;
}

function inferBotPhase(botText) {
  const text = String(botText || '');
  if (!text.trim()) return 'desconocido';
  for (const rule of BOT_PHASE_RULES) {
    if (rule.match.test(text)) return rule.phase;
  }
  return 'mensaje_bot';
}

function isSessionStarter(msg) {
  if (msg.direction !== 'incoming') return false;
  const { category } = classifyIncomingMessage(msg);
  if (category === 'trip_request' || category === 'schedule_trip') return true;
  if (looksLikeTripRequest(msg.content)) return true;
  return false;
}

function isSessionCloser(msg) {
  if (msg.direction !== 'outgoing') return false;
  const phase = inferBotPhase(msg.content);
  return ['viaje_cancelado', 'viaje_completado'].includes(phase);
}

function isFollowUpIncoming(msg, openingId) {
  if (msg.direction !== 'incoming') return false;
  if (msg.id === openingId) return false;
  const { category } = classifyIncomingMessage(msg);
  if (category === 'trip_request' && looksLikeTripRequest(msg.content)) return false;
  return true;
}

function summarizeBotSnippet(text, max = 120) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function buildTripSessionsForChat(chatMeta, rawMessages) {
  const sorted = [...rawMessages].sort(
    (a, b) => parseTs(a.message_timestamp) - parseTs(b.message_timestamp)
  );

  const sessions = [];
  let current = null;
  let lastBotPhase = 'inicio';
  let lastBotSnippet = null;

  const closeSession = (reason) => {
    if (!current) return;
    current.closedAt = current.messages.at(-1)?.message_timestamp || current.openedAt;
    current.closeReason = reason;
    sessions.push(current);
    current = null;
    lastBotPhase = 'inicio';
    lastBotSnippet = null;
  };

  for (const msg of sorted) {
    const ts = parseTs(msg.message_timestamp);
    const incomingClass =
      msg.direction === 'incoming' ? classifyIncomingMessage(msg) : { category: 'outgoing', intentHint: null };

    if (current && ts - parseTs(current.lastActivityAt) > SESSION_GAP_MS) {
      closeSession('gap_timeout');
    }

    if (!current && isSessionStarter(msg)) {
      current = {
        sessionIndex: sessions.length + 1,
        chatId: chatMeta.id,
        telefono: chatMeta.telefono || null,
        contactName: chatMeta.contact_name || null,
        openedAt: msg.message_timestamp,
        closedAt: null,
        closeReason: null,
        openingMessage: {
          id: msg.id,
          content: msg.content,
          type: msg.type,
          timestamp: msg.message_timestamp,
          category: incomingClass.category,
        },
        lastActivityAt: msg.message_timestamp,
        messages: [],
        followUps: [],
        transcript: [],
      };
    } else if (current && isSessionStarter(msg)) {
      closeSession('nuevo_pedido');
      current = {
        sessionIndex: sessions.length + 1,
        chatId: chatMeta.id,
        telefono: chatMeta.telefono || null,
        contactName: chatMeta.contact_name || null,
        openedAt: msg.message_timestamp,
        closedAt: null,
        closeReason: null,
        openingMessage: {
          id: msg.id,
          content: msg.content,
          type: msg.type,
          timestamp: msg.message_timestamp,
          category: incomingClass.category,
        },
        lastActivityAt: msg.message_timestamp,
        messages: [],
        followUps: [],
        transcript: [],
      };
    }

    if (!current) continue;

    if (msg.direction === 'outgoing') {
      lastBotPhase = inferBotPhase(msg.content);
      lastBotSnippet = summarizeBotSnippet(msg.content);
    }

    const entry = {
      id: msg.id,
      direction: msg.direction,
      type: msg.type,
      content: msg.content,
      timestamp: msg.message_timestamp,
      category: incomingClass.category,
      intentHint: incomingClass.intentHint,
      botPhaseBefore: msg.direction === 'incoming' ? lastBotPhase : null,
      botSnippetBefore: msg.direction === 'incoming' ? lastBotSnippet : null,
    };

    current.messages.push(entry);
    current.transcript.push(entry);
    current.lastActivityAt = msg.message_timestamp;

    if (isFollowUpIncoming(msg, current.openingMessage.id)) {
      current.followUps.push({
        id: msg.id,
        content: msg.content,
        type: msg.type,
        timestamp: msg.message_timestamp,
        category: incomingClass.category,
        intentHint: incomingClass.intentHint,
        duringPhase: lastBotPhase,
        botSnippetBefore: lastBotSnippet,
      });
    }

    if (isSessionCloser(msg)) {
      closeSession('cierre_bot');
    }
  }

  if (current) closeSession('fin_chat');

  return sessions;
}

function buildAllTripSessions(chats, messages) {
  const byChat = new Map();
  for (const msg of messages) {
    if (!msg.chat_id) continue;
    if (!byChat.has(msg.chat_id)) byChat.set(msg.chat_id, []);
    byChat.get(msg.chat_id).push(msg);
  }

  const chatById = new Map(chats.map((c) => [c.id, c]));
  const allSessions = [];

  for (const [chatId, chatMessages] of byChat) {
    const chatMeta = chatById.get(chatId) || { id: chatId };
    const sessions = buildTripSessionsForChat(chatMeta, chatMessages);
    allSessions.push(...sessions);
  }

  return allSessions.sort((a, b) => parseTs(a.openedAt) - parseTs(b.openedAt));
}

function aggregateFollowUpsByPhase(sessions) {
  const byPhase = {};
  const byCategory = {};
  const specialPhrases = [];

  for (const session of sessions) {
    for (const fu of session.followUps) {
      const phase = fu.duringPhase || 'desconocido';
      const cat = fu.category || 'other';
      const phrase = String(fu.content || '').trim();
      if (!phrase) continue;

      if (!byPhase[phase]) byPhase[phase] = [];
      if (!byPhase[phase].includes(phrase)) byPhase[phase].push(phrase);

      if (!byCategory[cat]) byCategory[cat] = [];
      if (!byCategory[cat].includes(phrase)) byCategory[cat].push(phrase);

      if (['cancel_trip', 'status_query', 'conversational_other', 'acknowledgment'].includes(cat)) {
        specialPhrases.push({
          phrase,
          category: cat,
          phase,
          opening: session.openingMessage?.content,
          chatId: session.chatId,
        });
      }
    }
  }

  for (const key of Object.keys(byPhase)) {
    byPhase[key].sort((a, b) => a.localeCompare(b, 'es'));
  }
  for (const key of Object.keys(byCategory)) {
    byCategory[key].sort((a, b) => a.localeCompare(b, 'es'));
  }

  return { byPhase, byCategory, specialPhrases };
}

function formatTripSessionsTxt(sessions) {
  const lines = [
    '═══════════════════════════════════════════════════════',
    ' SEGUIMIENTO POR PEDIDO DE VIAJE (tabla messages)',
    '═══════════════════════════════════════════════════════',
    '',
  ];

  for (const s of sessions) {
    lines.push(`─── Chat ${s.chatId} · sesión ${s.sessionIndex} · ${s.openedAt || '?'} ───`);
    lines.push(`Pedido: ${s.openingMessage?.content || '(sin texto)'}`);
    lines.push('');

    if (s.followUps.length === 0) {
      lines.push('  (sin mensajes de seguimiento del pasajero)');
    } else {
      lines.push('  Seguimiento del pasajero:');
      for (const fu of s.followUps) {
        lines.push(`    [${fu.duringPhase}] (${fu.category}) ${fu.content}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── escritura de salida ─────────────────────────────────────────────────────

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function formatTxtSection(title, lines) {
  const unique = [...new Set(lines.map((l) => l.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es')
  );
  return [
    '═'.repeat(55),
    ` ${title}`,
    '═'.repeat(55),
    '',
    ...unique,
    '',
  ].join('\n');
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  const supabase = createSupabaseClient();
  const url =
    process.env.KNOWLEDGE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  let sourceKey = opts.source;
  if (sourceKey === 'auto') {
    sourceKey = await detectSource(supabase);
    console.log(`Fuente detectada: ${sourceKey}`);
  }

  const sourceConfig = SOURCES[sourceKey];
  if (!sourceConfig) {
    console.error(`Fuente desconocida: ${sourceKey}`);
    process.exit(1);
  }

  console.log(`Supabase: ${url}`);
  console.log(`Tablas: ${sourceConfig.chatsTable} + ${sourceConfig.messagesTable}`);
  if (sourceKey === 'legacy') console.log(`Propietario: ${CHAT_OWNER}`);
  console.log('Cargando chats...');

  let chatsRaw = await fetchAllRows(supabase, sourceConfig.chatsTable, (q) =>
    sourceConfig.filterChats(q).order('updated_at', { ascending: false })
  );

  if (opts.limitChats && Number.isFinite(opts.limitChats)) {
    chatsRaw = chatsRaw.slice(0, opts.limitChats);
  }

  const chats = chatsRaw.map(sourceConfig.mapChat);
  const chatIds = chats.map((c) => c.id).filter(Boolean);
  const sinceIso = opts.since ? `${opts.since}T00:00:00.000Z` : null;

  console.log(`Chats: ${chats.length}. Cargando mensajes...`);

  const messagesRaw = await fetchMessagesForChats(supabase, sourceConfig, chatIds, sinceIso);
  const messages = messagesRaw.map(sourceConfig.mapMessage);
  console.log(`Mensajes: ${messages.length}`);

  const chatById = new Map(chats.map((c) => [c.id, c]));
  const testPhrases = loadTestPhrases();

  const byCategory = {};
  const tripPhrases = [];
  const novelTripPhrases = [];
  const knowledgeOutOfTrip = [];
  const examplesByCategory = {};

  for (const msg of messages) {
    const { category, intentHint } = classifyIncomingMessage(msg);
    byCategory[category] = (byCategory[category] || 0) + 1;

    if (!examplesByCategory[category]) examplesByCategory[category] = [];
    if (examplesByCategory[category].length < 15 && msg.content) {
      examplesByCategory[category].push(String(msg.content).slice(0, 200));
    }

    const chat = chatById.get(msg.chat_id);
    const row = {
      messageId: msg.id,
      chatId: msg.chat_id,
      telefono: chat?.telefono || null,
      contactName: chat?.contact_name || null,
      content: msg.content,
      type: msg.type,
      direction: msg.direction,
      timestamp: msg.message_timestamp || msg.created_at,
      category,
      intentHint,
    };

    if (msg.direction === 'incoming' && category === 'trip_request') {
      tripPhrases.push(msg.content);
      if (isNovelPhrase(msg.content, testPhrases)) {
        novelTripPhrases.push(msg.content);
      }
    }

    if (msg.direction !== 'incoming') continue;

    const knowledgeCategories = [
      'acknowledgment',
      'greeting',
      'reaction_emoji',
      'cancel_trip',
      'status_query',
      'price_inquiry',
    ];
    const includeConversational =
      category === 'conversational_other' && isTripContextualReply(msg.content);

    if (knowledgeCategories.includes(category) || includeConversational) {
      knowledgeOutOfTrip.push(row);
    }
  }

  console.log('Armando sesiones de viaje por chat_id...');
  const tripSessions = buildAllTripSessions(chats, messages);
  const followUpAgg = aggregateFollowUpsByPhase(tripSessions);
  const sessionsWithFollowUp = tripSessions.filter((s) => s.followUps.length > 0).length;
  const totalFollowUps = tripSessions.reduce((n, s) => n + s.followUps.length, 0);

  const stats = {
    exportedAt: new Date().toISOString(),
    source: sourceKey,
    supabaseUrl: url,
    owner: sourceKey === 'legacy' ? CHAT_OWNER : null,
    chatsCount: chats.length,
    messagesCount: messages.length,
    since: sinceIso,
    categories: byCategory,
    novelTripPhrasesCount: novelTripPhrases.length,
    testPhrasesKnown: testPhrases.size,
    tripSessionsCount: tripSessions.length,
    tripSessionsWithFollowUp: sessionsWithFollowUp,
    tripFollowUpMessagesCount: totalFollowUps,
  };

  console.log('\nResumen por categoría (entrantes clasificados):');
  for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }
  console.log(`\nFrases de viaje nuevas (no en test-viajes-whatsapp.txt): ${novelTripPhrases.length}`);
  console.log(`Sesiones de viaje: ${tripSessions.length} (${sessionsWithFollowUp} con seguimiento, ${totalFollowUps} mensajes)`);

  if (opts.dryRun) {
    console.log('\n(dry-run: no se escribieron archivos)');
    return;
  }

  ensureDir(opts.outDir);

  writeJson(path.join(opts.outDir, 'export-stats.json'), stats);
  writeJson(path.join(opts.outDir, 'chats-summary.json'), chats.map((c) => ({
    id: c.id,
    telefono: c.telefono,
    contact_name: c.contact_name,
    updated_at: c.updated_at,
    ultimo_mensaje_asistente: c.ultimo_mensaje_asistente,
  })));

  writeJson(path.join(opts.outDir, 'knowledge-out-of-trip.json'), knowledgeOutOfTrip);

  const knowledgeGrouped = {};
  for (const row of knowledgeOutOfTrip) {
    if (!knowledgeGrouped[row.category]) knowledgeGrouped[row.category] = [];
    const phrase = String(row.content || '').trim();
    if (!phrase) continue;
    if (!knowledgeGrouped[row.category].includes(phrase)) {
      knowledgeGrouped[row.category].push(phrase);
    }
  }
  writeJson(path.join(opts.outDir, 'knowledge-out-of-trip-by-category.json'), knowledgeGrouped);

  fs.writeFileSync(
    path.join(opts.outDir, 'trip-request-phrases.txt'),
    formatTxtSection('PEDIDOS DE VIAJE (todos, únicos)', tripPhrases),
    'utf8'
  );

  fs.writeFileSync(
    path.join(opts.outDir, 'novel-trip-phrases.txt'),
    formatTxtSection('PEDIDOS NUEVOS — no están en test-viajes-whatsapp.txt', novelTripPhrases),
    'utf8'
  );

  writeJson(
    path.join(opts.outDir, 'trip-sessions.json'),
    tripSessions.map((s) => ({
      sessionIndex: s.sessionIndex,
      chatId: s.chatId,
      telefono: s.telefono,
      contactName: s.contactName,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      closeReason: s.closeReason,
      openingMessage: s.openingMessage,
      followUpCount: s.followUps.length,
      followUps: s.followUps,
      transcript: s.transcript,
    }))
  );

  writeJson(path.join(opts.outDir, 'trip-followup-by-phase.json'), followUpAgg.byPhase);
  writeJson(path.join(opts.outDir, 'trip-followup-by-category.json'), followUpAgg.byCategory);
  writeJson(path.join(opts.outDir, 'trip-followup-special.json'), followUpAgg.specialPhrases);

  fs.writeFileSync(path.join(opts.outDir, 'trip-sessions.txt'), formatTripSessionsTxt(tripSessions), 'utf8');

  const followupTxtBlocks = Object.entries(followUpAgg.byPhase)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([phase, phrases]) => formatTxtSection(`SEGUIMIENTO — fase bot: ${phase}`, phrases));
  fs.writeFileSync(
    path.join(opts.outDir, 'trip-followup-phrases.txt'),
    followupTxtBlocks.join('\n'),
    'utf8'
  );

  const md = [
    '# Base de conocimiento WhatsApp — exportación automática',
    '',
    `Generado: ${stats.exportedAt}`,
    '',
    `| Métrica | Valor |`,
    `|---------|-------|`,
    `| Chats | ${stats.chatsCount} |`,
    `| Mensajes | ${stats.messagesCount} |`,
    `| Frases viaje nuevas vs test file | ${stats.novelTripPhrasesCount} |`,
    `| Sesiones de viaje (pedidos) | ${stats.tripSessionsCount} |`,
    `| Sesiones con seguimiento del pasajero | ${stats.tripSessionsWithFollowUp} |`,
    `| Mensajes de seguimiento | ${stats.tripFollowUpMessagesCount} |`,
    '',
    '## Archivos de seguimiento por pedido',
    '',
    '- `trip-sessions.json` — cada pedido con transcript y followUps',
    '- `trip-sessions.txt` — lectura humana por sesión',
    '- `trip-followup-by-phase.json` — frases del pasajero según fase del bot (cancelar, chofer asignado, etc.)',
    '- `trip-followup-by-category.json` — agrupado por tipo (cancel_trip, acknowledgment, …)',
    '- `trip-followup-phrases.txt` — listado por fase',
    '',
    '## Categorías',
    '',
    ...Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, n]) => `- **${cat}**: ${n}`),
    '',
    '## Ejemplos por categoría',
    '',
    ...Object.entries(examplesByCategory).flatMap(([cat, examples]) => [
      `### ${cat}`,
      '',
      ...examples.map((e) => `- "${e}"`),
      '',
    ]),
    '',
    '## Uso sugerido',
    '',
    '1. Revisar `novel-trip-phrases.txt` y agregar casos a `test-viajes-whatsapp.txt` o `ADDRESS_CASES.md`.',
    '2. Usar `trip-followup-by-phase.json` para saber qué responde el pasajero en cada etapa (ej. cancelación, chofer en camino).',
    '3. Re-ejecutar con `--source legacy` cuando tengas `KNOWLEDGE_SUPABASE_*` apuntando al proyecto con tabla `messages`.',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(opts.outDir, 'README.md'), md, 'utf8');

  console.log(`\nArchivos escritos en: ${opts.outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
