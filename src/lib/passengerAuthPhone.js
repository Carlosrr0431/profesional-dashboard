/**
 * Normalización de teléfonos para la app de pasajeros (AR).
 *
 * Formatos de entrada aceptados (ej. 3878630173):
 * - local 10 dígitos:           3878630173
 * - con 0 trunk:                03878630173
 * - con 9 móvil:                93878630173
 * - E.164 sin 9:                543878630173 / +54 387 863-0173
 * - E.164 con 9 (WhatsApp):     5493878630173 / +54 9 387 863-0173
 * - con 00:                     005493878630173
 *
 * Salidas canónicas:
 * - DB / sesiones:  54 + 10 dígitos locales   → 543878630173
 * - WhatsApp JID:   549 + 10 dígitos locales  → 5493878630173
 */

export function normalizePhoneDigits(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const localPart = raw.includes('@') ? raw.split('@')[0] : raw;
  let digits = localPart.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  return digits;
}

/**
 * Play pre-launch y bots mandan 1231231231 / 1111111111.
 * Enviar OTP a esos JIDs inexistentes es de las señales que Meta más penaliza.
 */
export function isImplausibleArMobileLocal(local) {
  const digits = String(local || '');
  if (!/^\d{10}$/.test(digits)) return true;
  if (/^(\d)\1{9}$/.test(digits)) return true;
  if (/^(\d{2})\1{4}$/.test(digits)) return true;
  if (/^(\d{3})\1{2}\d$/.test(digits)) return true;
  if (/^(0123456789|1234567890|0987654321|9876543210)$/.test(digits)) return true;
  if (new Set(digits).size <= 2) return true;
  return false;
}

/**
 * Saca el "15" de móvil que va después del código de área.
 * 11 (Buenos Aires), 351 (Córdoba) o 3541 (área de 4) quedan en 10 dígitos.
 * No toca un número que ya tiene 10: 3515123456 es área 351, no un 15.
 */
export function stripArMobile15(digits) {
  const value = String(digits || '');
  if (value.length <= 10) return value;
  for (const len of [4, 3, 2]) {
    if (value.length < len + 2) continue;
    if (len === 2 && value.slice(0, 2) !== '11') continue;
    if (value.slice(len, len + 2) !== '15') continue;
    const local = `${value.slice(0, len)}${value.slice(len + 2)}`;
    if (local.length === 10) return local;
  }
  return value;
}

/** Área argentina: 11, o un código que empieza con 2 o 3. Cualquier provincia. */
export function isAcceptableArLocal(local) {
  if (!/^\d{10}$/.test(local)) return false;
  if (local.startsWith('54') || local.startsWith('9')) return false;
  const okArea = local.startsWith('11') || local.startsWith('2') || local.startsWith('3');
  if (!okArea) return false;
  if (isImplausibleArMobileLocal(local)) return false;
  return true;
}

/**
 * Extrae los 10 dígitos locales del móvil AR (área + número), de cualquier provincia.
 * Devuelve '' si no se puede resolver con confianza.
 */
export function extractLocalArMobileDigits(value) {
  let digits = normalizePhoneDigits(value);
  if (!digits) return '';

  while (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  let national = '';

  if (digits.startsWith('549')) {
    // 549 + 10 locales = 13. Menos = internacional incompleto (no tragar el 9).
    if (digits.length < 13) return '';
    national = digits.slice(3);
  } else if (digits.startsWith('54')) {
    // 54 + 10 locales = 12, o 54 + 9 + 10 = 13.
    if (digits.length < 12) return '';
    national = digits.slice(2);
    if (national.startsWith('9') && national.length >= 11) {
      national = national.slice(1);
    }
  } else if (digits.startsWith('9') && digits.length >= 11 && digits.length <= 15) {
    national = digits.slice(1);
  } else {
    national = digits;
  }

  national = stripArMobile15(national);
  if (!isAcceptableArLocal(national)) return '';
  return national;
}

/** Canónico para DB / OTP / sesiones: 54 + 10 locales. */
export function normalizePassengerPhoneForDb(value) {
  const local = extractLocalArMobileDigits(value);
  return local ? `54${local}` : '';
}

/** Canónico para WhatsApp: 549 + 10 locales. */
export function normalizePhoneForWhatsApp(phone) {
  const local = extractLocalArMobileDigits(phone);
  return local ? `549${local}` : '';
}

export function toWhatsAppJid(phone) {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized || normalized.length !== 13) return null;
  return `${normalized}@s.whatsapp.net`;
}

export function maskPhone(phone) {
  const normalized = normalizePhoneDigits(phone) || extractLocalArMobileDigits(phone);
  if (!normalized) return '****';
  if (normalized.length <= 4) return normalized;
  return `${'*'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
}
