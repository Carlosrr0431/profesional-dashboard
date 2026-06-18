/**
 * Normaliza teléfonos igual que el dashboard (create-queued / WhatsApp).
 * Ej: 3871234567 → 543871234567
 */
export function normalizePassengerPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('54')) return digits;
  if (digits.startsWith('0')) return `54${digits.slice(1)}`;
  if (digits.length === 10) return `54${digits}`;
  return digits;
}

/** Variantes para consultar viajes guardados con distintos formatos históricos. */
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
