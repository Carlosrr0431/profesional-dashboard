const ART_TZ = 'America/Argentina/Buenos_Aires';

export const TARIFF_CHANNELS = ['platform', 'passenger_app', 'passenger_web'];

export const TARIFF_KEYS_BY_CHANNEL = {
  platform: {
    perKm: 'platform_tariff_per_km',
    base: 'platform_tariff_base',
    commission: 'platform_commission_percent',
  },
  passenger_app: {
    perKm: 'passenger_app_tariff_per_km',
    base: 'passenger_app_tariff_base',
    commission: 'passenger_app_commission_percent',
  },
  passenger_web: {
    perKm: 'passenger_web_tariff_per_km',
    base: 'passenger_web_tariff_base',
    commission: 'passenger_web_commission_percent',
  },
};

export function channelFromTripSource(source) {
  if (source === 'passenger_web') return 'passenger_web';
  if (source === 'passenger_app') return 'passenger_app';
  return 'platform';
}

export function parseTariffNumber(raw, fallback = 0) {
  const parsed = Number(String(raw ?? '').replace(',', '.').replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

export function parseTimeToMinutes(value) {
  if (Number.isFinite(Number(value)) && String(value).trim() !== '' && !String(value).includes(':')) {
    const n = Math.round(Number(value));
    if (n >= 0 && n < 1440) return n;
  }
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function minutesToTimeInput(minutes) {
  const n = ((Number(minutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(n / 60);
  const minute = n % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function artMinutesFromDate(date = new Date()) {
  const hourText = new Intl.DateTimeFormat('en-GB', {
    timeZone: ART_TZ,
    hour: '2-digit',
    hour12: false,
  }).format(date);
  const minuteText = new Intl.DateTimeFormat('en-GB', {
    timeZone: ART_TZ,
    minute: '2-digit',
  }).format(date);
  const hour = Number(hourText) % 24;
  const minute = Number(minuteText);
  return hour * 60 + (Number.isFinite(minute) ? minute : 0);
}

export function windowContainsMinute(window, minute) {
  const start = Number(window?.start_minute);
  const end = Number(window?.end_minute);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return false;
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

export function windowDurationMinutes(window) {
  const start = Number(window?.start_minute);
  const end = Number(window?.end_minute);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return 1440;
  if (start < end) return end - start;
  return (1440 - start) + end;
}

export const SCHEDULE_KINDS = ['always', 'weekdays', 'date'];

const WEEKDAY_FROM_SHORT = {
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
};

export function normalizeScheduleKind(raw) {
  const value = String(raw || 'always').trim().toLowerCase();
  return SCHEDULE_KINDS.includes(value) ? value : 'always';
}

export function normalizeWeekdays(raw) {
  const list = Array.isArray(raw)
    ? raw
    : String(raw || '').split(/[,\s]+/).filter(Boolean);
  const unique = new Set();
  list.forEach((item) => {
    const n = Number(item);
    if (Number.isInteger(n) && n >= 1 && n <= 7) unique.add(n);
  });
  return [...unique].sort((a, b) => a - b);
}

export function normalizeSpecificDate(raw) {
  const match = String(raw || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function scheduleRank(window) {
  const kind = normalizeScheduleKind(window?.schedule_kind);
  if (kind === 'date') return 3;
  if (kind === 'weekdays') return 2;
  return 1;
}

function artCalendarParts(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ART_TZ,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const bag = {};
  fmt.formatToParts(date).forEach((part) => {
    if (part.type !== 'literal') bag[part.type] = part.value;
  });
  const weekday = WEEKDAY_FROM_SHORT[String(bag.weekday || '').slice(0, 3).toLowerCase()] || 1;
  return {
    ymd: `${bag.year}-${String(bag.month).padStart(2, '0')}-${String(bag.day).padStart(2, '0')}`,
    weekday,
  };
}

export function artTimeContext(at = new Date()) {
  if (typeof at === 'number' && Number.isFinite(at)) {
    const minute = ((Math.round(at) % 1440) + 1440) % 1440;
    return {
      minute,
      ymd: null,
      weekday: null,
      prevYmd: null,
      prevWeekday: null,
      dateBound: false,
    };
  }

  const date = at instanceof Date ? at : new Date(at);
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  const today = artCalendarParts(safe);
  const prev = artCalendarParts(new Date(safe.getTime() - 24 * 60 * 60 * 1000));
  return {
    minute: artMinutesFromDate(safe),
    ymd: today.ymd,
    weekday: today.weekday,
    prevYmd: prev.ymd,
    prevWeekday: prev.weekday,
    dateBound: true,
  };
}

export function overnightUsesPreviousDay(window, minute) {
  const start = Number(window?.start_minute);
  const end = Number(window?.end_minute);
  return Number.isFinite(start) && Number.isFinite(end) && start > end && minute < end;
}

export function windowScheduleAppliesOnDay(window, ymd, weekday) {
  const kind = normalizeScheduleKind(window?.schedule_kind);
  if (kind === 'date') return normalizeSpecificDate(window?.specific_date) === ymd;
  if (kind === 'weekdays') return normalizeWeekdays(window?.weekdays).includes(Number(weekday));
  return true;
}

export function windowScheduleAppliesAt(window, ctx) {
  if (!windowContainsMinute(window, ctx.minute)) return false;
  const kind = normalizeScheduleKind(window?.schedule_kind);
  if (!ctx.dateBound) return kind === 'always';
  const usePrev = overnightUsesPreviousDay(window, ctx.minute);
  return windowScheduleAppliesOnDay(
    window,
    usePrev ? ctx.prevYmd : ctx.ymd,
    usePrev ? ctx.prevWeekday : ctx.weekday,
  );
}

export function pickMatchingWindow(windows, channel, at = new Date()) {
  const ctx = artTimeContext(at);
  const matches = (windows || []).filter((window) => (
    window?.enabled !== false
    && window?.channel === channel
    && windowScheduleAppliesAt(window, ctx)
  ));
  if (!matches.length) return null;
  matches.sort((a, b) => {
    const rankDiff = scheduleRank(b) - scheduleRank(a);
    if (rankDiff) return rankDiff;
    return windowDurationMinutes(a) - windowDurationMinutes(b);
  });
  return matches[0];
}

function hasSettingValue(settingsMap, key) {
  const raw = settingsMap?.[key];
  return raw != null && String(raw).trim() !== '';
}

export function defaultsFromSettings(settingsMap = {}, channel = 'platform') {
  const keys = TARIFF_KEYS_BY_CHANNEL[channel] || TARIFF_KEYS_BY_CHANNEL.platform;
  const missing = !hasSettingValue(settingsMap, keys.perKm)
    && !hasSettingValue(settingsMap, keys.base)
    && !hasSettingValue(settingsMap, keys.commission);

  if (channel === 'passenger_web' && missing) {
    return defaultsFromSettings(settingsMap, 'passenger_app');
  }

  return {
    perKm: parseTariffNumber(settingsMap[keys.perKm], 0),
    base: parseTariffNumber(settingsMap[keys.base], 0),
    commissionPercent: parseTariffNumber(settingsMap[keys.commission], 0),
  };
}

export function resolveChannelTariff({
  settingsMap = {},
  windows = [],
  channel = 'platform',
  at = new Date(),
} = {}) {
  const safeChannel = TARIFF_CHANNELS.includes(channel) ? channel : 'platform';
  const defaults = defaultsFromSettings(settingsMap, safeChannel);
  const match = pickMatchingWindow(windows, safeChannel, at);
  if (!match) {
    return { ...defaults, source: 'default', window: null };
  }
  return {
    perKm: parseTariffNumber(match.per_km, defaults.perKm),
    base: parseTariffNumber(match.base, defaults.base),
    commissionPercent: parseTariffNumber(match.commission_percent, defaults.commissionPercent),
    source: 'window',
    window: match,
  };
}

export function overlayResolvedTariffSettings(settingsMap = {}, windows = [], at = new Date()) {
  const next = { ...settingsMap };
  TARIFF_CHANNELS.forEach((channel) => {
    const keys = TARIFF_KEYS_BY_CHANNEL[channel];
    const resolved = resolveChannelTariff({ settingsMap, windows, channel, at });
    next[keys.perKm] = String(Math.round(resolved.perKm));
    next[keys.base] = String(Math.round(resolved.base));
    next[keys.commission] = String(Math.round(resolved.commissionPercent));
  });
  return next;
}

export function priceFromTariff(tariff, distanceKm) {
  const dist = Number(distanceKm);
  if (!Number.isFinite(dist) || dist <= 0) return null;
  return Math.round((Number(tariff?.base) || 0) + (Number(tariff?.perKm) || 0) * dist);
}

export function commissionFromPrice(price, commissionPercent) {
  if (!Number.isFinite(Number(price))) return null;
  return Math.round((Number(price) * (Number(commissionPercent) || 0)) / 100);
}

export async function fetchTariffWindows(supabase) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('tariff_windows')
      .select('*')
      .order('start_minute', { ascending: true });
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

export async function loadTariffContext(supabase) {
  const settingsMap = {};
  let windows = [];
  if (!supabase) return { settingsMap, windows };

  const [settingsResult, windowRows] = await Promise.all([
    supabase.from('settings').select('key, value'),
    fetchTariffWindows(supabase),
  ]);

  (settingsResult?.data || []).forEach((row) => {
    if (row?.key) settingsMap[row.key] = row.value;
  });
  windows = windowRows;
  return { settingsMap, windows };
}
