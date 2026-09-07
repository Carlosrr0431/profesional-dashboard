import {
  TARIFF_KEYS_BY_CHANNEL,
  commissionFromPrice,
  minutesToTimeInput,
  priceFromTariff,
} from './resolveTariff';

export const TARIFF_CHANNEL_META = {
  platform: {
    id: 'platform',
    title: 'Plataforma',
    hint: 'WhatsApp y viajes cargados desde el panel.',
    accent: '#0F172A',
  },
  passenger_app: {
    id: 'passenger_app',
    title: 'App pasajeros',
    hint: 'Pedidos desde la app nativa.',
    accent: '#4F46E5',
  },
  passenger_web: {
    id: 'passenger_web',
    title: 'Web pasajeros',
    hint: 'profesionalviajes.com.ar/pasajero',
    accent: '#0EA5E9',
  },
};

export function moneyAr(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`;
}

export function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export function emptyWindowDraft(perKm, base, commission) {
  return {
    id: '',
    startTime: '22:00',
    endTime: '06:00',
    perKm: String(Math.round(Number(perKm) || 0)),
    base: String(Math.round(Number(base) || 0)),
    commission: String(Math.round(Number(commission) || 0)),
  };
}

export function draftFromWindow(row) {
  return {
    id: row.id,
    startTime: minutesToTimeInput(row.start_minute),
    endTime: minutesToTimeInput(row.end_minute),
    perKm: String(Math.round(Number(row.per_km) || 0)),
    base: String(Math.round(Number(row.base) || 0)),
    commission: String(Math.round(Number(row.commission_percent) || 0)),
  };
}

export function windowTimelineSegments(window) {
  const start = Number(window?.start_minute);
  const end = Number(window?.end_minute);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return [];
  if (start < end) return [{ from: start, to: end }];
  return [
    { from: start, to: 1440 },
    { from: 0, to: end },
  ];
}

export function timelinePercent(minutes) {
  const n = ((Number(minutes) % 1440) + 1440) % 1440;
  return (n / 1440) * 100;
}

export function exampleTripBreakdown(tariff, km = 5) {
  const distance = Math.max(0, Number(km) || 0);
  const price = distance > 0 ? (priceFromTariff(tariff, distance) ?? 0) : 0;
  const commission = commissionFromPrice(price, tariff?.commissionPercent) ?? 0;
  return {
    distance,
    price,
    commission,
    driverKeeps: price - commission,
  };
}

export function settingsMapFromTariffDefaults(values = {}) {
  return {
    [TARIFF_KEYS_BY_CHANNEL.platform.perKm]: values.platformDefaultPerKm,
    [TARIFF_KEYS_BY_CHANNEL.platform.base]: values.platformDefaultBase,
    [TARIFF_KEYS_BY_CHANNEL.platform.commission]: values.platformDefaultCommission,
    [TARIFF_KEYS_BY_CHANNEL.passenger_app.perKm]: values.passengerAppTariffPerKm,
    [TARIFF_KEYS_BY_CHANNEL.passenger_app.base]: values.passengerAppTariffBase,
    [TARIFF_KEYS_BY_CHANNEL.passenger_app.commission]: values.passengerAppCommissionPercent,
    [TARIFF_KEYS_BY_CHANNEL.passenger_web.perKm]: values.passengerWebTariffPerKm,
    [TARIFF_KEYS_BY_CHANNEL.passenger_web.base]: values.passengerWebTariffBase,
    [TARIFF_KEYS_BY_CHANNEL.passenger_web.commission]: values.passengerWebCommissionPercent,
  };
}
