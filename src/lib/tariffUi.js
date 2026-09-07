import {
  TARIFF_KEYS_BY_CHANNEL,
  commissionFromPrice,
  minutesToTimeInput,
  normalizeScheduleKind,
  normalizeSpecificDate,
  normalizeWeekdays,
  priceFromTariff,
  scheduleRank,
  windowScheduleAppliesOnDay,
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

export const WEEKDAY_OPTIONS = [
  { id: 1, short: 'Lun', long: 'Lunes' },
  { id: 2, short: 'Mar', long: 'Martes' },
  { id: 3, short: 'Mié', long: 'Miércoles' },
  { id: 4, short: 'Jue', long: 'Jueves' },
  { id: 5, short: 'Vie', long: 'Viernes' },
  { id: 6, short: 'Sáb', long: 'Sábado' },
  { id: 7, short: 'Dom', long: 'Domingo' },
];

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function formatSpecificDate(ymd) {
  const normalized = normalizeSpecificDate(ymd);
  if (!normalized) return '';
  const [, year, month, day] = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
  if (!year) return normalized;
  return `${Number(day)} ${MONTHS_SHORT[Number(month) - 1]} ${year}`;
}

export function formatWeekdays(weekdays) {
  const ids = normalizeWeekdays(weekdays);
  if (!ids.length) return 'Días de la semana';
  if (ids.length === 7) return 'Todos los días';
  return ids
    .map((id) => WEEKDAY_OPTIONS.find((item) => item.id === id)?.short)
    .filter(Boolean)
    .join(' · ');
}

export function formatWindowHours(row) {
  if (!row) return '';
  return `${minutesToTimeInput(row.start_minute)}–${minutesToTimeInput(row.end_minute)}`;
}

export function formatWindowScheduleLabel(row) {
  const kind = normalizeScheduleKind(row?.schedule_kind);
  const name = String(row?.label || '').trim();
  if (kind === 'date') {
    const dateLabel = formatSpecificDate(row?.specific_date) || 'Día específico';
    return name ? `${dateLabel} · ${name}` : dateLabel;
  }
  if (kind === 'weekdays') {
    const days = formatWeekdays(row?.weekdays);
    return name ? `${days} · ${name}` : days;
  }
  return name || 'Todos los días';
}

export function windowSourceLabel(resolved) {
  if (resolved?.source !== 'window') return 'Tarifa por defecto';
  const kind = normalizeScheduleKind(resolved.window?.schedule_kind);
  if (kind === 'date') return 'Día específico vigente';
  if (kind === 'weekdays') return 'Franja recurrente vigente';
  return 'Franja horaria vigente';
}

export function sortTariffWindows(windows = []) {
  return windows.slice().sort((a, b) => {
    const rankDiff = scheduleRank(b) - scheduleRank(a);
    if (rankDiff) return rankDiff;
    return Number(a.start_minute) - Number(b.start_minute);
  });
}

export function windowSegmentsForCalendarDay(window, ctx) {
  if (!ctx?.dateBound) {
    return windowTimelineSegments(window);
  }
  const start = Number(window?.start_minute);
  const end = Number(window?.end_minute);
  const matchesToday = windowScheduleAppliesOnDay(window, ctx.ymd, ctx.weekday);
  const matchesYesterday = windowScheduleAppliesOnDay(window, ctx.prevYmd, ctx.prevWeekday);
  if (!(Number.isFinite(start) && Number.isFinite(end) && start > end)) {
    return matchesToday ? windowTimelineSegments(window) : [];
  }
  const segments = [];
  if (matchesToday) segments.push({ from: start, to: 1440 });
  if (matchesYesterday) segments.push({ from: 0, to: end });
  return segments;
}

export function emptyWindowDraft(perKm, base, commission) {
  return {
    id: '',
    startTime: '22:00',
    endTime: '06:00',
    perKm: String(Math.round(Number(perKm) || 0)),
    base: String(Math.round(Number(base) || 0)),
    commission: String(Math.round(Number(commission) || 0)),
    scheduleKind: 'always',
    weekdays: [],
    specificDate: '',
    label: '',
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
    scheduleKind: normalizeScheduleKind(row.schedule_kind),
    weekdays: normalizeWeekdays(row.weekdays),
    specificDate: normalizeSpecificDate(row.specific_date) || '',
    label: String(row.label || ''),
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
