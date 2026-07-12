const SALTA_TZ = 'America/Argentina/Salta';

const MONTH_NAMES_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

function getSaltaParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SALTA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday,
  };
}

const WEEKDAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function saltaDateAtMidnight(year, month, day) {
  return new Date(
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00-03:00`,
  );
}

export function toAnchorString(date = new Date()) {
  const { year, month, day } = getSaltaParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseAnchorString(anchorStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(anchorStr || '');
  if (!match) return getSaltaParts(new Date());
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function anchorToDate(anchorStr) {
  const { year, month, day } = parseAnchorString(anchorStr);
  return saltaDateAtMidnight(year, month, day);
}

export function getDaysInSaltaMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function formatWeekLabel(mondayDate, sundayDate) {
  const fmt = new Intl.DateTimeFormat('es-AR', {
    timeZone: SALTA_TZ,
    day: 'numeric',
    month: 'short',
  });
  return `${fmt.format(mondayDate)} – ${fmt.format(sundayDate)}`;
}

function formatMonthLabel(year, month) {
  const d = saltaDateAtMidnight(year, month, 1);
  const label = new Intl.DateTimeFormat('es-AR', {
    timeZone: SALTA_TZ,
    month: 'long',
    year: 'numeric',
  }).format(d);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function computeWeekMonday(anchorDate) {
  const { year, month, day, weekday } = getSaltaParts(anchorDate);
  const dayIndex = WEEKDAY_INDEX[weekday] ?? 0;
  return new Date(saltaDateAtMidnight(year, month, day).getTime() - dayIndex * 86400000);
}

function isCurrentWeek(anchorDate) {
  return computeWeekMonday(anchorDate).getTime() === computeWeekMonday(new Date()).getTime();
}

function isCurrentMonth(anchorDate) {
  const nowParts = getSaltaParts(new Date());
  const anchorParts = getSaltaParts(anchorDate);
  return nowParts.year === anchorParts.year && nowParts.month === anchorParts.month;
}

/** Semana calendario (lun–dom) que contiene anchorDate */
export function getWeekBoundsForAnchor(anchorDate, { capToNow = true } = {}) {
  const monday = computeWeekMonday(anchorDate);
  const sundayEnd = new Date(monday.getTime() + 7 * 86400000 - 1);

  let endIso = sundayEnd.toISOString();
  let label = isCurrentWeek(anchorDate) && capToNow
    ? 'Esta semana'
    : `Semana ${formatWeekLabel(monday, sundayEnd)}`;

  if (capToNow && sundayEnd.getTime() > Date.now()) {
    endIso = new Date().toISOString();
  }

  return { startIso: monday.toISOString(), endIso, label };
}

/** Mes calendario completo que contiene anchorDate */
export function getMonthBoundsForAnchor(anchorDate, { capToNow = true } = {}) {
  const { year, month } = getSaltaParts(anchorDate);
  const start = saltaDateAtMidnight(year, month, 1);
  const daysInMonth = getDaysInSaltaMonth(year, month);
  const endOfMonth = new Date(saltaDateAtMidnight(year, month, daysInMonth).getTime() + 86400000 - 1);

  let endIso = endOfMonth.toISOString();
  let label = isCurrentMonth(anchorDate) && capToNow
    ? 'Este mes'
    : formatMonthLabel(year, month);

  if (capToNow && endOfMonth.getTime() > Date.now()) {
    endIso = new Date().toISOString();
  }

  return { startIso: start.toISOString(), endIso, label };
}

/** @returns {{ startIso: string|null, endIso: string, label: string }} */
export function resolveCommissionPeriod(period, anchorDateStr) {
  if (period === 'all') {
    return { startIso: null, endIso: new Date().toISOString(), label: 'Todo el historial' };
  }

  const anchor = anchorDateStr ? anchorToDate(anchorDateStr) : new Date();
  if (period === 'week') return getWeekBoundsForAnchor(anchor);
  if (period === 'month') return getMonthBoundsForAnchor(anchor);

  return { startIso: null, endIso: new Date().toISOString(), label: 'Todo el historial' };
}

/** Compat: período relativo a “ahora” */
export function getCommissionPeriodBounds(period, referenceDate = new Date()) {
  return resolveCommissionPeriod(period, toAnchorString(referenceDate));
}

/**
 * Rango exclusivo [start, end) para el panel de Viajes (día / semana / mes) en hora Argentina.
 * @param {'day'|'week'|'month'} mode
 * @param {string} dateStr YYYY-MM-DD (ancla)
 */
export function resolveTripsViewRange(mode = 'day', dateStr) {
  const parts = parseAnchorString(dateStr || toAnchorString());
  const date = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  const anchor = saltaDateAtMidnight(parts.year, parts.month, parts.day);

  if (mode === 'week') {
    const monday = computeWeekMonday(anchor);
    const sunday = new Date(monday.getTime() + 6 * 86400000);
    const end = new Date(monday.getTime() + 7 * 86400000);
    return {
      mode: 'week',
      date,
      start: monday.toISOString(),
      end: end.toISOString(),
      label: `Semana ${formatWeekLabel(monday, sunday)}`,
    };
  }

  if (mode === 'month') {
    const start = saltaDateAtMidnight(parts.year, parts.month, 1);
    const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
    const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;
    const end = saltaDateAtMidnight(nextYear, nextMonth, 1);
    return {
      mode: 'month',
      date: `${parts.year}-${String(parts.month).padStart(2, '0')}-01`,
      start: start.toISOString(),
      end: end.toISOString(),
      label: formatMonthLabel(parts.year, parts.month),
    };
  }

  const start = saltaDateAtMidnight(parts.year, parts.month, parts.day);
  const end = new Date(start.getTime() + 86400000);
  const dayLabel = new Intl.DateTimeFormat('es-AR', {
    timeZone: SALTA_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(start);

  return {
    mode: 'day',
    date,
    start: start.toISOString(),
    end: end.toISOString(),
    label: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1),
  };
}

export function shiftTripsAnchor(mode, dateStr, delta) {
  const parts = parseAnchorString(dateStr || toAnchorString());
  const base = saltaDateAtMidnight(parts.year, parts.month, parts.day);

  if (mode === 'week') {
    const next = new Date(base.getTime() + delta * 7 * 86400000);
    return toAnchorString(next);
  }

  if (mode === 'month') {
    let month = parts.month + delta;
    let year = parts.year;
    while (month < 1) {
      month += 12;
      year -= 1;
    }
    while (month > 12) {
      month -= 12;
      year += 1;
    }
    return `${year}-${String(month).padStart(2, '0')}-01`;
  }

  const next = new Date(base.getTime() + delta * 86400000);
  return toAnchorString(next);
}

export function filterPaymentsByRange(payments, startIso, endIso) {
  const startMs = startIso ? new Date(startIso).getTime() : 0;
  const endMs = endIso ? new Date(endIso).getTime() : Infinity;
  return payments.filter((p) => {
    const t = new Date(p.created_at).getTime();
    return t >= startMs && t <= endMs;
  });
}

export function filterPaymentsByPeriod(payments, period, referenceDate = new Date(), anchorDateStr) {
  const anchor = anchorDateStr || toAnchorString(referenceDate);
  const { startIso, endIso } = resolveCommissionPeriod(period, anchor);
  if (!startIso) return payments;
  return filterPaymentsByRange(payments, startIso, endIso);
}

export function isDayInWeek(year, month, day, anchorDateStr) {
  const { startIso } = getWeekBoundsForAnchor(anchorToDate(anchorDateStr), { capToNow: false });
  const dayMs = saltaDateAtMidnight(year, month, day).getTime();
  const startMs = new Date(startIso).getTime();
  return dayMs >= startMs && dayMs < startMs + 7 * 86400000;
}

export function isMonthSelected(year, month, anchorDateStr) {
  const parts = parseAnchorString(anchorDateStr);
  return parts.year === year && parts.month === month;
}

export function buildCalendarGrid(viewYear, viewMonth) {
  const daysInMonth = getDaysInSaltaMonth(viewYear, viewMonth);
  const firstWeekday = getSaltaParts(saltaDateAtMidnight(viewYear, viewMonth, 1)).weekday;
  const startOffset = WEEKDAY_INDEX[firstWeekday] ?? 0;

  const cells = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push({ year: viewYear, month: viewMonth, day: d });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function getMonthNamesShort() {
  return MONTH_NAMES_SHORT;
}

export function sumPaymentAmounts(payments) {
  return Math.round(
    payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) * 100,
  ) / 100;
}

export function groupPaymentsByDriver(payments, driverNameById = {}) {
  const map = {};
  for (const payment of payments) {
    const id = payment.driver_id;
    if (!map[id]) {
      map[id] = {
        driver_id: id,
        driver_name: driverNameById[id] || payment.driver_name || 'Chofer',
        total: 0,
        count: 0,
        payments: [],
      };
    }
    const amount = Number(payment.amount) || 0;
    map[id].total = Math.round((map[id].total + amount) * 100) / 100;
    map[id].count += 1;
    map[id].payments.push(payment);
  }
  return Object.values(map).sort((a, b) => b.total - a.total);
}

export function paymentSourceLabel(source, notes) {
  if (source === 'paypertic') return 'Paypertic (online)';
  if (source === 'dashboard') return 'Dashboard';
  if (notes?.includes('Paypertic')) return 'Paypertic (online)';
  if (notes?.includes('efectivo') || notes?.includes('Efectivo')) return 'Efectivo';
  return 'Manual';
}
