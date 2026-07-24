import {
  extractLocalArMobileDigits,
  normalizePassengerPhoneForDb,
} from './passengerAuthPhone';

export const TRIP_CHAT_ACTIVE_STATUSES = ['accepted', 'going_to_pickup', 'in_progress'];
export const TRIP_CHAT_READABLE_STATUSES = [
  ...TRIP_CHAT_ACTIVE_STATUSES,
  'completed',
];

export const TRIP_CHAT_MAX_TEXT_LENGTH = 500;
export const TRIP_CHAT_MAX_AUDIO_SECONDS = 60;

export function passengerPhoneVariants(rawPhone) {
  const canonical = normalizePassengerPhoneForDb(rawPhone);
  const rawDigits = String(rawPhone || '').replace(/\D/g, '');
  const local = extractLocalArMobileDigits(rawPhone);
  const variants = new Set([canonical, rawDigits, local].filter(Boolean));
  if (canonical?.startsWith('54') && canonical.length === 12) {
    variants.add(`549${canonical.slice(2)}`);
    variants.add(canonical.slice(2));
  }
  if (rawDigits.startsWith('549') && rawDigits.length >= 13) {
    variants.add(`54${rawDigits.slice(3)}`);
    variants.add(rawDigits.slice(3));
  }
  return [...variants].filter(Boolean);
}

export function phonesMatchTrip(tripPhone, sessionPhone) {
  const tripLocal = extractLocalArMobileDigits(tripPhone);
  const sessionLocal = extractLocalArMobileDigits(sessionPhone);
  if (tripLocal && sessionLocal && tripLocal === sessionLocal) return true;

  const tripVariants = new Set(passengerPhoneVariants(tripPhone));
  const sessionVariants = passengerPhoneVariants(sessionPhone);
  if (sessionVariants.some((v) => tripVariants.has(v))) return true;

  // Último recurso: últimos 10 dígitos crudos.
  const tripDigits = String(tripPhone || '').replace(/\D/g, '');
  const sessionDigits = String(sessionPhone || '').replace(/\D/g, '');
  if (tripDigits.length >= 10 && sessionDigits.length >= 10) {
    return tripDigits.slice(-10) === sessionDigits.slice(-10);
  }
  return false;
}

export function sanitizeChatText(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.slice(0, TRIP_CHAT_MAX_TEXT_LENGTH);
}

export function isTripChatWritable(status) {
  return TRIP_CHAT_ACTIVE_STATUSES.includes(String(status || '').toLowerCase());
}

export function isTripChatReadable(status) {
  return TRIP_CHAT_READABLE_STATUSES.includes(String(status || '').toLowerCase());
}
