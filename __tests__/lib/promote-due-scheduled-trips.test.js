const {
  resolveScheduledForFromTrip,
  resolveScheduledDisplayFromTrip,
  formatArScheduleDisplay,
  arLocalDateTimeToUtcDate,
  buildScheduledDispatchWhatsAppMessage,
  shouldNotifyScheduledTripViaWhatsApp,
  promoteDueScheduledTrips,
  defaultArScheduleParts,
  coerceArScheduleIfTonightStillValid,
  isScheduledTripDue,
  DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS,
} = require('../../src/lib/promoteDueScheduledTrips');

describe('promoteDueScheduledTrips', () => {
  it('resolveScheduledForFromTrip prioriza scheduled_for', () => {
    const iso = '2026-05-26T13:50:00.000Z';
    const trip = {
      scheduled_for: iso,
      notes: '[SCHEDULED_FOR] 2026-05-25T10:00:00.000Z',
    };
    expect(resolveScheduledForFromTrip(trip).toISOString()).toBe(iso);
  });

  it('promueve a queued cuando la hora está dentro del margen', async () => {
    const scheduledFor = new Date('2026-05-25T13:50:00.000Z');
    const nowMs = scheduledFor.getTime() - 2 * 60 * 1000;

    const update = jest.fn(() => ({
      eq: jest.fn(function secondEq() {
        return {
          eq: jest.fn(() => ({
            select: jest.fn(async () => ({ data: [{ id: 'trip-1' }], error: null })),
          })),
        };
      }),
    }));

    const supabase = {
      from: jest.fn((table) => {
        if (table !== 'trips') return {};
        return {
          select: jest.fn(() => ({
            eq: jest.fn(async () => ({
              data: [
                {
                  id: 'trip-1',
                  passenger_phone: '5493878630173',
                  notes: `[SCHEDULED_FOR] ${scheduledFor.toISOString()}\n[SCHEDULED_DISPLAY] hoy a las 10:50`,
                  scheduled_for: scheduledFor.toISOString(),
                },
              ],
              error: null,
            })),
          })),
          update,
        };
      }),
    };

    const logs = [];
    const sendPassengerWhatsApp = jest.fn(async () => ({ ok: true }));

    const result = await promoteDueScheduledTrips({
      supabase,
      log: (stage, meta) => logs.push({ stage, meta }),
      sendPassengerWhatsApp,
      dispatchAheadMs: DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS,
      nowMs,
    });

    expect(result.promoted).toBe(1);
    expect(sendPassengerWhatsApp).toHaveBeenCalledTimes(1);
    const waMessage = sendPassengerWhatsApp.mock.calls[0][1];
    expect(waMessage).toContain('hoy a las 10:50');
    expect(waMessage).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(logs.some((l) => l.stage === 'scheduled_trip_promoted_to_queue')).toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'queued',
        dispatch_status: 'queued',
        assigned_at: null,
      })
    );
  });

  it('no promueve si la hora todavía está lejos', async () => {
    const scheduledFor = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const update = jest.fn();

    const supabase = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(async () => ({
            data: [
              {
                id: 'trip-future',
                passenger_phone: '5493878630173',
                scheduled_for: scheduledFor.toISOString(),
                notes: '',
              },
            ],
            error: null,
          })),
        })),
        update,
      })),
    };

    const result = await promoteDueScheduledTrips({ supabase, nowMs: Date.now() });
    expect(result.promoted).toBe(0);
    expect(result.skippedNotDue).toBe(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('resolveScheduledDisplayFromTrip lee SCHEDULED_DISPLAY', () => {
    const trip = { notes: '[SCHEDULED_DISPLAY] martes 26/05 a las 10:50' };
    expect(resolveScheduledDisplayFromTrip(trip, new Date())).toBe('martes 26/05 a las 10:50');
  });

  it('resolveScheduledDisplayFromTrip formatea AR si falta SCHEDULED_DISPLAY', () => {
    const scheduledFor = new Date('2026-05-25T14:42:00.000Z');
    const trip = { notes: '[SCHEDULED_FOR] 2026-05-25T14:42:00.000Z' };
    expect(resolveScheduledDisplayFromTrip(trip, scheduledFor)).toBe('lunes 25/05 a las 11:42');
  });

  it('buildScheduledDispatchWhatsAppMessage usa texto legible', () => {
    const msg = buildScheduledDispatchWhatsAppMessage('lunes 25/05 a las 11:42');
    expect(msg).toContain('*lunes 25/05 a las 11:42*');
    expect(msg).not.toContain('T14:42');
  });

  it('formatArScheduleDisplay convierte UTC a hora Argentina', () => {
    expect(formatArScheduleDisplay(new Date('2026-05-25T14:42:00.000Z'))).toBe('lunes 25/05 a las 11:42');
  });

  it('shouldNotifyScheduledTripViaWhatsApp es false para passenger_app', () => {
    expect(shouldNotifyScheduledTripViaWhatsApp({
      notes: '[PASSENGER_APP]\n[SCHEDULED_SOURCE] passenger_app\n[SCHEDULED_FOR] x',
    })).toBe(false);
    expect(shouldNotifyScheduledTripViaWhatsApp({
      notes: '[SCHEDULED_FOR] x\n[SCHEDULED_DISPLAY] hoy',
    })).toBe(true);
  });

  it('no envía WhatsApp al promover reserva de passenger-app', async () => {
    const scheduledFor = new Date('2026-05-25T13:50:00.000Z');
    const nowMs = scheduledFor.getTime() - 2 * 60 * 1000;

    const update = jest.fn(() => ({
      eq: jest.fn(function secondEq() {
        return {
          eq: jest.fn(() => ({
            select: jest.fn(async () => ({ data: [{ id: 'trip-app' }], error: null })),
          })),
        };
      }),
    }));

    const supabase = {
      from: jest.fn((table) => {
        if (table !== 'trips') return {};
        return {
          select: jest.fn(() => ({
            eq: jest.fn(async () => ({
              data: [
                {
                  id: 'trip-app',
                  passenger_phone: '5493878630173',
                  notes: `[PASSENGER_APP]\n[SCHEDULED_SOURCE] passenger_app\n[SCHEDULED_FOR] ${scheduledFor.toISOString()}`,
                  scheduled_for: scheduledFor.toISOString(),
                },
              ],
              error: null,
            })),
          })),
          update,
        };
      }),
    };

    const sendPassengerWhatsApp = jest.fn(async () => ({ ok: true }));
    const result = await promoteDueScheduledTrips({
      supabase,
      sendPassengerWhatsApp,
      dispatchAheadMs: DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS,
      nowMs,
    });

    expect(result.promoted).toBe(1);
    expect(sendPassengerWhatsApp).not.toHaveBeenCalled();
  });

  it('DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS es 20 minutos', () => {
    expect(DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS).toBe(20 * 60 * 1000);
  });

  it('arLocalDateTimeToUtcDate interpreta hora Argentina', () => {
    const d = arLocalDateTimeToUtcDate('2026-05-25', '11:42');
    expect(d.toISOString()).toBe('2026-05-25T14:42:00.000Z');
  });

  it('no promueve 25 min antes; sí a los 20 min', async () => {
    const scheduledFor = new Date('2026-05-25T13:50:00.000Z');
    const trip = {
      id: 'trip-window',
      passenger_phone: '5493878630173',
      notes: `[SCHEDULED_FOR] ${scheduledFor.toISOString()}`,
      scheduled_for: scheduledFor.toISOString(),
    };

    function mockSupabase(update) {
      return {
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(async () => ({ data: [trip], error: null })),
          })),
          update,
        })),
      };
    }

    const updateFar = jest.fn();
    const far = await promoteDueScheduledTrips({
      supabase: mockSupabase(updateFar),
      nowMs: scheduledFor.getTime() - 25 * 60 * 1000,
    });
    expect(far.promoted).toBe(0);
    expect(far.skippedNotDue).toBe(1);
    expect(updateFar).not.toHaveBeenCalled();

    const updateDue = jest.fn(() => ({
      eq: jest.fn(function secondEq() {
        return {
          eq: jest.fn(() => ({
            select: jest.fn(async () => ({ data: [{ id: 'trip-window' }], error: null })),
          })),
        };
      }),
    }));
    const due = await promoteDueScheduledTrips({
      supabase: mockSupabase(updateDue),
      nowMs: scheduledFor.getTime() - 20 * 60 * 1000,
    });
    expect(due.promoted).toBe(1);
    expect(updateDue).toHaveBeenCalledWith(expect.objectContaining({
      status: 'queued',
      dispatch_status: 'queued',
      assigned_at: null,
    }));
  });

  it('defaultArScheduleParts usa +1h si no cruza medianoche', () => {
    const fridayAfternoon = Date.parse('2026-09-04T17:23:00.000Z');
    expect(defaultArScheduleParts(fridayAfternoon)).toEqual({
      date: '2026-09-04',
      time: '15:23',
    });
  });

  it('defaultArScheduleParts no salta al día siguiente si todavía es de noche', () => {
    const fridayNight = Date.parse('2026-09-05T02:23:00.000Z');
    const parts = defaultArScheduleParts(fridayNight);
    expect(parts.date).toBe('2026-09-04');
    expect(parts.time).toBe('23:43');
  });

  it('coerceArScheduleIfTonightStillValid corrige sábado 23:46 cargado de noche', () => {
    const fridayNight = Date.parse('2026-09-05T02:23:00.000Z');
    expect(coerceArScheduleIfTonightStillValid('2026-09-05', '23:46', fridayNight)).toEqual({
      date: '2026-09-04',
      time: '23:46',
    });
  });

  it('coerce no toca una reserva de mañana a la tarde', () => {
    const saturdayMorning = Date.parse('2026-09-05T13:00:00.000Z');
    expect(coerceArScheduleIfTonightStillValid('2026-09-06', '16:00', saturdayMorning)).toEqual({
      date: '2026-09-06',
      time: '16:00',
    });
  });

  it('isScheduledTripDue solo aplica a scheduled dentro de 20 min', () => {
    const nowMs = Date.parse('2026-09-05T02:30:00.000Z');
    expect(isScheduledTripDue({
      status: 'scheduled',
      scheduled_for: '2026-09-05T02:46:00.000Z',
    }, nowMs)).toBe(true);
    expect(isScheduledTripDue({
      status: 'scheduled',
      scheduled_for: '2026-09-06T02:46:00.000Z',
    }, nowMs)).toBe(false);
    expect(isScheduledTripDue({
      status: 'queued',
      scheduled_for: '2026-09-05T02:46:00.000Z',
    }, nowMs)).toBe(false);
  });
});
