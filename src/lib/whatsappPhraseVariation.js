/**
 * Reescribe cada texto saliente del chatbot con DeepSeek Pro.
 * El sentido queda igual; cambia la redacción para no repetir la misma frase.
 */
import {
  DEEPSEEK_PRO_MODEL,
  deepseekChatCompletion,
  isDeepSeekConfigured,
} from './deepseekClient';

const RECENT_LIMIT = 8;
const recentByPhone = new Map();

const SYSTEM_PROMPT = [
  'Reescribís mensajes de WhatsApp de un remis de Salta, Argentina.',
  'El mensaje nuevo tiene que decir exactamente lo mismo: misma pregunta, misma confirmación, mismos datos.',
  'Cambiá el orden y las palabras. No copies la frase original.',
  'Conservá tal cual precios, números, nombres, direcciones, horarios y links.',
  'Si hay texto entre asteriscos, dejá esas palabras y los asteriscos.',
  'Español rioplatense, breve, de chat. Sin comillas que envuelvan todo el mensaje.',
  'No agregues datos, ofertas ni despedidas nuevas.',
  'Respondé solo con el mensaje listo para enviar.',
].join(' ');

export function lockedFragments(text) {
  const raw = String(text || '');
  const found = [];
  const push = (value) => {
    const token = String(value || '').trim();
    if (token && !found.includes(token)) found.push(token);
  };
  for (const url of raw.match(/https?:\/\/\S+/g) || []) {
    push(url.replace(/[),.;]+$/g, ''));
  }
  for (const money of raw.match(/\$\s?[\d.]+(?:,\d+)?/g) || []) {
    push(money.replace(/\s/g, ''));
  }
  for (const bold of raw.match(/\*([^*]+)\*/g) || []) {
    push(bold.slice(1, -1).trim());
  }
  for (const num of raw.match(/\d+(?:[.,]\d+)?/g) || []) {
    push(num);
  }
  return found;
}

export function phraseKeepsFacts(source, variant) {
  const original = String(source || '').trim();
  const out = String(variant || '').trim();
  if (!original || !out) return false;
  if (out.length > original.length * 2 + 80) return false;
  if (original.includes('?') && !out.includes('?')) return false;
  return lockedFragments(original).every((token) => out.includes(token));
}

function normalizePhrase(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function cleanModelText(text) {
  let out = String(text || '').trim();
  out = out.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
  if (
    (out.startsWith('"') && out.endsWith('"'))
    || (out.startsWith('«') && out.endsWith('»'))
  ) {
    out = out.slice(1, -1).trim();
  }
  return out;
}

function rememberPhrase(phone, text) {
  const key = String(phone || '').replace(/\D/g, '') || 'anon';
  const list = recentByPhone.get(key) || [];
  list.push(normalizePhrase(text));
  recentByPhone.set(key, list.slice(-RECENT_LIMIT));
}

function recentPhrases(phone) {
  const key = String(phone || '').replace(/\D/g, '') || 'anon';
  return recentByPhone.get(key) || [];
}

export function resetWhatsappPhraseMemory() {
  recentByPhone.clear();
}

async function askDeepSeek(source, avoid) {
  const avoidBlock = avoid.length
    ? `\nNo uses estas redacciones:\n${avoid.map((line) => `- ${line}`).join('\n')}`
    : '';
  const { content } = await deepseekChatCompletion({
    systemPrompt: SYSTEM_PROMPT,
    userContent: `Mensaje original:\n${source}${avoidBlock}`,
    model: DEEPSEEK_PRO_MODEL,
    maxTokens: 280,
    reasoningEffort: 'none',
    purpose: 'whatsapp_phrase',
  });
  return cleanModelText(content);
}

export function isCannedWhatsappSpam(text) {
  const n = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (!n.trim()) return false;
  if (n.includes('http://') || n.includes('https://')) return false;
  const bare = n.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(buen dia|buenos dias|buenas tardes|buenas noches|hola|hola pasajero)$/.test(bare)) {
    return true;
  }
  return (
    n.includes('ya te mando el movil')
    || n.includes('tu pedido ya esta tomado')
    || n.includes('ya estas en la cola')
    || n.includes('soy betto')
    || n.includes('gracias por viajar')
    || n.includes('resumen de tu viaje')
    || n.includes('te mando un movil')
    || n.includes('excelente dia')
    || n.includes('ya tenes un movil asignado')
  );
}

export async function varyWhatsappPhrase(text, { phone = '', timeoutMs = 4000 } = {}) {
  const source = String(text || '').trim();
  if (!source || isCannedWhatsappSpam(source)) return '';
  if (/https?:\/\//i.test(source)) return source;
  if (source.length < 8 || !isDeepSeekConfigured()) return source;

  const avoid = [source, ...recentPhrases(phone)];
  const attempt = async () => {
    let timer;
    try {
      return await Promise.race([
        askDeepSeek(source, avoid.slice(0, 6)),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(''), timeoutMs);
        }),
      ]);
    } catch {
      return '';
    } finally {
      clearTimeout(timer);
    }
  };

  const variant = await attempt();
  if (!phraseKeepsFacts(source, variant)) return source;
  if (normalizePhrase(variant) === normalizePhrase(source)) return source;
  rememberPhrase(phone, variant);
  return variant;
}
