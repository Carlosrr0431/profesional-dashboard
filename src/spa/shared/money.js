const arsFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

export function formatArs(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  return arsFormatter.format(Math.round(value));
}

export function parseSettingNumber(rawValue) {
  const normalized = String(rawValue ?? '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resolvePassengerTariff(settingsMap = {}, { defaultPerKm = 1000 } = {}) {
  const perKm = parseSettingNumber(settingsMap.passenger_app_tariff_per_km);
  const base = parseSettingNumber(settingsMap.passenger_app_tariff_base) || 0;
  const commissionPercent = parseSettingNumber(settingsMap.passenger_app_commission_percent) || 0;
  return {
    base,
    perKm: perKm > 0 ? perKm : defaultPerKm,
    commissionPercent,
  };
}

export function calculateTripPrice({ base, perKm, distanceKm }) {
  const dist = Number(distanceKm);
  if (!Number.isFinite(dist) || dist <= 0) return null;
  return Math.round((Number(base) || 0) + (Number(perKm) || 0) * dist);
}
