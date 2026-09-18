const {
  tripBelongsInWaitQueue,
  tripBelongsOnPendingMap,
  tripLeftWaitQueue,
  applyQueueRealtimeChange,
  applyPendingRealtimeChange,
  applyLiveTripsRealtimeChange,
} = require('../../src/lib/queueRealtime');

const queuedCarlos = {
  id: 'trip-carlos',
  position: 1,
  passengerName: 'Carlos',
  phone: '5493870000000',
  pickupAddress: 'Alvarado 100',
  queuedAt: '2026-08-29T12:00:00.000Z',
};

describe('tripBelongsInWaitQueue', () => {
  it('acepta queued sin hold/cancelled', () => {
    expect(tripBelongsInWaitQueue({ status: 'queued' })).toBe(true);
    expect(tripBelongsInWaitQueue({ status: 'queued', dispatch_status: 'queued' })).toBe(true);
  });

  it('rechaza cancelado, hold y cualquier status que no sea queued', () => {
    expect(tripBelongsInWaitQueue({ status: 'cancelled' })).toBe(false);
    expect(tripBelongsInWaitQueue({ status: 'queued', dispatch_status: 'cancelled' })).toBe(false);
    expect(tripBelongsInWaitQueue({ status: 'queued', dispatch_status: 'hold' })).toBe(false);
    expect(tripBelongsInWaitQueue({ status: 'pending' })).toBe(false);
  });
});

describe('tripBelongsOnPendingMap', () => {
  it('muestra queued/pending y oculta hold o cancelado', () => {
    expect(tripBelongsOnPendingMap({ status: 'queued' })).toBe(true);
    expect(tripBelongsOnPendingMap({ status: 'pending' })).toBe(true);
    expect(tripBelongsOnPendingMap({ status: 'queued', dispatch_status: 'hold' })).toBe(false);
    expect(tripBelongsOnPendingMap({ status: 'cancelled' })).toBe(false);
  });
});

describe('applyQueueRealtimeChange', () => {
  it('saca el viaje al instante cuando status pasa a cancelled', () => {
    const next = applyQueueRealtimeChange([queuedCarlos], {
      eventType: 'UPDATE',
      new: { id: 'trip-carlos', status: 'cancelled', dispatch_status: 'cancelled' },
      old: { id: 'trip-carlos' },
    });
    expect(next).toEqual([]);
  });

  it('saca el viaje si solo cambia dispatch_status a cancelled', () => {
    const next = applyQueueRealtimeChange([queuedCarlos], {
      eventType: 'UPDATE',
      new: { id: 'trip-carlos', dispatch_status: 'cancelled' },
    });
    expect(next).toEqual([]);
  });

  it('saca el viaje en DELETE', () => {
    const next = applyQueueRealtimeChange([queuedCarlos], {
      eventType: 'DELETE',
      old: { id: 'trip-carlos' },
    });
    expect(next).toEqual([]);
  });

  it('no reinserta un viaje que ya no está en cola', () => {
    expect(tripLeftWaitQueue({
      eventType: 'UPDATE',
      new: { id: 'trip-carlos', status: 'cancelled' },
    })).toBe(true);
  });

  it('agrega un INSERT queued y reindexa FIFO', () => {
    const next = applyQueueRealtimeChange([queuedCarlos], {
      eventType: 'INSERT',
      new: {
        id: 'trip-ana',
        status: 'queued',
        passenger_name: 'Ana',
        passenger_phone: '5493871111111',
        destination_address: 'Mitre 200',
        created_at: '2026-08-29T11:00:00.000Z',
      },
    });
    expect(next.map((item) => item.id)).toEqual(['trip-ana', 'trip-carlos']);
    expect(next[0].position).toBe(1);
    expect(next[1].position).toBe(2);
  });
});

describe('applyPendingRealtimeChange', () => {
  const mapRow = (trip) => ({
    id: trip.id,
    status: trip.status,
    lat: trip.origin_lat,
    lng: trip.origin_lng,
  });

  it('saca el pin cuando el viaje se cancela', () => {
    const next = applyPendingRealtimeChange(
      [{ id: 'trip-carlos', status: 'queued', lat: -24.78, lng: -65.42 }],
      {
        eventType: 'UPDATE',
        new: { id: 'trip-carlos', status: 'cancelled', origin_lat: -24.78, origin_lng: -65.42 },
      },
      mapRow,
    );
    expect(next).toEqual([]);
  });
});

describe('applyLiveTripsRealtimeChange', () => {
  it('apaga isQueued al cancelar', () => {
    const next = applyLiveTripsRealtimeChange(
      [{ id: 'trip-carlos', status: 'queued', isQueued: true, isActive: false }],
      {
        eventType: 'UPDATE',
        new: { id: 'trip-carlos', status: 'cancelled', dispatch_status: 'cancelled' },
      },
    );
    expect(next[0].isQueued).toBe(false);
    expect(next[0].status).toBe('cancelled');
  });
});
