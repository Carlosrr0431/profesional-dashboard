import { buildOperatorDemandRows } from '../../src/lib/operatorDemandRows';

const now = new Date('2026-10-31T15:30:00.000Z');

describe('demanda del panel, igual que la del chofer', () => {
  test('un viaje del turno cuenta como hoy y uno viejo como historial', () => {
    const rows = buildOperatorDemandRows({
      fleet: [
        {
          driver_id: 'd1',
          status: 'completed',
          created_at: '2026-10-31T15:10:00.000Z',
          origin_lat: -24.79,
          origin_lng: -65.41,
          notes: '',
        },
        {
          driver_id: 'd1',
          status: 'completed',
          created_at: '2026-10-24T15:10:00.000Z',
          origin_lat: -24.80,
          origin_lng: -65.42,
          notes: '',
        },
      ],
    }, now);

    expect(rows.map((row) => row.kind)).toEqual(['today', 'history']);
  });

  test('la cola y un programado entran, y un viaje sin chofer no', () => {
    const rows = buildOperatorDemandRows({
      fleet: [{
        driver_id: null,
        status: 'completed',
        created_at: '2026-10-31T15:10:00.000Z',
        origin_lat: -24.79,
        origin_lng: -65.41,
      }],
      scheduled: [{
        status: 'scheduled',
        scheduled_for: '2026-10-31T18:00:00.000Z',
        origin_lat: -24.785,
        origin_lng: -65.415,
        origin_address: 'Mitre 100',
        destination_address: 'Balcarce 200',
        notes: '[PASSENGER_APP]\n[SCHEDULED_SOURCE] passenger_app',
      }],
      queued: [{
        status: 'queued',
        created_at: '2026-10-31T15:20:00.000Z',
        origin_lat: -24.788,
        origin_lng: -65.418,
        notes: '',
      }],
    }, now);

    expect(rows.map((row) => row.kind)).toEqual(['scheduled', 'queued']);
    expect(rows[0].pickup_address).toBe('Mitre 100');
  });
});
