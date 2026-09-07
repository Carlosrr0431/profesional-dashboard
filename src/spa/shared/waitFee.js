const MS_PER_MINUTE = 60_000;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function isStreetHailNotes(notes) {
  return String(notes || '').toUpperCase().includes('[STREET_HAIL]');
}

export function waitElapsedMs(trip, now = Date.now()) {
  const start = Date.parse(trip?.driver_arrived_at || '');
  if (!Number.isFinite(start)) return 0;
  const endRaw = trip?.wait_ended_at || trip?.pickup_at;
  const end = endRaw ? Date.parse(endRaw) : now;
  const endMs = Number.isFinite(end) ? end : now;
  return Math.max(0, endMs - start);
}

export function billedWaitMinutes(elapsedMs) {
  const ms = toNumber(elapsedMs);
  if (ms < MS_PER_MINUTE) return 0;
  return Math.floor(ms / MS_PER_MINUTE);
}

export function waitFeeAmount(minutes, rate) {
  const m = toNumber(minutes);
  const r = toNumber(rate);
  if (m <= 0 || r <= 0) return 0;
  return Math.round(m * r);
}

export function formatWaitClock(elapsedMs) {
  const totalSec = Math.max(0, Math.floor(toNumber(elapsedMs) / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function isWaitTimerActive(trip) {
  if (!trip?.driver_arrived_at) return false;
  if (trip.wait_ended_at) return false;
  if (trip.pickup_at) return false;
  const status = String(trip.status || '').toLowerCase();
  if (status === 'in_progress' || status === 'completed' || status === 'cancelled') {
    return false;
  }
  if (isStreetHailNotes(trip.notes)) return false;
  return true;
}

export function waitCardVisible(trip) {
  if (!trip) return false;
  if (isWaitTimerActive(trip)) return true;
  if (toNumber(trip.wait_fee_amount) > 0) return true;
  if (toNumber(trip.wait_prior_debt) > 0) return true;
  if (toNumber(trip.wait_debt_applied) > 0) return true;
  return false;
}

export function buildWaitFeeView(trip, now = Date.now()) {
  const rate = Math.max(0, Math.round(toNumber(trip?.wait_fee_per_minute)));
  const priorDebt = Math.max(0, Math.round(toNumber(trip?.wait_prior_debt)));
  const settledDebt = Math.max(0, Math.round(toNumber(trip?.wait_debt_applied)));
  const frozenFee = Math.max(0, Math.round(toNumber(trip?.wait_fee_amount)));
  const frozenMinutes = Math.max(0, Math.round(toNumber(trip?.wait_minutes)));
  const active = isWaitTimerActive(trip);
  const elapsedMs = waitElapsedMs(trip, now);
  const minutes = active ? billedWaitMinutes(elapsedMs) : frozenMinutes;
  const fee = active ? waitFeeAmount(minutes, rate) : frozenFee;
  const status = String(trip?.status || '').toLowerCase();
  const completed = status === 'completed';
  const debtOnBill = completed ? settledDebt : priorDebt;
  const extraDue = fee + debtOnBill;
  return {
    active,
    show: waitCardVisible(trip),
    clock: formatWaitClock(elapsedMs),
    minutes,
    rate,
    fee,
    priorDebt,
    settledDebt,
    extraDue,
    debtOnBill,
    completed,
  };
}
