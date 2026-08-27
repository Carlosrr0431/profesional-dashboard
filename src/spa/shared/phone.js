/**
 * Normalización de teléfonos AR — misma lógica que passenger-app.
 * Canónico: 54 + 10 dígitos (ej. 543871234567).
 */

export function extractLocalArMobileDigits(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  while (digits.startsWith('0')) digits = digits.slice(1);

  let local = '';
  if (digits.startsWith('549')) {
    if (digits.length < 13) return '';
    local = digits.slice(3);
  } else if (digits.startsWith('54')) {
    if (digits.length < 12) return '';
    let rest = digits.slice(2);
    if (rest.startsWith('9') && rest.length >= 11) rest = rest.slice(1);
    local = rest;
  } else if (digits.startsWith('9') && digits.length === 11) {
    local = digits.slice(1);
  } else if (digits.length === 10) {
    local = digits;
  } else {
    return '';
  }

  if (/^\d{3}15\d{6,}$/.test(local)) {
    local = `${local.slice(0, 3)}${local.slice(5)}`;
  }

  local = local.slice(0, 10);
  if (!/^\d{10}$/.test(local)) return '';
  if (local.startsWith('54')) return '';
  if (local.startsWith('9') || local.startsWith('59')) return '';
  return local;
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
