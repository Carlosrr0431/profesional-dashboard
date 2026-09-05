/**
 * Promueve viajes status=scheduled → queued cuando llega la hora (con anticipación).
 * Usado por dispatch-worker en cada ciclo de cron.
 */

/** Anticipación con la que un viaje programado pasa a cola y empieza a buscar chofer. */
export const DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS = 20 * 60 * 1000;

/** Argentina (Salta): UTC-3, mismo criterio que Agente_IA/route.js */
export const AR_UTC_OFFSET_H = -3;

/**
 * Interpreta fecha+hora local de Argentina (inputs `YYYY-MM-DD` + `HH:MM`) como Date UTC.
 * @returns {Date | null}
 */
export function arLocalDateTimeToUtcDate(dateStr, timeStr) {
  const dateMatch = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(timeStr || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  return new Date(Date.UTC(year, month - 1, day, hour - AR_UTC_OFFSET_H, minute, 0, 0));
}

function arCalendarPartsFromMs(ms) {
  const ar = new Date(Number(ms) + AR_UTC_OFFSET_H * 3_600_000);
  return {
    date: `${ar.getUTCFullYear()}-${String(ar.getUTCMonth() + 1).padStart(2, '0')}-${String(ar.getUTCDate()).padStart(2, '0')}`,
    time: `${String(ar.getUTCHours()).padStart(2, '0')}:${String(ar.getUTCMinutes()).padStart(2, '0')}`,
  };
}

/**
 * Default al abrir “Programar”: ahora + 1 h.
 * Si eso cruza medianoche, usa ahora + 20 min si todavía es hoy.
 */
export function defaultArScheduleParts(nowMs = Date.now()) {
  const today = arCalendarPartsFromMs(nowMs);
  const plus1h = arCalendarPartsFromMs(nowMs + 60 * 60 * 1000);
  if (plus1h.date === today.date) return plus1h;

  const plus20 = arCalendarPartsFromMs(nowMs + DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS);
  if (plus20.date === today.date) return plus20;

  return plus1h;
}

const TONIGHT_COERCE_WINDOW_MS = 3 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_DAY_SLACK_MS = 2 * 60 * 60 * 1000;

/**
 * Si el operador dejó el día en “mañana” pero la misma hora de hoy
 * todavía vale (esta noche, ≤ 3 h), corrige a hoy.
 * No toca reservas de mañana de mañana / tarde.
 */
export function coerceArScheduleIfTonightStillValid(dateStr, timeStr, nowMs = Date.now()) {
  const chosen = arLocalDateTimeToUtcDate(dateStr, timeStr);
  if (!chosen) return { date: dateStr, time: timeStr };

  const today = arCalendarPartsFromMs(nowMs);
  if (String(dateStr) === today.date) return { date: dateStr, time: timeStr };

  const tonight = arLocalDateTimeToUtcDate(today.date, timeStr);
  if (!tonight) return { date: dateStr, time: timeStr };

  const tonightMs = tonight.getTime();
  if (tonightMs <= nowMs + 60_000) return { date: dateStr, time: timeStr };
  if (tonightMs > nowMs + TONIGHT_COERCE_WINDOW_MS) return { date: dateStr, time: timeStr };

  const delta = chosen.getTime() - tonightMs;
  if (Math.abs(delta - ONE_DAY_MS) > ONE_DAY_SLACK_MS) {
    return { date: dateStr, time: timeStr };
  }

  return { date: today.date, time: timeStr };
}

export function isScheduledTripDue(
  trip,
  nowMs = Date.now(),
  aheadMs = DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS,
) {
  if (String(trip?.status || '').toLowerCase() !== 'scheduled') return false;
  const when = resolveScheduledForFromTrip(trip);
  if (!when) return false;
  const safeAhead = Math.max(0, Number(aheadMs) || DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS);
  return when.getTime() <= nowMs + safeAhead;
}

/** Ej: "lunes 25/05 a las 11:42" (hora Argentina). */
export function formatArScheduleDisplay(utcDate) {
  const date = utcDate instanceof Date ? utcDate : new Date(utcDate);
  if (!Number.isFinite(date.getTime())) return '—';

  const ar = new Date(date.getTime() + AR_UTC_OFFSET_H * 3_600_000);
  const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const weekday = WEEKDAYS_ES[ar.getUTCDay()];
  const dd = String(ar.getUTCDate()).padStart(2, '0');
  const mm = String(ar.getUTCMonth() + 1).padStart(2, '0');
  const hh = String(ar.getUTCHours()).padStart(2, '0');
  const min = String(ar.getUTCMinutes()).padStart(2, '0');
  return `${weekday} ${dd}/${mm} a las ${hh}:${min}`;
}

export function buildScheduledDispatchWhatsAppMessage(displayText) {
  const when = String(displayText || '').trim() || 'tu horario reservado';
  return (
    `🚕 Ya estamos despachando tu remis del *${when}*. ` +
    'En breve te confirmamos el chofer asignado.'
  );
}

export function resolveScheduledForFromTrip(trip) {
  if (!trip) return null;

  if (trip.scheduled_for) {
    const fromColumn = new Date(trip.scheduled_for);
    if (!isNaN(fromColumn.getTime())) return fromColumn;
  }

  const match = String(trip.notes || '').match(/\[SCHEDULED_FOR\] (\S+)/);
  if (!match) return null;

  const fromNotes = new Date(match[1]);
  return isNaN(fromNotes.getTime()) ? null : fromNotes;
}

export function resolveScheduledDisplayFromTrip(trip, scheduledFor) {
  const displayMatch = String(trip?.notes || '').match(/\[SCHEDULED_DISPLAY\] ([^\n]+)/);
  if (displayMatch) return displayMatch[1].trim();
  if (scheduledFor instanceof Date && !Number.isNaN(scheduledFor.getTime())) {
    return formatArScheduleDisplay(scheduledFor);
  }
  return '—';
}

/** Reservas de passenger-app no deben notificar por WhatsApp al promover. */
export function shouldNotifyScheduledTripViaWhatsApp(trip) {
  const notes = String(trip?.notes || '');
  if (notes.includes('[PASSENGER_APP]')) return false;
  if (/\[SCHEDULED_SOURCE\]\s*passenger_(app|web)/i.test(notes)) return false;
  return true;
}

function summarizeDbError(error) {
  if (!error) return null;
  return {
    code: error.code || null,
    message: error.message || String(error),
    details: error.details || null,
    hint: error.hint || null,
  };
}

/**
 * @param {object} options
 * @param {import('@supabase/supabase-js').SupabaseClient} options.supabase
 * @param {(stage: string, meta?: object) => void} [options.log]
 * @param {(phone: string, text: string, trip?: object) => Promise<{ok?: boolean, reason?: string}>} [options.sendPassengerWhatsApp]
 * @param {number} [options.dispatchAheadMs]
 * @param {number} [options.nowMs]
 */
export async function promoteDueScheduledTrips({
  supabase,
  log = () => {},
  sendPassengerWhatsApp = null,
  dispatchAheadMs = DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS,
  nowMs = Date.now(),
} = {}) {
  if (!supabase) {
    throw new Error('promoteDueScheduledTrips: falta cliente Supabase');
  }

  const safeAheadMs = Math.max(0, Number(dispatchAheadMs) || DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS);

  const { data: scheduledTrips, error } = await supabase
    .from('trips')
    .select('id, passenger_phone, destination_address, notes, scheduled_for, wa_context')
    .eq('status', 'scheduled');

  if (error) {
    log('scheduled_dispatch_db_error', { error: summarizeDbError(error) });
    return { promoted: 0, scanned: 0, skippedNotDue: 0, skippedNoTime: 0, errors: 1 };
  }

  const rows = scheduledTrips || [];
  if (!rows.length) {
    log('scheduled_dispatch_none', {});
    return { promoted: 0, scanned: 0, skippedNotDue: 0, skippedNoTime: 0, errors: 0 };
  }

  let promoted = 0;
  let skippedNotDue = 0;
  let skippedNoTime = 0;

  for (const trip of rows) {
    const scheduledFor = resolveScheduledForFromTrip(trip);
    if (!scheduledFor) {
      skippedNoTime += 1;
      log('scheduled_trip_skip_no_time', { tripId: trip.id });
      continue;
    }

    if (scheduledFor.getTime() > nowMs + safeAheadMs) {
      skippedNotDue += 1;
      continue;
    }

    const displayText = resolveScheduledDisplayFromTrip(trip, scheduledFor);

    const { data: updatedRows, error: updateErr } = await supabase
      .from('trips')
      .update({
        status: 'queued',
        dispatch_status: 'queued',
        assigned_at: null,
        next_dispatch_at: new Date(nowMs).toISOString(),
      })
      .eq('id', trip.id)
      .eq('status', 'scheduled')
      .select('id');

    if (updateErr) {
      log('scheduled_trip_promote_error', {
        tripId: trip.id,
        error: summarizeDbError(updateErr),
      });
      continue;
    }

    if (!updatedRows?.length) {
      log('scheduled_trip_promote_skipped_race', { tripId: trip.id });
      continue;
    }

    const notifyViaWhatsApp = shouldNotifyScheduledTripViaWhatsApp(trip);
    if (notifyViaWhatsApp && sendPassengerWhatsApp && trip.passenger_phone) {
      const notifyResult = await sendPassengerWhatsApp(
        trip.passenger_phone,
        buildScheduledDispatchWhatsAppMessage(displayText),
        trip,
      );
      if (!notifyResult?.ok) {
        log('scheduled_trip_notify_error', {
          tripId: trip.id,
          reason: notifyResult?.reason || 'notify_failed',
        });
      }
    } else if (!notifyViaWhatsApp) {
      log('scheduled_trip_notify_skipped_passenger_app', { tripId: trip.id });
    }

    log('scheduled_trip_promoted_to_queue', {
      tripId: trip.id,
      scheduledFor: scheduledFor.toISOString(),
      displayText,
      source: notifyViaWhatsApp ? 'whatsapp' : 'passenger_app',
    });
    promoted += 1;
  }

  log('scheduled_dispatch_done', {
    promoted,
    scanned: rows.length,
    skippedNotDue,
    skippedNoTime,
    dispatchAheadMs: safeAheadMs,
  });

  return {
    promoted,
    scanned: rows.length,
    skippedNotDue,
    skippedNoTime,
    errors: 0,
  };
}
