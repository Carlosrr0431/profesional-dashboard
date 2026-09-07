/** @jest-environment node */

import { listActiveDockTrips } from '../../src/components/MapDockPopovers';
import {
  applyTripRealtimeToDrivers,
  applyTripRealtimeToLiveList,
  applyTripRealtimeToQueue,
  mapLiveTripFromRow,
  mergeDriversSnapshotWithTripRealtime,
} from '../../src/lib/tripRealtime';

const STREET_HAIL_CANCEL = {
  id: '060862d9-99bc-427a-9f94-eadcc19bb1aa',
  driver_id: '941f2855-4dcf-41ea-8101-dbffe344c9c3',
  passenger_name: 'Pasajero en calle',
  origin_address: 'Juan Gálvez 218, Salta, Capital, Salta',
  destination_address: 'A confirmar',
  status: 'cancelled',
  notes: '[STREET_HAIL]\nViaje tomado en calle. Destino a definir.',
  dispatch_status: 'cancelled',
  created_at: '2026-09-07T00:44:15.142532+00',
};

describe('tripRealtime', () => {
  it('al cancelar un street-hail saca el viaje activo del chofer al instante', () => {
    const drivers = [
      {
        id: '941f2855-4dcf-41ea-8101-dbffe344c9c3',
        activeTrip: {
          status: 'in_progress',
          passenger_name: 'Pasajero en calle',
          destination_address: 'A confirmar',
        },
      },
      { id: 'other', activeTrip: { id: 'keep', status: 'accepted' } },
    ];

    const next = applyTripRealtimeToDrivers(drivers, {
      eventType: 'UPDATE',
      new: STREET_HAIL_CANCEL,
      old: {
        id: STREET_HAIL_CANCEL.id,
        driver_id: STREET_HAIL_CANCEL.driver_id,
        status: 'in_progress',
      },
    });

    expect(next[0].activeTrip).toBeNull();
    expect(next[1].activeTrip.id).toBe('keep');
  });

  it('el botón de viajes deja de contar el cancelado', () => {
    const range = {
      start: '2026-09-06T03:00:00.000Z',
      end: '2026-09-07T03:00:00.000Z',
    };
    const live = [
      mapLiveTripFromRow({
        ...STREET_HAIL_CANCEL,
        status: 'in_progress',
        dispatch_status: null,
      }, range),
    ];
    expect(listActiveDockTrips(live)).toHaveLength(1);

    const next = applyTripRealtimeToLiveList(live, {
      eventType: 'UPDATE',
      new: STREET_HAIL_CANCEL,
    }, range);

    expect(next[0].isActive).toBe(false);
    expect(next[0].status).toBe('cancelled');
    expect(listActiveDockTrips(next)).toHaveLength(0);
  });

  it('saca de la cola un viaje que deja de estar queued', () => {
    const queue = [
      { id: 'q1', position: 1, passengerName: 'Uno' },
      { id: 'q2', position: 2, passengerName: 'Dos' },
    ];
    const next = applyTripRealtimeToQueue(queue, {
      eventType: 'UPDATE',
      new: { id: 'q1', status: 'accepted', driver_id: 'd1', dispatch_status: null },
    });
    expect(next.map((item) => item.id)).toEqual(['q2']);
    expect(next[0].position).toBe(1);
  });

  it('agrega a la cola un viaje queued y ignora hold', () => {
    const inserted = applyTripRealtimeToQueue([], {
      eventType: 'INSERT',
      new: {
        id: 'q3',
        status: 'queued',
        dispatch_status: 'searching',
        passenger_name: 'Nuevo',
        created_at: '2026-09-07T00:00:00.000Z',
      },
    });
    expect(inserted).toHaveLength(1);

    const hold = applyTripRealtimeToQueue(inserted, {
      eventType: 'INSERT',
      new: { id: 'h1', status: 'queued', dispatch_status: 'hold', passenger_name: 'Hold' },
    });
    expect(hold).toHaveLength(1);
  });

  it('el snapshot HTTP no reponer un viaje que Realtime acaba de cancelar', () => {
    const now = Date.parse('2026-09-07T00:46:48.000Z');
    const prev = [{
      id: '941f2855-4dcf-41ea-8101-dbffe344c9c3',
      lat: -24.79,
      lng: -65.37,
      updatedAt: '2026-09-07T00:46:40.000Z',
      activeTrip: null,
      activeTripAppliedAt: now,
    }];
    const snapshot = [{
      id: '941f2855-4dcf-41ea-8101-dbffe344c9c3',
      lat: -24.79,
      lng: -65.37,
      updatedAt: '2026-09-07T00:46:40.000Z',
      activeTrip: { status: 'in_progress', passenger_name: 'Pasajero en calle' },
    }];

    const merged = mergeDriversSnapshotWithTripRealtime(prev, snapshot, now + 200);
    expect(merged[0].activeTrip).toBeNull();
  });
});
