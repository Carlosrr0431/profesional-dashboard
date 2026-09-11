/** @jest-environment node */

import {
  pickDriverGps,
  mergeSnapshotKeepingFresherGps,
  gpsTimestampForCoordChange,
  applyDriverLocationRealtime,
  pinMoveDurationMs,
  haversineMeters,
} from '../../src/lib/driverMapGps';

describe('pickDriverGps', () => {
  const now = Date.parse('2026-09-06T20:00:00.000Z');
  const driver = {
    current_lat: -24.79,
    current_lng: -65.41,
    updated_at: '2026-09-06T19:59:58.000Z',
  };

  it('prioriza current_lat si es más nuevo que driver_locations', () => {
    const gps = pickDriverGps({
      lat: -24.78,
      lng: -65.42,
      updated_at: '2026-09-06T19:59:57.000Z',
      speed: 12,
      heading: 90,
    }, driver, now);

    expect(gps.lat).toBe(-24.79);
    expect(gps.lng).toBe(-65.41);
    expect(gps.speed).toBe(12);
    expect(gps.heading).toBe(90);
  });

  it('usa current_lat si driver_locations está viejo o distinto', () => {
    const gps = pickDriverGps({
      lat: -24.70,
      lng: -65.30,
      updated_at: '2026-09-06T19:00:00.000Z',
    }, driver, now);

    expect(gps.lat).toBe(-24.79);
    expect(gps.lng).toBe(-65.41);
  });

  it('cae a current_lat si no hay fila de locations', () => {
    const gps = pickDriverGps(null, driver, now);
    expect(gps.lat).toBe(-24.79);
    expect(gps.lng).toBe(-65.41);
  });

  it('cae a driver_locations si no hay current_lat', () => {
    const gps = pickDriverGps({
      lat: -24.78,
      lng: -65.42,
      updated_at: '2026-09-06T19:59:57.000Z',
    }, { current_lat: null, current_lng: null }, now);

    expect(gps.lat).toBe(-24.78);
    expect(gps.lng).toBe(-65.42);
  });

  it('usa driver_locations si su timestamp es más nuevo', () => {
    const gps = pickDriverGps({
      lat: -24.78,
      lng: -65.42,
      updated_at: '2026-09-06T20:00:02.000Z',
      speed: 9,
    }, driver, now);

    expect(gps.lat).toBe(-24.78);
    expect(gps.lng).toBe(-65.42);
    expect(gps.speed).toBe(9);
  });
});

describe('mergeSnapshotKeepingFresherGps', () => {
  it('no pisa un GPS realtime más nuevo con el poll', () => {
    const prev = [{
      id: 'd1',
      lat: -24.801,
      lng: -65.411,
      updatedAt: '2026-09-06T20:00:05.000Z',
      isAvailable: true,
      isOnline: true,
      fullName: 'Juan',
    }];
    const next = [{
      id: 'd1',
      lat: -24.70,
      lng: -65.30,
      updatedAt: '2026-09-06T19:59:00.000Z',
      isAvailable: true,
      isOnline: true,
      fullName: 'Juan',
      pendingCommission: 10,
    }];

    const merged = mergeSnapshotKeepingFresherGps(prev, next);
    expect(merged[0].lat).toBe(-24.801);
    expect(merged[0].lng).toBe(-65.411);
    expect(merged[0].pendingCommission).toBe(10);
  });

  it('acepta el snapshot si el GPS del poll es más nuevo', () => {
    const prev = [{
      id: 'd1',
      lat: -24.70,
      lng: -65.30,
      updatedAt: '2026-09-06T19:59:00.000Z',
      isAvailable: true,
    }];
    const next = [{
      id: 'd1',
      lat: -24.801,
      lng: -65.411,
      updatedAt: '2026-09-06T20:00:05.000Z',
      isAvailable: true,
    }];

    const merged = mergeSnapshotKeepingFresherGps(prev, next);
    expect(merged[0].lat).toBe(-24.801);
  });
});

describe('applyDriverLocationRealtime', () => {
  const base = [{
    id: 'd1',
    lat: -24.80,
    lng: -65.40,
    speed: 0,
    heading: 0,
    updatedAt: '2026-09-06T20:00:00.000Z',
    isAvailable: true,
    isOnline: true,
  }];

  it('aplica lat/lng del heartbeat aunque speed no cambie', () => {
    const next = applyDriverLocationRealtime(base, {
      driver_id: 'd1',
      lat: -24.801,
      lng: -65.401,
      speed: 0,
      heading: 0,
      updated_at: '2026-09-06T20:00:02.000Z',
    });
    expect(next[0].lat).toBe(-24.801);
    expect(next[0].lng).toBe(-65.401);
    expect(next).not.toBe(base);
  });

  it('no pisa un GPS local más nuevo con un heartbeat viejo', () => {
    const next = applyDriverLocationRealtime(base, {
      driver_id: 'd1',
      lat: -24.70,
      lng: -65.30,
      speed: 11,
      heading: 40,
      updated_at: '2026-09-06T19:59:00.000Z',
    });
    expect(next[0].lat).toBe(-24.80);
    expect(next[0].lng).toBe(-65.40);
    expect(next[0].speed).toBe(11);
  });
});

describe('pinMoveDurationMs', () => {
  it('usa distancia / velocidad en movimiento', () => {
    expect(pinMoveDurationMs(14, 14)).toBe(1000);
    expect(haversineMeters(-24.8, -65.4, -24.8, -65.4)).toBe(0);
  });

  it('acota saltos sin velocidad', () => {
    expect(pinMoveDurationMs(20, 0)).toBe(650);
    expect(pinMoveDurationMs(0, 10)).toBe(0);
  });
});

describe('gpsTimestampForCoordChange', () => {
  it('usa now si el updated_at del chofer no es más nuevo', () => {
    expect(gpsTimestampForCoordChange(
      '2026-09-06T20:00:05.000Z',
      '2026-09-06T19:59:00.000Z',
      '2026-09-06T20:00:06.000Z',
    )).toBe('2026-09-06T20:00:06.000Z');
  });
});
