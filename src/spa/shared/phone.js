/**
 * Normalización de teléfonos AR — misma lógica que passenger-app.
 * Canónico: 54 + 10 dígitos (ej. 543871234567).
 */

function isImplausibleArMobileLocal(local) {
  const digits = String(local || '');
  if (!/^\d{10}$/.test(digits)) return true;
  if (/^(\d)\1{9}$/.test(digits)) return true;
  if (/^(\d{2})\1{4}$/.test(digits)) return true;
  if (/^(\d{3})\1{2}\d$/.test(digits)) return true;
  if (/^(0123456789|1234567890|0987654321|9876543210)$/.test(digits)) return true;
  if (new Set(digits).size <= 2) return true;
  return false;
}

function stripArMobile15(digits) {
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

export function extractLocalArMobileDigits(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  while (digits.startsWith('0')) digits = digits.slice(1);

  let national = '';
  if (digits.startsWith('549')) {
    if (digits.length < 13) return '';
    national = digits.slice(3);
  } else if (digits.startsWith('54')) {
    if (digits.length < 12) return '';
    national = digits.slice(2);
    if (national.startsWith('9') && national.length >= 11) national = national.slice(1);
  } else if (digits.startsWith('9') && digits.length >= 11 && digits.length <= 15) {
    national = digits.slice(1);
  } else {
    national = digits;
  }

  national = stripArMobile15(national);
  if (!/^\d{10}$/.test(national)) return '';
  if (national.startsWith('54') || national.startsWith('9')) return '';
  if (!(national.startsWith('11') || national.startsWith('2') || national.startsWith('3'))) return '';
  if (isImplausibleArMobileLocal(national)) return '';
  return national;
}

export function normalizePassengerPhone(phone) {
  const local = extractLocalArMobileDigits(phone);
  return local ? `54${local}` : '';
}

export function getPassengerPhoneVariants(phone) {
  const canonical = normalizePassengerPhone(phone);
  const raw = String(phone || '').replace(/\D/g, '');
  if (!canonical && !raw) return [];

  const variants = new Set([canonical, raw].filter(Boolean));

  if (canonical.startsWith('54')) {
    variants.add(canonical.slice(2));
  }
  if (canonical.startsWith('54') && !canonical.startsWith('549') && canonical.length === 12) {
    variants.add(`549${canonical.slice(2)}`);
  }
  if (canonical.startsWith('549')) {
    variants.add(`54${canonical.slice(3)}`);
  }

  return [...variants].filter(Boolean);
}

export function normalizeDriverPhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) digits = digits.slice(1);

  const ensureArgentinaMobile = (withCountryCode) => {
    const rest = withCountryCode.slice(2);
    if (rest.length === 11 && rest.startsWith('9')) return `54${rest}`;
    if (rest.length === 10) return `549${rest}`;
    return withCountryCode;
  };

  if (digits.startsWith('54')) return ensureArgentinaMobile(digits);
  if (digits.length === 11 && digits.startsWith('9')) return `54${digits}`;
  if (digits.length === 10) return `549${digits}`;
  if (digits.length < 10) return ensureArgentinaMobile(`54${digits}`);
  return digits;
}

export function formatPhoneDisplay(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('54') && digits.length >= 12) {
    return `+${digits.slice(0, 2)} ${digits.slice(2)}`;
  }
  if (digits.length === 10) return `+54 ${digits}`;
  return phone || '';
}
