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
 * Extrae los 10 dígitos locales del móvil AR (área + número).
 * Devuelve '' si no se puede resolver con confianza.
 */
export function extractLocalArMobileDigits(value) {
  let digits = normalizePhoneDigits(value);
  if (!digits) return '';

  while (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  let local = '';

  if (digits.startsWith('549') && digits.length >= 13) {
    local = digits.slice(3);
  } else if (digits.startsWith('54') && digits.length >= 12) {
    let rest = digits.slice(2);
    // 54 + 9 + 10 locales (aunque no haya quedado pegado como "549...")
    if (rest.startsWith('9') && rest.length >= 11) {
      rest = rest.slice(1);
    }
    local = rest;
  } else if (digits.startsWith('9') && digits.length === 11) {
    local = digits.slice(1);
  } else if (digits.length === 10) {
    local = digits;
  } else {
    return '';
  }

  // Formato viejo con "15" tras el área (ej. 38715xxxxxx → 387xxxxxx)
  if (/^\d{3}15\d{6,}$/.test(local)) {
    local = `${local.slice(0, 3)}${local.slice(5)}`;
  }

  local = local.slice(0, 10);
  if (!/^\d{10}$/.test(local)) return '';
  return local;
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
