const MIN_AHEAD_MS = 30 * 60 * 1000;
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function pad(value) {
  return String(value).padStart(2, '0');
}

export function minScheduleDate(now = new Date()) {
  return new Date(now.getTime() + MIN_AHEAD_MS);
}

export function toDatetimeLocalValue(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseDatetimeLocalValue(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    0,
    0,
  );
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatScheduleDisplay(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return '—';
  const weekday = WEEKDAYS[date.getDay()];
  return `${weekday} ${pad(date.getDate())}/${pad(date.getMonth() + 1)} a las ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isScheduleValid(date, now = new Date()) {
  return date instanceof Date && Number.isFinite(date.getTime()) && date.getTime() >= minScheduleDate(now).getTime();
}
