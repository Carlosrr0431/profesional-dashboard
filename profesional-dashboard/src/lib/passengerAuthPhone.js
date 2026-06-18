/**
 * Normalización de teléfonos para la app de pasajeros.
 * - DB / viajes: E.164 en dígitos (54 + número local de 10 dígitos).
 * - WhatsApp: heurística AR con prefijo 549 cuando corresponde.
 */

export function normalizePassengerPhoneForDb(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('54')) return digits;
  if (digits.startsWith('0')) return `54${digits.slice(1)}`;
  if (digits.length === 10) return `54${digits}`;
  return digits;
}

export function normalizePhoneDigits(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const localPart = raw.includes('@') ? raw.split('@')[0] : raw;
  let digits = localPart.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  return digits;
}

export function normalizePhoneForWhatsApp(phone) {
  let digits = normalizePassengerPhoneForDb(phone) || normalizePhoneDigits(phone);
  if (!digits) return '';

  if (digits.startsWith('0') && digits.length >= 11) {
    digits = digits.replace(/^0+/, '');
  }

  if (digits.startsWith('54') && !digits.startsWith('549') && digits.length >= 12 && digits.length <= 13) {
    digits = `549${digits.slice(2)}`;
  }

  if (digits.startsWith('54938715') && digits.length >= 14) {
    digits = `549387${digits.slice(8)}`;
  }

  return digits;
}

export function toWhatsAppJid(phone) {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized || normalized.length < 10) return null;
  return `${normalized}@s.whatsapp.net`;
}

export function maskPhone(phone) {
  const normalized = normalizePhoneDigits(phone);
  if (!normalized) return '****';
  if (normalized.length <= 4) return normalized;
  return `${'*'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
}
