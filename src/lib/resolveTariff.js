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

export function pickMatchingWindow(windows, channel, minute) {
  const matches = (windows || []).filter((window) => (
    window?.enabled !== false
    && window?.channel === channel
    && windowContainsMinute(window, minute)
  ));
  if (!matches.length) return null;
  matches.sort((a, b) => windowDurationMinutes(a) - windowDurationMinutes(b));
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
  const minute = artMinutesFromDate(at instanceof Date ? at : new Date(at));
  const match = pickMatchingWindow(windows, safeChannel, minute);
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
      .select('id, channel, start_minute, end_minute, per_km, base, commission_percent, enabled, created_at, updated_at')
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
