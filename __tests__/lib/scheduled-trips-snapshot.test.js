const {
  isVisibleScheduledBooking,
  mergeScheduledBookingRows,
  fetchScheduledTripsSnapshot,
  cancelScheduledBooking,
  applyScheduledRealtimePayload,
  upsertScheduledTripRow,
} = require('../../src/lib/scheduledTripsSnapshot');

function chain(result) {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    not: () => query,
    is: () => query,
    ilike: () => query,
    order: () => query,
    limit: () => Promise.resolve(result),
    update: () => query,
    delete: () => query,
    maybeSingle: () => Promise.resolve(result),
  };
  return query;
}

describe('scheduledTripsSnapshot', () => {
  it('muestra scheduled y también queued/pending con hora reservada', () => {
    expect(isVisibleScheduledBooking({
      id: 'a',
      status: 'scheduled',
      scheduled_for: '2026-08-31T23:00:00.000Z',
    })).toBe(true);

    expect(isVisibleScheduledBooking({
      id: 'b',
      status: 'queued',
      scheduled_for: '2026-08-31T21:10:00.000Z',
    })).toBe(true);

    expect(isVisibleScheduledBooking({
      id: 'c',
      status: 'pending',
      notes: '[SCHEDULED_FOR] 2026-08-31T21:10:00.000Z',
    })).toBe(true);

    expect(isVisibleScheduledBooking({
      id: 'd',
      status: 'queued',
      scheduled_for: null,
      notes: 'En cola de espera. Retiro confirmado.',
    })).toBe(false);

    expect(isVisibleScheduledBooking({
      id: 'e',
      status: 'accepted',
      scheduled_for: '2026-08-31T21:10:00.000Z',
    })).toBe(false);
  });

  it('deduplica filas y descarta viajes inmediatos de cola', () => {
    const merged = mergeScheduledBookingRows(
      [{ id: '1', status: 'scheduled', scheduled_for: '2026-08-31T23:00:00.000Z' }],
      [
        { id: '1', status: 'queued', scheduled_for: '2026-08-31T23:00:00.000Z' },
        { id: '2', status: 'queued', scheduled_for: null, notes: 'inmediato' },
        { id: '3', status: 'queued', scheduled_for: '2026-08-31T21:20:00.000Z' },
      ],
    );
    expect(merged.map((row) => row.id).sort()).toEqual(['1', '3']);
    expect(merged.find((row) => row.id === '1').status).toBe('queued');
  });

  it('fetch une scheduled + despachando y fallback por notes', async () => {
    const results = [
      { data: [{ id: 's1', status: 'scheduled', scheduled_for: '2026-08-31T23:00:00.000Z' }], error: null },
      { data: [{ id: 'q1', status: 'queued', scheduled_for: '2026-08-31T21:05:00.000Z' }], error: null },
      { data: [{ id: 'n1', status: 'pending', scheduled_for: null, notes: '[SCHEDULED_FOR] 2026-08-31T22:00:00.000Z' }], error: null },
    ];
    let call = 0;
    const supabase = {
      from: () => chain(results[call++]),
    };

    const rows = await fetchScheduledTripsSnapshot(supabase);
    expect(rows.map((row) => row.id).sort()).toEqual(['n1', 'q1', 's1']);
  });

  it('cancel actualiza scheduled y queued', async () => {
    const supabase = {
      from: () => chain({
        data: { id: 'abc', status: 'scheduled', driver_id: null },
        error: null,
      }),
    };
    const data = await cancelScheduledBooking(supabase, 'abc');
    expect(data.id).toBe('abc');
  });

  it('aplica INSERT/UPDATE realtime y saca el viaje si deja de ser programado', () => {
    const scheduled = { id: '1', status: 'scheduled', scheduled_for: '2026-08-31T23:00:00.000Z' };
    const inserted = applyScheduledRealtimePayload([], {
      eventType: 'INSERT',
      new: scheduled,
    });
    expect(inserted).toEqual([scheduled]);

    const queued = { id: '1', status: 'queued', scheduled_for: '2026-08-31T23:00:00.000Z' };
    const updated = applyScheduledRealtimePayload(inserted, {
      eventType: 'UPDATE',
      new: queued,
    });
    expect(updated[0].status).toBe('queued');

    const accepted = applyScheduledRealtimePayload(updated, {
      eventType: 'UPDATE',
      new: { id: '1', status: 'accepted', scheduled_for: '2026-08-31T23:00:00.000Z' },
    });
    expect(accepted).toEqual([]);
  });

  it('upsert agrega el viaje creado desde el panel', () => {
    const trip = {
      id: 'new',
      status: 'scheduled',
      scheduled_for: '2026-08-31T23:30:00.000Z',
      passenger_name: 'charlky',
    };
    const next = upsertScheduledTripRow([], trip);
    expect(next).toHaveLength(1);
    expect(next[0].passenger_name).toBe('charlky');
  });
});
