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

export function resolvePassengerTariff(settingsMap = {}, { defaultPerKm = 1000, channel = 'passenger_web' } = {}) {
  const prefix = channel === 'passenger_app' ? 'passenger_app' : 'passenger_web';
  let perKm = parseSettingNumber(settingsMap[`${prefix}_tariff_per_km`]);
  let base = parseSettingNumber(settingsMap[`${prefix}_tariff_base`]);
  let commissionPercent = parseSettingNumber(settingsMap[`${prefix}_commission_percent`]);

  if (prefix === 'passenger_web' && perKm <= 0 && base <= 0) {
    perKm = parseSettingNumber(settingsMap.passenger_app_tariff_per_km);
    base = parseSettingNumber(settingsMap.passenger_app_tariff_base);
    commissionPercent = parseSettingNumber(settingsMap.passenger_app_commission_percent);
  }

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
