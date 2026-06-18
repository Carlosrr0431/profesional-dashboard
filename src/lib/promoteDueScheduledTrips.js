/**
 * Promueve viajes status=scheduled → queued cuando llega la hora (con anticipación).
 * Usado por dispatch-worker en cada ciclo de cron.
 */

export const DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS = 5 * 60 * 1000;

/** Argentina (Salta): UTC-3, mismo criterio que Agente_IA/route.js */
const AR_UTC_OFFSET_H = -3;

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
 * @param {(phone: string, text: string) => Promise<{ok?: boolean, reason?: string}>} [options.sendPassengerWhatsApp]
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
    .select('id, passenger_phone, destination_address, notes, scheduled_for')
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
        assigned_at: new Date(nowMs).toISOString(),
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

    if (sendPassengerWhatsApp && trip.passenger_phone) {
      const notifyResult = await sendPassengerWhatsApp(
        trip.passenger_phone,
        buildScheduledDispatchWhatsAppMessage(displayText)
      );
      if (!notifyResult?.ok) {
        log('scheduled_trip_notify_error', {
          tripId: trip.id,
          reason: notifyResult?.reason || 'notify_failed',
        });
      }
    }

    log('scheduled_trip_promoted_to_queue', {
      tripId: trip.id,
      scheduledFor: scheduledFor.toISOString(),
      displayText,
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
