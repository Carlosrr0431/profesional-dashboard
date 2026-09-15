/**
 * Parseo, normalización y armado de difusión masiva (SMS + WhatsApp).
 * SMSGate no envía MMS: la foto va como link. WhatsApp sí manda la imagen.
 */

import { extractLocalArMobileDigits } from './passengerAuthPhone';

export const BULK_CHANNEL_SMS = 'sms';
export const BULK_CHANNEL_WHATSAPP = 'whatsapp';

export const SMS_BULK_MAX_RECIPIENTS = 300;
export const SMS_BULK_MAX_BODY = 480;
export const SMS_BULK_COOLDOWN_HOURS = 24;
export const SMS_BULK_INTERVAL_MS = 12_000;
export const SMS_BULK_MAX_PER_TICK = 5;

export const WHATSAPP_BULK_MAX_RECIPIENTS = 150;
export const WHATSAPP_BULK_MAX_BODY = 1000;
export const WHATSAPP_BULK_INTERVAL_MS = 30_000;
export const WHATSAPP_BULK_MAX_PER_TICK = 2;

export const SMS_ART_TIMEZONE = 'America/Argentina/Buenos_Aires';
export const SMS_QUIET_START_HOUR = 21;
export const SMS_QUIET_END_HOUR = 9;

export function normalizeBulkChannel(value) {
  return String(value || '').trim().toLowerCase() === BULK_CHANNEL_WHATSAPP
    ? BULK_CHANNEL_WHATSAPP
    : BULK_CHANNEL_SMS;
}

export function bulkMaxRecipients(channel) {
  return normalizeBulkChannel(channel) === BULK_CHANNEL_WHATSAPP
    ? WHATSAPP_BULK_MAX_RECIPIENTS
    : SMS_BULK_MAX_RECIPIENTS;
}

export function bulkMaxBody(channel) {
  return normalizeBulkChannel(channel) === BULK_CHANNEL_WHATSAPP
    ? WHATSAPP_BULK_MAX_BODY
    : SMS_BULK_MAX_BODY;
}

export function bulkIntervalMs(channel) {
  return normalizeBulkChannel(channel) === BULK_CHANNEL_WHATSAPP
    ? WHATSAPP_BULK_INTERVAL_MS
    : SMS_BULK_INTERVAL_MS;
}

export function splitPhoneList(raw) {
  const chunks = String(raw || '')
    .split(/[\n\r,;|\t]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const tokens = [];
  for (const chunk of chunks) {
    const parts = chunk.split(/\s+/).filter(Boolean);
    const digitLens = parts.map((part) => part.replace(/\D/g, '').length);
    const compactList = parts.length > 1 && digitLens.every((len) => len >= 8 && len <= 13);
    if (compactList) {
      tokens.push(...parts);
      continue;
    }
    tokens.push(chunk);
  }
  return tokens;
}

export function parseBulkSmsRecipients(raw) {
  const tokens = splitPhoneList(raw);
  const valid = [];
  const invalid = [];
  const duplicates = [];
  const seen = new Set();

  for (const token of tokens) {
    const local = extractLocalArMobileDigits(token);
    if (!local) {
      invalid.push({ raw: token, reason: 'invalid' });
      continue;
    }
    if (seen.has(local)) {
      duplicates.push({ raw: token, local });
      continue;
    }
    seen.add(local);
    valid.push({ raw: token, local });
  }

  return { tokens: tokens.length, valid, invalid, duplicates };
}

export function normalizeHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^(www\.)?[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(raw)) {
    return `https://${raw.replace(/^https?:\/\//i, '')}`;
  }
  return '';
}

export function composeBulkSmsText({ body = '', link = '', imageUrl = '', channel = BULK_CHANNEL_SMS } = {}) {
  const text = String(body || '').trim();
  const url = normalizeHttpUrl(link);
  const image = normalizeHttpUrl(imageUrl);
  const parts = [];
  if (text) parts.push(text);
  if (url && !text.includes(url)) parts.push(url);
  const includeImageLink = normalizeBulkChannel(channel) === BULK_CHANNEL_SMS
    && image
    && image !== url
    && !text.includes(image);
  if (includeImageLink) {
    parts.push(`Foto: ${image}`);
  }
  return parts.join('\n').slice(0, bulkMaxBody(channel));
}

/** GSM-7 ≈ 160; con acentos (UCS-2) ≈ 70. */
export function smsSegmentCount(text) {
  const value = String(text || '');
  if (!value) return 0;
  const gsmSafe = /^[\x20-\x7E]*$/.test(value);
  if (gsmSafe) {
    if (value.length <= 160) return 1;
    return Math.ceil(value.length / 153);
  }
  if (value.length <= 70) return 1;
  return Math.ceil(value.length / 67);
}

export function estimateBulkSmsDurationMs(count, channel = BULK_CHANNEL_SMS) {
  const n = Math.max(0, Math.trunc(Number(count) || 0));
  if (n <= 1) return 0;
  return (n - 1) * bulkIntervalMs(channel);
}

function artParts(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: SMS_ART_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = {};
  for (const item of fmt.formatToParts(date)) {
    if (item.type !== 'literal') parts[item.type] = item.value;
  }
  return parts;
}

/** Argentina sin DST: ART = UTC-3. */
export function artWallTimeToUtc(year, month, day, hour, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute, 0));
}

export function isSmsQuietHours(date = new Date()) {
  const hour = Number(artParts(date).hour);
  return hour >= SMS_QUIET_START_HOUR || hour < SMS_QUIET_END_HOUR;
}

export function nextSmsSendWindow(date = new Date(), respectQuietHours = true) {
  const now = new Date(date.getTime());
  if (!respectQuietHours || !isSmsQuietHours(now)) return now;

  const parts = artParts(now);
  let year = Number(parts.year);
  let month = Number(parts.month);
  let day = Number(parts.day);
  const hour = Number(parts.hour);

  if (hour >= SMS_QUIET_START_HOUR) {
    const tomorrow = new Date(Date.UTC(year, month - 1, day, 15, 0, 0) + 24 * 60 * 60 * 1000);
    const next = artParts(tomorrow);
    year = Number(next.year);
    month = Number(next.month);
    day = Number(next.day);
  }

  return artWallTimeToUtc(year, month, day, SMS_QUIET_END_HOUR, 0);
}

export function recipientReasonLabel(reason) {
  if (reason === 'invalid') return 'No es un celular argentino válido';
  if (reason === 'duplicate') return 'Repetido en la lista';
  if (reason === 'cooldown') return 'Ya recibió este mismo contenido en las últimas 24 h';
  if (reason === 'campaign_limit') return 'Supera el máximo de la campaña';
  return 'Omitido';
}

export function formatPhoneLocal(local) {
  const digits = String(local || '');
  if (digits.length !== 10) return digits;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
