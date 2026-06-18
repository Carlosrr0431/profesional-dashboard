const {
  resolveScheduledForFromTrip,
  resolveScheduledDisplayFromTrip,
  formatArScheduleDisplay,
  buildScheduledDispatchWhatsAppMessage,
  promoteDueScheduledTrips,
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
      expect.objectContaining({ status: 'queued' })
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
});
